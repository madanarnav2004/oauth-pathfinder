/**
 * Live generation: app name or URL in, shareable guide out.
 *
 *   resolve → search → read → extract → quote-check → probe → verify → assemble
 *
 * The model writes the draft. Code decides what survives. Every "sourced" claim
 * has to carry a verbatim quote that really appears in a page we fetched; a
 * second model from a different family then checks the quote supports the claim.
 * "tested" can only come from lib/probe.ts. Durations the sources don't state
 * stay null, and the ruler shows fog instead of a made-up number.
 */
import { z } from "zod";
import { extractJson, type LLM } from "./llm";
import { readPage, usable, type Doc, type Searcher } from "./search";
import { assertProbeable, probeEndpoints } from "./probe";
import { withProbe, normalizeQuery } from "./guides";
import { Guide, Span, Status, type Probe, type ProbeRecord, type Source, type Step } from "./schema";

export type EventStage = "resolve" | "search" | "read" | "extract" | "quote-check" | "probe" | "verify" | "done";
export type PipelineEvent = { stage: EventStage; msg: string };

export class PipelineError extends Error {
  constructor(public code: "no_llm" | "no_search" | "no_sources" | "bad_draft" | "llm_failed", message: string) {
    super(message);
  }
}

export type Deps = {
  llm: LLM | null;
  searcher: Searcher | null;
  models: { extract: string; verify: string };
  read?: (url: string) => Promise<string | null>;
  probe?: (p: { authorizeUrl?: string; tokenUrl?: string }) => Promise<Probe[]>;
  now?: () => Date;
  onEvent?: (e: PipelineEvent) => void;
};

export type Result = { kind: "guide"; guide: Guide } | { kind: "no_oauth"; app: string; reason: string };

/* ---------- draft shape: what we ask the model for ---------- */

const Src = z.array(z.string()).max(8).default([]);
const DClaim = z.object({
  text: z.string().max(600),
  status: Status.default("inferred"),
  src: Src,
  quote: z.string().max(400).optional(),
  note: z.string().max(400).optional(),
});
const DStep = z.object({
  id: z.string().max(60).default("step"),
  title: z.string().max(200),
  detail: z.string().max(900).default(""),
  owner: z.enum(["agent", "you", "provider"]).default("you"),
  kind: z.enum(["do", "wait", "gate"]).default("do"),
  minutes: Span.nullable().default(null),
  status: Status.default("inferred"),
  src: Src,
  quote: z.string().max(400).optional(),
  fields: z.array(z.object({ label: z.string().max(60), value: z.string().max(240) })).max(8).optional(),
});
const DBlocker = z.object({
  symptom: z.string().max(300),
  cause: z.string().max(500).default(""),
  fix: z.string().max(500).default(""),
  status: Status.default("inferred"),
  src: Src,
  quote: z.string().max(400).optional(),
});
export const Draft = z.object({
  supportsOAuth: z.boolean().default(true),
  reason: z.string().max(400).optional(),
  name: z.string().max(80),
  label: z.string().max(140).default(""),
  summary: z.string().max(600).default(""),
  difficulty: z.number().int().min(1).max(5).default(3),
  blocker: z.string().max(400).default(""),
  steps: z.array(DStep).min(1).max(14),
  nuances: z.array(DClaim).max(12).default([]),
  blockers: z.array(DBlocker).max(8).default([]),
  handoff: z.object({ agent: z.array(z.string().max(220)).max(8).default([]), you: z.array(z.string().max(220)).max(8).default([]) }).default({ agent: [], you: [] }),
  prepare: z
    .object({
      consoleUrl: z.string().optional(),
      authorizeUrl: z.string().optional(),
      tokenUrl: z.string().optional(),
      redirect: z
        .object({
          https: z.enum(["required", "loopback-http-ok", "unknown"]).default("unknown"),
          exactMatch: z.enum(["yes", "prefix-ok", "unknown"]).default("unknown"),
          maxUris: z.number().int().positive().nullable().default(null),
          rule: z.string().max(400).default("Not stated in the sources we read."),
        })
        .default({ https: "unknown", exactMatch: "unknown", maxUris: null, rule: "Not stated in the sources we read." }),
      scopes: z.array(z.object({ name: z.string().max(100), gated: z.boolean().default(false), note: z.string().max(260).default("") })).max(12).default([]),
      submission: z.array(z.string().max(260)).max(14).default([]),
    })
    .default({ redirect: { https: "unknown", exactMatch: "unknown", maxUris: null, rule: "Not stated in the sources we read." }, scopes: [], submission: [] }),
});
type Draft = z.infer<typeof Draft>;

