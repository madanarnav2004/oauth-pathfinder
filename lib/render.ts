/**
 * One renderer, two surfaces. The website and the MCP App card both call
 * renderGuide(), so what a developer sees in their agent is what the page shows.
 * Pure string output, no DOM, no node imports: it runs on the server and inside
 * the sandboxed card iframe. Guides can come from an LLM, so everything is escaped.
 *
 * Design rule, applied throughout: mark the exception, never the default.
 * Most claims are sourced and most steps are ordinary work, so those get no
 * badge at all. A badge means "this one is different" and is worth your eye.
 */
import type { Guide, Status, Step, Source, Span } from "./schema";
import { fmtSpan, fmtExact } from "./time";

export function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeUrl(u: string): string {
  try {
    const url = new URL(u);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "#";
  } catch {
    return "#";
  }
}

export const DIFFICULTY = ["", "hello world", "needs a ticket", "behind a gate", "the gauntlet", "legal review"] as const;

/** Durations as a person would say them out loud. */
export function inWords(span: Span | null, kind: "work" | "wait"): string {
  if (!span) return kind === "work" ? "unknown effort" : "an unknown wait";
  if (span.hi === 0) return kind === "work" ? "no setup" : "no review";
  const mid = (span.lo + span.hi) / 2;
  const d = 1440;
  const w =
    mid <= 75 ? "an hour" : mid <= 300 ? "an afternoon" : mid <= 960 ? "half a day" : mid <= 3 * d ? "a couple of days" : mid <= 12 * d ? "a week or two" : mid <= 50 * d ? "a month or so" : "months";
  return kind === "work" ? `${w} of setup` : `${w} of waiting`;
}

/** The answer in one sentence. Hand-written per guide; composed when absent. */
export function verdict(g: Guide): string {
  if (g.verdict) return g.verdict;
  const work = inWords(g.handsOn, "work");
  if (g.wait && g.wait.hi === 0) return `${work[0].toUpperCase()}${work.slice(1)}, and no review to wait for.`;
  if (!g.wait) return `${work[0].toUpperCase()}${work.slice(1)}, then a wait nobody publishes a number for.`;
  return `${work[0].toUpperCase()}${work.slice(1)}, then ${inWords(g.wait, "wait")}.`;
}

/** Naming the provider beats "them": it says exactly who you are waiting on. */
function owner(s: Step, g: Guide): string {
  return s.owner === "agent" ? "an agent" : s.owner === "you" ? "you" : g.name.split(" (")[0];
}

/** Stable 1-based numbering so a superscript in the text finds its source below. */
function sourceIndex(g: Guide): Map<string, number> {
  return new Map(Object.keys(g.sources).map((id, i) => [id, i + 1]));
}

function cite(g: Guide, ids: string[], idx: Map<string, number>): string {
  const ns = ids.map((id) => idx.get(id)).filter((n): n is number => Boolean(n));
  if (!ns.length) return "";
  return `<sup class="pf-cite">${ns.map((n) => `<a href="#src-${n}">${n}</a>`).join("")}</sup>`;
}

/**
 * A badge only when the claim is NOT a plain sourced fact. Sourced is the
 * baseline; labelling it on every row would be noise with no signal.
 */
function flag(status: Status): string {
  if (status === "sourced") return "";
  const text = status === "tested" ? "we ran this" : status === "inferred" ? "our read" : "not documented";
  const why =
    status === "tested"
      ? "We called the endpoint and recorded what came back"
      : status === "inferred"
        ? "A reasonable reading. No page we found states it"
        : "We looked for this and could not find it";
  return `<span class="pf-flag f-${status}" title="${esc(why)}">${text}</span>`;
}

/**
 * Hands-on and waiting on one linear strip. Linear, not log: when the setup is
 * a sliver next to months of review, that sliver IS the finding. An unknown
 * wait runs off the right edge rather than being given a made-up length.
 */
