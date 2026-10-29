import { RAW } from "../data/guides/index";
import probesRaw from "../data/probes.json";
import { Guide, Probe, ProbeRecord, type Source } from "./schema";

export const GUIDES: Guide[] = RAW.map((g) => Guide.parse(g));

const PROBES: Record<string, ProbeRecord> = {};
for (const [slug, rec] of Object.entries(probesRaw as Record<string, unknown>)) {
  const parsed = ProbeRecord.safeParse(rec);
  if (parsed.success) PROBES[slug] = parsed.data;
}

export function describeProbe(p: Probe): string {
  const u = new URL(p.url);
  const where = `${u.host}${u.pathname}`;
  if (p.method === "GET") {
    const to = p.location ? ` to ${p.location}` : "";
    return `GET ${where} with a dummy client returned HTTP ${p.status}${to}.`;
  }
  const err = p.error ? ` (${p.error})` : "";
  return `POST ${where} with dummy credentials returned HTTP ${p.status}${err} in ${p.ms} ms.`;
}

/** Fold probe results into a guide as `tested` claims. Nothing is tested without a record. */
export function withProbe(g: Guide, rec?: ProbeRecord): Guide {
  if (!rec || rec.results.length === 0) return g;
  const src: Source = {
    title: `Live probe, ${rec.checkedAt.slice(0, 10)}`,
    url: rec.results[0].url,
    kind: "probe",
    retrieved: rec.checkedAt.slice(0, 10),
    note: "Dummy client ID and secret. No real credentials were sent.",
  };
  const claims = rec.results.map((p) => ({ text: describeProbe(p), status: "tested" as const, src: ["probe"] }));
  const nuances = g.nuances.filter((claim) => !claim.src.includes("probe"));
  return { ...g, sources: { ...g.sources, probe: src }, nuances: [...claims, ...nuances].slice(0, 12) };
}

export function getGuide(slug: string): Guide | null {
  const g = GUIDES.find((x) => x.slug === slug);
  return g ? withProbe(g, PROBES[g.slug]) : null;
}

export function listGuides(): Guide[] {
  return GUIDES.map((g) => withProbe(g, PROBES[g.slug]));
}

const ALIASES: Record<string, string> = {
  gmail: "google", "google calendar": "google", gcal: "google", "google drive": "google", gdrive: "google",
  youtube: "google", gsuite: "google", "google workspace": "google", googleapis: "google",
  facebook: "meta", instagram: "meta", whatsapp: "meta", fb: "meta", threads: "meta", messenger: "meta",
  git: "github", gh: "github", "slack api": "slack", "linked in": "linkedin",
};

export function normalizeQuery(q: string): string {
  let s = q.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[/?#].*$/, "");
  return s.replace(/\s+/g, " ");
}

/** Map a name or URL to a library guide, or null if we haven't seen it. */
export function resolveApp(query: string): Guide | null {
  const q = normalizeQuery(query);
  if (!q) return null;
  const alias = ALIASES[q];
  if (alias) return getGuide(alias);
  for (const g of GUIDES) {
    const host = g.domain.toLowerCase();
    if (q === g.slug || q === g.name.toLowerCase() || q === host) return getGuide(g.slug);
    if (q.endsWith("." + host) || host.endsWith("." + q)) return getGuide(g.slug);
    if (q.split(".")[0] === g.slug) return getGuide(g.slug);
  }
  return null;
}
