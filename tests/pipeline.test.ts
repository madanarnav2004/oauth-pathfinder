import { describe, expect, it } from "vitest";
import { generateGuide, quoteInDoc, classify, PipelineError, type Deps } from "../lib/pipeline";
import { extractJson, type LLM } from "../lib/llm";
import { countStatuses } from "../lib/render";
import type { Searcher } from "../lib/search";

const DOC1 = `Registering an app. To register your app, open the Linear developer settings and click New OAuth application. Redirect URLs must use HTTPS in production. ${"Filler about API usage. ".repeat(30)}
The authorization endpoint is https://linear.app/oauth/authorize and the token endpoint is https://api.linear.app/oauth/token. Access tokens last 24 hours.`;
const DOC2 = `Community post: approvals took us about three weeks. ${"padding text for length. ".repeat(40)}`;

const searcher: Searcher = {
  name: "fake",
  async search() {
    return [
      { url: "https://linear.app/developers/oauth-2-0-authentication", title: "OAuth 2.0 authentication", text: DOC1 },
      { url: "https://someblog.example.com/linear-oauth", title: "A blog", text: DOC2 },
    ];
  },
};

const draft = (over: Record<string, unknown> = {}) => ({
  supportsOAuth: true,
  name: "Linear",
  label: "tickets all the way down",
  summary: "Self-serve.",
  difficulty: 2,
  blocker: "Tokens expire in 24 hours.",
  steps: [
    { id: "create", title: "Create an OAuth application", detail: "In developer settings.", owner: "you", kind: "do", minutes: { lo: 5, hi: 15, basis: "inferred" }, status: "sourced", src: ["S1"], quote: "click New OAuth application" },
    { id: "hallucinated", title: "Wait for Linear to approve", detail: "Takes about two weeks.", owner: "provider", kind: "gate", minutes: { lo: 20160, hi: 20160, basis: "stated" }, status: "sourced", src: ["S1"], quote: "Linear approves apps within two weeks" },
    { id: "blog", title: "Expect a wait", detail: "Community says three weeks.", owner: "provider", kind: "wait", minutes: { lo: 30240, hi: 30240, basis: "reported" }, status: "sourced", src: ["S2"], quote: "approvals took us about three weeks" },
  ],
  nuances: [
    { text: "Access tokens last 24 hours.", status: "sourced", src: ["S1"], quote: "Access tokens last 24 hours." },
    { text: "Tested by us!", status: "tested", src: [], quote: "" },
  ],
  blockers: [{ symptom: "invalid_redirect_uri", cause: "Mismatch.", fix: "Match exactly.", status: "inferred", src: [] }],
  handoff: { agent: ["Write the callback"], you: ["Create the app"] },
  prepare: { authorizeUrl: "https://linear.app/oauth/authorize", tokenUrl: "https://api.linear.app/oauth/token", consoleUrl: "https://evil.example.org/settings", redirect: { https: "required", exactMatch: "unknown", maxUris: null, rule: "HTTPS" }, scopes: [{ name: "read", gated: false, note: "" }], submission: [] },
  ...over,
});

function fakeLLM(extractReply: unknown, verifyReply: unknown = { results: [] }, calls: string[] = []): LLM {
  return {
    name: "fake",
    async complete({ model, user }) {
      calls.push(model);
      if (model === "verify") return JSON.stringify(verifyReply);
      calls.push("user:" + user.slice(0, 5));
      return typeof extractReply === "string" ? extractReply : "Here you go:\n```json\n" + JSON.stringify(extractReply) + "\n```";
    },
  };
}

const base = (llm: LLM, over: Partial<Deps> = {}): Deps => ({
  llm,
  searcher,
  models: { extract: "extract", verify: "verify" },
  read: async () => null,
  probe: async () => [{ name: "token", url: "https://api.linear.app/oauth/token", method: "POST", status: 400, error: "invalid_client", location: null, ms: 80 }],
  now: () => new Date("2026-10-29T10:00:00Z"),
  ...over,
});