export function renderStrip(g: Guide): string {
  const work = g.handsOn?.hi ?? 0;
  const wait = g.wait?.hi ?? 0;
  const left = `<span class="t-work">${esc(g.handsOn ? fmtSpan(g.handsOn) : "unknown")} of setup</span>`;

  if (!g.wait) {
    return `<figure class="pf-strip open" aria-label="Setup takes ${esc(g.handsOn ? fmtSpan(g.handsOn) : "an unknown time")}; the wait is undocumented">
      <div class="bar"><span class="work" style="width:12%"></span><span class="unknown"></span></div>
      <figcaption>${left}<span class="t-wait fog">then a wait nobody documents</span></figcaption>
    </figure>`;
  }
  if (wait === 0) {
    return `<figure class="pf-strip" aria-label="Setup only, no review">
      <div class="bar"><span class="work" style="width:100%"></span></div>
      <figcaption>${left}<span class="t-wait">no review to wait for</span></figcaption>
    </figure>`;
  }
  const pct = Math.max((work / (work + wait)) * 100, 1.2);
  return `<figure class="pf-strip" aria-label="Setup ${esc(fmtExact(g.handsOn ?? { lo: 0, hi: 0 }))}, waiting ${esc(fmtExact(g.wait))}">
    <div class="bar"><span class="work" style="width:${pct.toFixed(2)}%"></span><span class="wait"></span></div>
    <figcaption>${left}<span class="t-wait">${esc(fmtSpan(g.wait))} of waiting</span></figcaption>
  </figure>`;
}

export function renderAnswer(g: Guide): string {
  // The strip's caption already carries both durations, so this line adds only
  // what it doesn't: how hard this one is compared with the others.
  return `<p class="pf-verdict">${esc(verdict(g))}</p>
    ${renderStrip(g)}
    <p class="pf-facts">${esc(DIFFICULTY[g.difficulty])} &nbsp;·&nbsp; ${g.difficulty} of 5 for difficulty</p>`;
}

export function renderRoute(g: Guide, idx = sourceIndex(g)): string {
  const items = g.steps
    .map((s, i) => {
      const meta = [owner(s, g), s.minutes ? fmtSpan(s.minutes) : null].filter(Boolean).join(" · ");
      const fields = s.fields?.length
        ? `<dl class="fields">${s.fields.map((f) => `<div><dt>${esc(f.label)}</dt><dd><code>${esc(f.value)}</code></dd></div>`).join("")}</dl>`
        : "";
      const tag = s.kind === "gate" ? `<span class="pf-gate">blocks you</span>` : s.kind === "wait" ? `<span class="pf-gate">just waiting</span>` : "";
      return `<li class="step k-${s.kind} o-${s.owner}">
        <span class="n">${i + 1}</span>
        <h3>${esc(s.title)} ${tag}</h3>
        <p>${esc(s.detail)}${cite(g, s.src, idx)}</p>${fields}
        <p class="meta">${esc(meta)} ${flag(s.status)}</p>
      </li>`;
    })
    .join("");
  return `<ol class="pf-route">${items}</ol>`;
}

export function renderNuances(g: Guide, idx = sourceIndex(g)): string {
  if (!g.nuances.length) return "";
  return `<ul class="pf-claims">${g.nuances
    .map((c) => `<li><p>${esc(c.text)}${cite(g, c.src, idx)} ${flag(c.status)}</p>${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}</li>`)
    .join("")}</ul>`;
}

export function renderBlockers(g: Guide, idx = sourceIndex(g)): string {
  if (!g.blockers.length) return "";
  return `<dl class="pf-blockers">${g.blockers
    .map(
      (b) => `<div><dt>${esc(b.symptom)}</dt><dd>${esc(b.cause)} <b>Fix:</b> ${esc(b.fix)}${cite(g, b.src, idx)} ${flag(b.status)}</dd></div>`,
    )
    .join("")}</dl>`;
}

export function renderHandoff(g: Guide): string {
  const col = (title: string, items: string[]) =>
    `<div><h4>${title}</h4><ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul></div>`;
  return `<div class="pf-handoff">${col("An agent can", g.handoff.agent)}${col("Only you can", g.handoff.you)}</div>`;
}

export function countStatuses(g: Guide): Record<Status, number> {
  const out: Record<Status, number> = { tested: 0, sourced: 0, inferred: 0, unknown: 0 };
  for (const s of g.steps) out[s.status]++;
  for (const c of g.nuances) out[c.status]++;
  for (const b of g.blockers) out[b.status]++;
  return out;
}