/* ---------- prompts ---------- */

export const EXTRACT_SYSTEM = `You turn developer documentation into an OAuth app setup guide for ONE app, for a developer who wants their users to connect it.
You know only what the numbered SOURCES say. Reply with a single JSON object and nothing else.

Rules
1. status: "sourced" = a source states it. You MUST set src (e.g. ["S2"]) and quote: an EXACT excerpt, 160 characters or fewer, copied character for character from that source. "inferred" = your own reasoning or general knowledge that no source states. "unknown" = the developer needs to know it and the sources do not say. Never use "tested".
2. Never invent a duration. minutes is null unless a source states a time; then set basis to "stated" (the provider's own docs) or "reported" (anyone else). For kind "do" steps you may estimate minutes with basis "inferred". For kind "wait" and "gate" steps with no source-stated duration, minutes MUST be null.
3. Steps are in order. owner: "you" = needs the developer's login, identity, payment or legal sign-off; "agent" = code, config, drafting, testing; "provider" = their review or approval. kind: "do"; "wait" = elapsed time only; "gate" = a requirement or approval that blocks progress.
4. Include the real gates if the sources mention them: app review, business verification, security assessment, user caps, testing-mode limits, token expiry. If the sources mention NO review at all, add a nuance with status "unknown" saying so. Do not assume none exists.
5. Write plainly: short specific sentences, no marketing words. Dev-coded humor is allowed ONLY in "label" (8 words or fewer).
6. difficulty: 1 self-serve and no review; 2 self-serve with sharp edges; 3 some features behind a gate; 4 review needed to go public; 5 business verification or a paid or legal assessment.
7. prepare.authorizeUrl, tokenUrl, consoleUrl: only if the exact URL appears in a source. Otherwise omit.
8. If the app offers no OAuth to third-party developers, set supportsOAuth to false and say why in reason; the other fields can be minimal.

JSON shape
{"supportsOAuth":true,"reason":"","name":"","label":"","summary":"one or two sentences","difficulty":3,"blocker":"the one thing most likely to bite",
"steps":[{"id":"create","title":"","detail":"","owner":"you|agent|provider","kind":"do|wait|gate","minutes":null,"status":"sourced|inferred|unknown","src":["S1"],"quote":"","fields":[{"label":"","value":""}]}],
"nuances":[{"text":"","status":"","src":[],"quote":"","note":""}],
"blockers":[{"symptom":"exact error or symptom","cause":"","fix":"","status":"","src":[],"quote":""}],
"handoff":{"agent":["what an AI coding agent can do for the developer"],"you":["what only the human can do"]},
"prepare":{"consoleUrl":"","authorizeUrl":"","tokenUrl":"","redirect":{"https":"required|loopback-http-ok|unknown","exactMatch":"yes|prefix-ok|unknown","maxUris":null,"rule":""},"scopes":[{"name":"","gated":false,"note":""}],"submission":["what a review asks for"]}}
Aim for 5 to 9 steps, 3 to 7 nuances, 2 to 5 blockers.`;

export const VERIFY_SYSTEM = `You are a strict fact-checker. For each numbered CLAIM you get the quote it cites. Decide if the quote, read literally, supports the claim as written.
- "supported": the quote states what the claim says.
- "overstated": the quote says something related but the claim is stronger, broader or more specific.
- "unsupported": the quote does not say it.
Reply with one JSON object: {"results":[{"i":0,"verdict":"supported|overstated|unsupported"}]}. No prose.`;

/* ---------- helpers ---------- */

const norm = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();

export function quoteInDoc(quote: string | undefined, docText: string): boolean {
  if (!quote) return false;
  const q = norm(quote).replace(/^[.…\s]+|[.…\s]+$/g, "");
  return q.length >= 12 && norm(docText).includes(q);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "app";
}

/** Official = the host or a /name/ path segment on a known docs host names the app. */
export function classify(url: string, appName: string): "official" | "secondary" {
  try {
    const u = new URL(url);
    const token = appName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    if (!token) return "secondary";
    if (u.hostname.replace(/[^a-z0-9]/g, "").includes(token)) return "official";
    if (/(^|\.)learn\.microsoft\.com$/.test(u.hostname) && u.pathname.toLowerCase().includes(`/${token}/`)) return "official";
    return "secondary";
  } catch {
    return "secondary";
  }
}