describe("generateGuide", () => {
  it("downgrades a sourced claim whose quote isn't on the page", async () => {
    const r = await generateGuide("linear.app", base(fakeLLM(draft())));
    expect(r.kind).toBe("guide");
    if (r.kind !== "guide") return;
    const bad = r.guide.steps.find((s) => s.id === "hallucinated")!;
    expect(bad.status).toBe("inferred");
    expect(bad.src).toEqual([]);
    expect(r.guide.steps.find((s) => s.id === "create")!.status).toBe("sourced");
  });

  it("drops a duration that has no source behind it, so the wait stays fogged", async () => {
    const r = await generateGuide("linear.app", base(fakeLLM(draft())));
    if (r.kind !== "guide") throw new Error("expected guide");
    expect(r.guide.steps.find((s) => s.id === "hallucinated")!.minutes).toBeNull();
    // the blog step has a real quote, so it keeps a "reported" duration, but one unsourced wait step makes the total unknown
    expect(r.guide.steps.find((s) => s.id === "blog")!.minutes?.basis).toBe("reported");
    expect(r.guide.wait).toBeNull();
  });

  it("never lets the model mint a 'tested' claim, only the probe can", async () => {
    const r = await generateGuide("linear.app", base(fakeLLM(draft()), { probe: async () => [] }));
    if (r.kind !== "guide") throw new Error("expected guide");
    expect(countStatuses(r.guide).tested).toBe(0);
    const r2 = await generateGuide("linear.app", base(fakeLLM(draft())));
    if (r2.kind !== "guide") throw new Error("expected guide");
    expect(countStatuses(r2.guide).tested).toBe(1);
  });

  it("probes only URLs that appear in a fetched page", async () => {
    let probed: unknown = null;
    const d = draft({ prepare: { ...draft().prepare, authorizeUrl: "https://made-up.example.com/authorize", tokenUrl: "https://api.linear.app/oauth/token" } });
    await generateGuide("linear.app", base(fakeLLM(d), { probe: async (p) => ((probed = p), []) }));
    expect(probed).toEqual({ authorizeUrl: undefined, tokenUrl: "https://api.linear.app/oauth/token" });
  });

  it("drops a console URL the sources never mention", async () => {
    const r = await generateGuide("linear.app", base(fakeLLM(draft())));
    if (r.kind !== "guide") throw new Error("expected guide");
    expect(r.guide.prepare.consoleUrl).toBeUndefined();
  });

  it("lets the verifier demote an overstated claim", async () => {
    const r = await generateGuide("linear.app", base(fakeLLM(draft(), { results: [{ i: 2, verdict: "overstated" }] } /* items: create step, blog step, then the 24 hours nuance */)));
    if (r.kind !== "guide") throw new Error("expected guide");
    expect(r.guide.nuances.find((n) => n.text.includes("24 hours"))!.status).toBe("inferred");
  });

  it("classifies hosts honestly", () => {
    expect(classify("https://docs.github.com/en/apps", "GitHub")).toBe("official");
    expect(classify("https://learn.microsoft.com/en-us/linkedin/shared/x", "LinkedIn")).toBe("official");
    expect(classify("https://nango.dev/docs/slack", "Slack")).toBe("secondary");
  });

  it("recovers from one malformed reply", async () => {
    let n = 0;
    const llm: LLM = {
      name: "flaky",
      async complete({ model }) {
        if (model === "verify") return JSON.stringify({ results: [] });
        return n++ === 0 ? "sorry, here is some prose and no json" : JSON.stringify(draft());
      },
    };
    const r = await generateGuide("linear.app", base(llm));
    expect(r.kind).toBe("guide");
  });

  it("returns no_oauth instead of a fake guide", async () => {
    const r = await generateGuide("acme.example", base(fakeLLM({ supportsOAuth: false, reason: "Only API keys are offered.", name: "Acme", steps: [{ title: "n/a" }] })));
    expect(r).toMatchObject({ kind: "no_oauth", reason: "Only API keys are offered." });
  });

  it("fails loudly and helpfully without an LLM or search", async () => {
    await expect(generateGuide("x.com", base(null as unknown as LLM, { llm: null }))).rejects.toMatchObject({ code: "no_llm" });
    await expect(generateGuide("x.com", base(fakeLLM(draft()), { searcher: null }))).rejects.toBeInstanceOf(PipelineError);
  });

  it("emits progress events in order", async () => {
    const stages: string[] = [];
    await generateGuide("linear.app", base(fakeLLM(draft()), { onEvent: (e) => stages.push(e.stage) }));
    expect(stages[0]).toBe("resolve");
    expect(stages).toContain("quote-check");
    expect(stages.at(-1)).toBe("done");
  });
});

describe("helpers", () => {
  it("quote matching ignores case, whitespace and curly quotes", () => {
    expect(quoteInDoc("Access  tokens LAST 24 hours", "x. Access tokens last 24 hours. y")).toBe(true);
    expect(quoteInDoc("it’s fine to do this", "It's fine to do this")).toBe(true);
    expect(quoteInDoc("too short", "too short")).toBe(false);
  });
  it("extractJson survives fences, prose and braces inside strings", () => {
    expect(extractJson('blah ```json\n{"a":"}{","b":[1,2]}\n``` trailing')).toEqual({ a: "}{", b: [1, 2] });
    expect(() => extractJson("nope")).toThrow();
  });
});