/** The evidence summary as a sentence, because a stacked bar needs a legend and a sentence doesn't. */
export function evidenceLine(g: Guide): string {
  const c = countStatuses(g);
  const total = c.tested + c.sourced + c.inferred + c.unknown;
  const n = (x: number, one: string, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;
  const parts: string[] = [];
  if (c.sourced) parts.push(`${c.sourced} come from pages we fetched and linked`);
  if (c.tested) parts.push(`${n(c.tested, "is", "are")} something we ran ourselves`);
  if (c.inferred) parts.push(`${n(c.inferred, "is", "are")} our own reading`);
  if (c.unknown) parts.push(`${n(c.unknown, "is", "are")} a question we could not answer`);
  return `Of ${n(total, "claim")} in this guide, ${parts.join(", ")}.`;
}

export function renderSources(g: Guide, idx = sourceIndex(g)): string {
  const rows = Object.entries(g.sources)
    .map(([id, s]) => {
      const n = idx.get(id);
      return `<li id="src-${n}"><span class="n">${n}</span><span><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="pf-meta">${esc(s.kind === "probe" ? "we called it" : s.kind)} · read ${esc(s.retrieved)}</span>${s.note ? `<span class="note">${esc(s.note)}</span>` : ""}</span></li>`;
    })
    .join("");
  return `<ol class="pf-sources">${rows}</ol>`;
}

/** The whole guide. `compact` is the in-chat card: the answer and the route, nothing else. */
export function renderGuide(g: Guide, opts: { compact?: boolean } = {}): string {
  const idx = sourceIndex(g);
  // The summary and the verdict said overlapping things. The verdict is the
  // answer, so it leads; the summary survives in markdown and the API.
  const head = `<header class="pf-head"><p class="label">${esc(g.label)}</p><h1>${esc(g.name)}</h1></header>`;

  if (opts.compact) {
    return `<article class="pf-guide compact">${head}${renderAnswer(g)}
      <h2>The route</h2>${renderRoute(g, idx)}
      <p class="pf-evidence">${esc(evidenceLine(g))}</p></article>`;
  }

  const gen = g.generated
    ? `<p class="pf-meta pf-gen">Researched live on ${esc(g.generated.at)} by ${esc(g.generated.model)}, checked against ${esc(g.generated.read)} pages${g.generated.downgraded ? `, with ${esc(g.generated.downgraded)} claim(s) downgraded for lacking support` : ""}.</p>`
    : "";

  return `<article class="pf-guide">${head}${gen}${renderAnswer(g)}
    <h2>What will bite you</h2><p class="pf-bite">${esc(g.blocker)}</p>
    <h2>The route</h2>${renderRoute(g, idx)}
    <h2>Who does what</h2>${renderHandoff(g)}
    ${g.nuances.length ? `<h2>Things that change your plan</h2>${renderNuances(g, idx)}` : ""}
    ${g.blockers.length ? `<h2>If it breaks</h2>${renderBlockers(g, idx)}` : ""}
    <h2>How sure we are</h2><p class="pf-evidence">${esc(evidenceLine(g))}</p>
    ${renderSources(g, idx)}
  </article>`;
}

export function guideToMarkdown(g: Guide): string {
  const span = (s: Span | null) => (s ? (s.hi === 0 ? "none" : `${fmtSpan(s)} (${s.basis})`) : "unknown");
  const L: string[] = [];
  L.push(`# ${g.name}: OAuth app setup`, "", `**${verdict(g)}**`, "", g.summary, "");
  L.push(`- difficulty: ${g.difficulty}/5, ${DIFFICULTY[g.difficulty]}`, `- hands-on: ${span(g.handsOn)}`, `- waiting: ${span(g.wait)}`, "");
  L.push(`## What will bite you`, "", g.blocker, "", "## The route", "");
  g.steps.forEach((s, i) => {
    const meta = [owner(s, g), s.kind !== "do" ? s.kind : null, s.minutes ? fmtSpan(s.minutes) : null].filter(Boolean).join(" · ");
    L.push(`${i + 1}. **${s.title}** — ${meta}${s.status === "sourced" ? "" : ` [${s.status}]`}`);
    L.push(`   ${s.detail}`);
    s.fields?.forEach((f) => L.push(`   - ${f.label}: \`${f.value}\``));
  });
  L.push("", "## An agent can", ...g.handoff.agent.map((x) => `- ${x}`));
  L.push("", "## Only you can", ...g.handoff.you.map((x) => `- ${x}`), "");
  if (g.nuances.length) L.push("## Things that change your plan", ...g.nuances.map((c) => `- ${c.text}${c.status === "sourced" ? "" : ` [${c.status}]`}`), "");
  if (g.blockers.length) {
    L.push("## If it breaks");
    g.blockers.forEach((b) => L.push(`- **${b.symptom}** — ${b.cause} Fix: ${b.fix}`));
    L.push("");
  }
  L.push("## How sure we are", "", evidenceLine(g), "", "## Sources");
  L.push(...Object.values(g.sources).map((s, i) => `${i + 1}. [${s.title}](${s.url}) (${s.kind}, read ${s.retrieved})`));
  return L.join("\n") + "\n";
}