function guessName(query: string): { name: string; domain: string } {
  const q = normalizeQuery(query);
  const host = q.includes(".") ? q : "";
  const base = (host || q).split(".")[0].replace(/[^a-z0-9 ]/gi, " ").trim() || q;
  const name = base.replace(/\b\w/g, (c) => c.toUpperCase());
  return { name, domain: host || `${base.replace(/\s+/g, "")}.com` };
}

function urlGrounded(url: string | undefined, docs: Doc[]): string | undefined {
  if (!url) return undefined;
  try {
    const u = assertProbeable(url);
    const bare = `${u.origin}${u.pathname}`.replace(/\/$/, "");
    return docs.some((d) => norm(d.text).includes(norm(bare))) ? bare : undefined;
  } catch {
    return undefined;
  }
}

const RANK: Record<string, number> = { inferred: 0, reported: 1, stated: 2 };

/* ---------- the pipeline ---------- */

export async function generateGuide(query: string, deps: Deps, extraUrls: string[] = []): Promise<Result> {
  const emit = (stage: EventStage, msg: string) => deps.onEvent?.({ stage, msg });
  const now = deps.now?.() ?? new Date();
  const today = now.toISOString().slice(0, 10);
  if (!deps.llm) throw new PipelineError("no_llm", "Live generation needs an LLM. Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN (see .env.example).");

  const { name: guess, domain } = guessName(query);
  emit("resolve", `${guess} (${domain}) isn't in the library, so I'll look it up.`);

  /* search */
  const docs: Doc[] = [];
  const seen = new Set<string>();
  const add = (d: Doc) => {
    const key = d.url.replace(/#.*$/, "").replace(/\/$/, "");
    if (!seen.has(key) && usable(d)) {
      seen.add(key);
      docs.push(d);
    }
  };
  let searched = 0;
  if (deps.searcher) {
    const queries = [
      `${guess} OAuth app registration developer docs create app redirect URI`,
      `${guess} OAuth app review approval verification requirements production access`,
      `${guess} API OAuth scopes restricted permissions access request`,
    ];
    emit("search", `${queries.length} queries on ${deps.searcher.name}.`);
    const settled = await Promise.allSettled(queries.map((q) => deps.searcher!.search(q, 6)));
    for (const s of settled) if (s.status === "fulfilled") s.value.forEach(add);
    searched = queries.length;
  } else if (!extraUrls.length) {
    throw new PipelineError("no_search", "No search provider is configured and no URLs were given. Set EXA_API_KEY or TAVILY_API_KEY, or paste the docs URL.");
  }

  /* read: pages the user pointed at, and thin snippets worth upgrading */
  const read = deps.read ?? ((u: string) => readPage(u));
  let readCount = 0;
  for (const u of extraUrls.slice(0, 3)) {
    const text = await read(u);
    if (text) {
      add({ url: u, title: u, text });
      readCount++;
    }
  }
  const thin = docs.filter((d) => d.text.length < 1800 && classify(d.url, guess) === "official").slice(0, 3);
  if (thin.length) {
    emit("read", `${thin.length} thin official page${thin.length > 1 ? "s" : ""}, reading them in full.`);
    await Promise.all(
      thin.map(async (d) => {
        const text = await read(d.url);
        if (text && text.length > d.text.length) {
          d.text = text;
          readCount++;
        }
      }),
    );
  }

  /* official first, then cap */
  docs.sort((a, b) => Number(classify(b.url, guess) === "official") - Number(classify(a.url, guess) === "official"));
  const picked = docs.slice(0, 8);
  if (!picked.length) throw new PipelineError("no_sources", `I couldn't find readable docs for ${guess}. Paste its developer docs URL and try again.`);
  emit("read", `${picked.length} sources kept (${picked.filter((d) => classify(d.url, guess) === "official").length} official).`);

  /* extract */
  const sourcesBlock = picked.map((d, i) => `[S${i + 1}] ${d.title}\nURL: ${d.url}\n${d.text.slice(0, 4500)}`).join("\n\n---\n\n");
  const user = `APP: ${guess} (${domain})\nTODAY: ${today}\n\nSOURCES\n${sourcesBlock}`;
  emit("extract", `${deps.models.extract} is drafting the guide.`);

  let draft: Draft | null = null;
  let lastErr = "";
  let ask = user;
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    let reply: string;
    try {
      reply = await deps.llm.complete({ model: deps.models.extract, system: EXTRACT_SYSTEM, user: ask, maxTokens: 7000 });
    } catch (e) {
      throw new PipelineError("llm_failed", `The extraction model failed: ${(e as Error).message}`);
    }
    try {
      draft = Draft.parse(extractJson(reply));
    } catch (e) {
      lastErr = (e as Error).message.slice(0, 600);
      ask = `${user}\n\nYour previous reply was not valid. Problem: ${lastErr}\nReply again with ONLY the corrected JSON object.`;
    }
  }
  if (!draft) throw new PipelineError("bad_draft", `The model's draft didn't validate twice in a row. Last problem: ${lastErr}`);

  if (!draft.supportsOAuth) {
    return { kind: "no_oauth", app: draft.name || guess, reason: draft.reason || "The sources say this app offers no OAuth to third-party developers." };
  }

  /* quote-check: the deterministic part */
  const idOf = (raw: string): number => {
    const m = /(\d+)/.exec(raw);
    return m ? Number(m[1]) - 1 : -1;
  };
  let checked = 0;
  let downgraded = 0;
  const cited = new Set<number>();
  const ground = <T extends { status: z.infer<typeof Status>; src: string[]; quote?: string }>(item: T): T & { _idx: number[] } => {
    const idx = [...new Set(item.src.map(idOf).filter((i) => i >= 0 && i < picked.length))];
    let status = item.status === "tested" ? "inferred" : item.status;
    if (status === "sourced") {
      checked++;
      const ok = idx.some((i) => quoteInDoc(item.quote, picked[i].text));
      if (!ok) {
        status = "inferred";
        downgraded++;
      }
    }
    const keep = status === "sourced" ? idx : [];
    keep.forEach((i) => cited.add(i));
    return { ...item, status, _idx: keep } as T & { _idx: number[] };
  };

  const steps0 = draft.steps.map(ground);
  const nuances0 = draft.nuances.map(ground);
  const blockers0 = draft.blockers.map(ground);
  emit("quote-check", `${checked} sourced claims, ${downgraded} had no matching quote and were downgraded.`);

  /* probe: only URLs that appear in a page we read */
  const authorizeUrl = urlGrounded(draft.prepare.authorizeUrl, picked);
  const tokenUrl = urlGrounded(draft.prepare.tokenUrl, picked);
  let probes: Probe[] = [];
  if (authorizeUrl || tokenUrl) {
    emit("probe", `Hitting ${[authorizeUrl && "authorize", tokenUrl && "token"].filter(Boolean).join(" and ")} with a dummy client. No real credentials.`);
    try {
      probes = await (deps.probe ?? ((p) => probeEndpoints(p)))({ authorizeUrl, tokenUrl });
    } catch {
      probes = [];
    }
  } else {
    emit("probe", "No endpoint URL appeared in the sources, so nothing to test.");
  }

  /* verify: a different model reads each quote against its claim */
  type Item = { kind: "step" | "nuance" | "blocker"; i: number; text: string; quote: string };
  const items: Item[] = [];
  steps0.forEach((s, i) => s.status === "sourced" && items.push({ kind: "step", i, text: `${s.title}. ${s.detail}`, quote: s.quote! }));
  nuances0.forEach((s, i) => s.status === "sourced" && items.push({ kind: "nuance", i, text: s.text, quote: s.quote! }));
  blockers0.forEach((s, i) => s.status === "sourced" && items.push({ kind: "blocker", i, text: `${s.symptom}: ${s.cause} ${s.fix}`, quote: s.quote! }));
  const demote = new Set<string>();
  if (items.length) {
    emit("verify", `${deps.models.verify} is checking ${items.length} claims against their quotes.`);
    const body = items.map((it, n) => `CLAIM ${n}: ${it.text.slice(0, 400)}\nQUOTE ${n}: "${it.quote.slice(0, 300)}"`).join("\n\n");
    try {
      const reply = await deps.llm.complete({ model: deps.models.verify, system: VERIFY_SYSTEM, user: body, maxTokens: 2500 });
      const parsed = z.object({ results: z.array(z.object({ i: z.number().int(), verdict: z.string() })) }).parse(extractJson(reply));
      for (const r of parsed.results) {
        const it = items[r.i];
        if (it && r.verdict !== "supported") {
          demote.add(`${it.kind}:${it.i}`);
          downgraded++;
        }
      }
    } catch {
      emit("verify", "The verifier didn't answer; keeping the quote-check result only.");
    }
  }

  /* assemble */
  const retrieved = today;
  const sources: Record<string, Source> = {};
  const idMap = new Map<number, string>();
  [...cited].sort((a, b) => a - b).forEach((i, n) => {
    const id = `s${n + 1}`;
    idMap.set(i, id);
    sources[id] = { title: picked[i].title.slice(0, 160), url: picked[i].url.slice(0, 500), kind: classify(picked[i].url, guess), retrieved };
  });
  const finalStatus = (kind: string, i: number, s: z.infer<typeof Status>) => (demote.has(`${kind}:${i}`) ? "inferred" : s);
  const finalSrc = (kind: string, i: number, idx: number[]) => (demote.has(`${kind}:${i}`) ? [] : idx.map((x) => idMap.get(x)!).filter(Boolean));

  const steps: Step[] = steps0.map((s, i) => {
    const status = finalStatus("step", i, s.status);
    const src = finalSrc("step", i, s._idx);
    let minutes = s.minutes;
    if (minutes) {
      if (minutes.basis !== "inferred" && src.length === 0) minutes = null; // a duration without a source is a guess
      else if (s.kind !== "do" && minutes.basis === "inferred") minutes = null; // we don't guess provider waits
    }
    return { id: slugify(s.id).slice(0, 40) || `s${i + 1}`, title: s.title.slice(0, 120), detail: s.detail.slice(0, 600), owner: s.owner, kind: s.kind, minutes, status, src, fields: s.fields?.slice(0, 8) };
  });

  const sumOf = (list: Step[]) => {
    const withTime = list.filter((s) => s.minutes);
    if (!withTime.length) return null;
    const basis = withTime.reduce<"inferred" | "reported" | "stated">((a, s) => (RANK[s.minutes!.basis] < RANK[a] ? s.minutes!.basis : a), "stated");
    return { lo: withTime.reduce((a, s) => a + s.minutes!.lo, 0), hi: withTime.reduce((a, s) => a + s.minutes!.hi, 0), basis };
  };
  const doSteps = steps.filter((s) => s.kind === "do");
  const waitSteps = steps.filter((s) => s.kind !== "do");
  const handsOn = sumOf(doSteps);
  /** Waits are shown only if every wait/gate step has a sourced number. A partial sum would understate. */
  const wait =
    waitSteps.length === 0
      ? draft.difficulty <= 1
        ? { lo: 0, hi: 0, basis: "inferred" as const }
        : null
      : waitSteps.every((s) => s.minutes)
        ? sumOf(waitSteps)
        : null;

  const prepare = {
    consoleUrl: urlGrounded(draft.prepare.consoleUrl, picked),
    authorizeUrl,
    tokenUrl,
    envPrefix: guess.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16) || "APP",
    redirect: draft.prepare.redirect,
    scopes: draft.prepare.scopes.slice(0, 12).map((s) => ({ name: s.name.slice(0, 80), gated: s.gated, note: s.note.slice(0, 200) })),
    submission: draft.prepare.submission.slice(0, 14).map((s) => s.slice(0, 200)),
  };

  const model = deps.models.extract;
  const assembled = {
    slug: slugify(draft.name || guess),
    name: (draft.name || guess).slice(0, 60),
    domain: domain.slice(0, 80),
    label: (draft.label || `${guess}: read the docs, then read them again`).slice(0, 90),
    summary: draft.summary.slice(0, 360),
    difficulty: draft.difficulty,
    blocker: (draft.blocker || "Not clear from the sources we read.").slice(0, 260),
    handsOn,
    wait,
    steps,
    nuances: nuances0.map((c, i) => ({ text: c.text.slice(0, 420), status: finalStatus("nuance", i, c.status), src: finalSrc("nuance", i, c._idx), note: c.note?.slice(0, 240) })),
    blockers: blockers0.map((b, i) => ({ symptom: b.symptom.slice(0, 200), cause: b.cause.slice(0, 360), fix: b.fix.slice(0, 360), status: finalStatus("blocker", i, b.status), src: finalSrc("blocker", i, b._idx) })),
    handoff: { agent: draft.handoff.agent.map((x) => x.slice(0, 160)), you: draft.handoff.you.map((x) => x.slice(0, 160)) },
    prepare,
    sources,
    generated: { at: now.toISOString().slice(0, 16).replace("T", " ") + " UTC", model: model.split("/").pop()!.slice(0, 80), verifier: deps.models.verify.split("/").pop()!.slice(0, 80), searched, read: picked.length, checked, downgraded },
  };

  let guide = Guide.parse(assembled);
  if (probes.length) {
    const rec: ProbeRecord = { checkedAt: now.toISOString(), results: probes };
    guide = withProbe(guide, rec);
  }
  emit("done", `${guide.steps.length} steps, ${guide.nuances.length} nuances.`);
  return { kind: "guide", guide };
}
