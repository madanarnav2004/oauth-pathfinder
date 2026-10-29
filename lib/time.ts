/**
 * Time, in units a developer already thinks in.
 * One scale, log-spaced: commit < coffee < lunch < day < sprint < quarter.
 * Minutes are calendar minutes; a "day" is 24h because waits are elapsed time.
 */
export type Unit = { id: string; min: number; one: string; many: string };

export const UNITS: Unit[] = [
  { id: "commit", min: 5, one: "commit", many: "commits" },
  { id: "coffee", min: 30, one: "coffee", many: "coffees" },
  { id: "lunch", min: 180, one: "lunch", many: "lunches" },
  { id: "day", min: 1440, one: "day", many: "days" },
  { id: "sprint", min: 20160, one: "sprint", many: "sprints" },
  { id: "quarter", min: 129600, one: "quarter", many: "quarters" },
];

export type Minutes = { lo: number; hi: number };

function round(n: number): number {
  if (n >= 10) return Math.round(n);
  return Math.round(n * 2) / 2; // halves are enough resolution for a range
}

function pretty(n: number): string {
  if (n === 0.5) return "½";
  const whole = Math.floor(n);
  return n - whole === 0.5 ? `${whole}½` : String(n);
}

/** Pick the largest unit that fits the low end, so counts start at 1 or more. */
export function pickUnit(lo: number): Unit {
  let chosen = UNITS[0];
  for (const u of UNITS) if (u.min <= lo) chosen = u;
  return chosen;
}

/** "1–2 coffees", "7–14 days", "< 1 commit". */
export function fmtSpan(span: Minutes): string {
  const { lo, hi } = span;
  if (hi < UNITS[0].min) return "< 1 commit";
  const u = pickUnit(lo);
  const a = round(lo / u.min);
  const b = round(hi / u.min);
  const noun = b === 1 ? u.one : u.many;
  if (a === b) return `~${pretty(b)} ${noun}`;
  return `${pretty(a)}–${pretty(b)} ${noun}`;
}

/** The same span in plain minutes/hours/days, for tooltips. */
export function fmtExact(span: Minutes): string {
  const one = (m: number) => {
    if (m < 90) return `${Math.round(m)} min`;
    if (m < 1440 * 2) return `${round(m / 60)} h`;
    return `${round(m / 1440)} d`;
  };
  return span.lo === span.hi ? one(span.lo) : `${one(span.lo)} to ${one(span.hi)}`;
}

/** Position on the ruler, 0 to 1, log scale from 1 minute to ~6 months. */
export const RULER_MAX = 259200; // 180 days
export function rulerPos(minutes: number): number {
  const m = Math.min(Math.max(minutes, 1), RULER_MAX);
  return Math.log10(m) / Math.log10(RULER_MAX);
}

export function sumSpans(spans: Minutes[]): Minutes | null {
  if (spans.length === 0) return null;
  return spans.reduce((a, s) => ({ lo: a.lo + s.lo, hi: a.hi + s.hi }), { lo: 0, hi: 0 });
}
