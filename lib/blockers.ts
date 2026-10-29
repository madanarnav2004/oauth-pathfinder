import type { Blocker, Guide } from "./schema";

const STOP = new Set("the a an and or of to in on is it for with my i we our when after app oauth error get got getting not can cant cannot does doesnt don't doesn't".split(" "));

function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9_]+/g) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}

/** Error codes and status numbers carry the signal. Count them double. */
function weight(t: string): number {
  return /_/.test(t) || /^\d{3}$/.test(t) ? 3 : 1;
}

export type BlockerMatch = { blocker: Blocker; score: number } | null;

export function matchBlocker(g: Guide, symptom: string): BlockerMatch {
  const q = new Set(tokens(symptom));
  let best: BlockerMatch = null;
  for (const b of g.blockers) {
    const hay = new Set(tokens(`${b.symptom} ${b.symptom} ${b.cause}`));
    let score = 0;
    for (const t of q) if (hay.has(t)) score += weight(t);
    if (score > 0 && (!best || score > best.score)) best = { blocker: b, score };
  }
  return best && best.score >= 3 ? best : null;
}

export function blockerReport(g: Guide, symptom: string) {
  const m = matchBlocker(g, symptom);
  if (m) {
    return {
      matched: true as const,
      app: g.name,
      symptom: m.blocker.symptom,
      cause: m.blocker.cause,
      fix: m.blocker.fix,
      confidence: m.blocker.status,
      note: m.blocker.status === "sourced" ? "Backed by a source in the guide." : "Our reading, not stated outright by the provider.",
    };
  }
  return {
    matched: false as const,
    app: g.name,
    message: `This isn't one of the ${g.blockers.length} failure modes we have for ${g.name}. We would rather say so than guess.`,
    collect: [
      "The exact error string or HTTP status, copied, not paraphrased",
      "Which step of the route you were on",
      "The app's mode or status in the provider console (testing, development, live)",
      "Whether it fails for you, for a test user, or for a real customer",
    ],
    next: g.prepare.consoleUrl ? `Check the app's status page in ${g.prepare.consoleUrl}, then ask the provider's developer support with the list above.` : "Ask the provider's developer support with the list above.",
  };
}
