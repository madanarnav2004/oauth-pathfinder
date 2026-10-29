import { z } from "zod";

/**
 * The evidence model. Every claim in a guide carries one of four statuses.
 *  - tested:   we ran something and recorded the response (see lib/probe.ts)
 *  - sourced:  a fetched page says so; the source is linked
 *  - inferred: a reasonable reading, no page states it outright
 *  - unknown:  we looked and could not find out. We say so instead of guessing.
 */
export const Status = z.enum(["tested", "sourced", "inferred", "unknown"]);
export type Status = z.infer<typeof Status>;

export const Source = z.object({
  title: z.string().min(1).max(160),
  url: z.string().url().max(500),
  kind: z.enum(["official", "secondary", "probe"]),
  retrieved: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(240).optional(),
});
export type Source = z.infer<typeof Source>;

/** A span of time in minutes, plus how we know it. */
export const Span = z
  .object({
    lo: z.number().nonnegative(),
    hi: z.number().nonnegative(),
    basis: z.enum(["stated", "reported", "inferred"]),
  })
  .refine((s) => s.hi >= s.lo, "hi must be >= lo");
export type Span = z.infer<typeof Span>;

const SrcIds = z.array(z.string().max(24)).max(6);

export const Claim = z.object({
  text: z.string().min(1).max(420),
  status: Status,
  src: SrcIds,
  note: z.string().max(240).optional(),
});
export type Claim = z.infer<typeof Claim>;

export const Step = z.object({
  id: z.string().max(40),
  title: z.string().min(1).max(120),
  detail: z.string().max(600),
  owner: z.enum(["agent", "you", "provider"]),
  kind: z.enum(["do", "wait", "gate"]),
  minutes: Span.nullable(),
  status: Status,
  src: SrcIds,
  fields: z
    .array(z.object({ label: z.string().max(60), value: z.string().max(240) }))
    .max(8)
    .optional(),
});
export type Step = z.infer<typeof Step>;

export const Blocker = z.object({
  symptom: z.string().min(1).max(200),
  cause: z.string().max(360),
  fix: z.string().max(360),
  status: Status,
  src: SrcIds,
});
export type Blocker = z.infer<typeof Blocker>;

export const Prepare = z.object({
  consoleUrl: z.string().url().max(300).optional(),
  authorizeUrl: z.string().url().max(300).optional(),
  tokenUrl: z.string().url().max(300).optional(),
  envPrefix: z.string().max(24),
  redirect: z.object({
    https: z.enum(["required", "loopback-http-ok", "unknown"]),
    exactMatch: z.enum(["yes", "prefix-ok", "unknown"]),
    maxUris: z.number().int().positive().nullable(),
    rule: z.string().max(300),
  }),
  scopes: z
    .array(z.object({ name: z.string().max(80), gated: z.boolean(), note: z.string().max(200) }))
    .max(12),
  submission: z.array(z.string().max(200)).max(14),
});
export type Prepare = z.infer<typeof Prepare>;

export const Guide = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]{1,40}$/),
    name: z.string().min(1).max(60),
    domain: z.string().max(80),
    /** Dev-coded one-liner. Humor lives in labels only. */
    label: z.string().max(90),
    summary: z.string().max(360),
    /** 1 (hello world) to 5 (legal review). Our judgment, shown as such. */
    difficulty: z.number().int().min(1).max(5),
    /** The single thing most likely to bite. */
    blocker: z.string().max(260),
    handsOn: Span.nullable(),
    wait: Span.nullable(),
    steps: z.array(Step).min(1).max(14),
    nuances: z.array(Claim).max(12),
    blockers: z.array(Blocker).max(8),
    handoff: z.object({
      agent: z.array(z.string().max(160)).max(8),
      you: z.array(z.string().max(160)).max(8),
    }),
    prepare: Prepare,
    sources: z.record(z.string().max(24), Source),
    generated: z
      .object({
        at: z.string().max(40),
        model: z.string().max(80),
        verifier: z.string().max(80),
        searched: z.number().int().nonnegative(),
        read: z.number().int().nonnegative(),
        checked: z.number().int().nonnegative().optional(),
        downgraded: z.number().int().nonnegative().optional(),
      })
      .optional(),
  })
  .superRefine((g, ctx) => {
    const ids = new Set(Object.keys(g.sources));
    const check = (src: string[], status: Status, path: (string | number)[]) => {
      for (const s of src) {
        if (!ids.has(s)) ctx.addIssue({ code: "custom", path, message: `unknown source id "${s}"` });
      }
      if (status === "sourced" && !src.some((s) => g.sources[s]?.kind !== "probe")) {
        ctx.addIssue({ code: "custom", path, message: "sourced claims need a non-probe source" });
      }
      if (status === "tested" && !src.some((s) => g.sources[s]?.kind === "probe")) {
        ctx.addIssue({ code: "custom", path, message: "tested claims need a probe record" });
      }
    };
    g.steps.forEach((s, i) => check(s.src, s.status, ["steps", i]));
    g.nuances.forEach((c, i) => check(c.src, c.status, ["nuances", i]));
    g.blockers.forEach((b, i) => check(b.src, b.status, ["blockers", i]));
  });
export type Guide = z.infer<typeof Guide>;

export const Probe = z.object({
  name: z.string().max(60),
  url: z.string().url().max(300),
  method: z.enum(["GET", "POST"]),
  status: z.number().int(),
  error: z.string().max(120).nullable(),
  location: z.string().max(200).nullable(),
  ms: z.number().nonnegative(),
});
export type Probe = z.infer<typeof Probe>;

export const ProbeRecord = z.object({
  checkedAt: z.string().max(40),
  results: z.array(Probe).max(6),
});
export type ProbeRecord = z.infer<typeof ProbeRecord>;
