import type { Prepare, Probe } from "./schema";

/**
 * "Tested" means we ran something. These probes are the only thing that earns
 * the label. They send a made-up client ID, never a real credential, and they
 * record the status code and the provider's error code, nothing else.
 */
const UA = "pathfinder-probe/0.1 (credential-free OAuth endpoint check)";
const DUMMY = "pathfinder-probe";
const CB = "https://example.invalid/callback";

/** Probe URLs can come from a model's reading of the web. Keep them boring. */
export function assertProbeable(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== "https:") throw new Error("https only");
  if (u.port && u.port !== "443") throw new Error("default port only");
  const h = u.hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".localhost")) throw new Error("private host");
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":") || h.startsWith("[")) throw new Error("ip literal");
  if (!h.includes(".")) throw new Error("bare hostname");
  return u;
}

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t = Date.now();
  const v = await fn();
  return [v, Date.now() - t];
}

function cleanError(body: string): string | null {
  try {
    const j = JSON.parse(body) as Record<string, unknown>;
    const e = j.error ?? j.error_code ?? j.code;
    const val = typeof e === "object" && e !== null ? (e as Record<string, unknown>).type ?? (e as Record<string, unknown>).code : e;
    if (typeof val === "string" || typeof val === "number") {
      const s = String(val).slice(0, 120);
      return /^[\w .:\-]+$/.test(s) ? s : null;
    }
  } catch {
    /* not json */
  }
  return null;
}

export async function probeEndpoints(p: Pick<Prepare, "authorizeUrl" | "tokenUrl">, f: typeof fetch = fetch): Promise<Probe[]> {
  const out: Probe[] = [];
  if (p.authorizeUrl) {
    try {
      const u = assertProbeable(p.authorizeUrl);
      u.searchParams.set("client_id", DUMMY);
      u.searchParams.set("response_type", "code");
      u.searchParams.set("redirect_uri", CB);
      u.searchParams.set("state", "probe");
      const [res, ms] = await timed(() => f(u, { method: "GET", redirect: "manual", headers: { "user-agent": UA }, signal: AbortSignal.timeout(8000) }));
      const loc = res.headers.get("location");
      let location: string | null = null;
      if (loc) {
        try {
          const l = new URL(loc, u);
          location = `${l.host}${l.pathname}`.slice(0, 200);
        } catch {
          location = null;
        }
      }
      out.push({ name: "authorize", url: `${u.origin}${u.pathname}`, method: "GET", status: res.status, error: null, location, ms });
    } catch {
      /* unreachable or refused: record nothing rather than guess */
    }
  }
  if (p.tokenUrl) {
    try {
      const u = assertProbeable(p.tokenUrl);
      const body = new URLSearchParams({ grant_type: "authorization_code", code: DUMMY, client_id: DUMMY, client_secret: DUMMY, redirect_uri: CB });
      const [res, ms] = await timed(() =>
        f(u, { method: "POST", redirect: "manual", headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded", accept: "application/json" }, body, signal: AbortSignal.timeout(8000) }),
      );
      const text = (await res.text()).slice(0, 2000);
      out.push({ name: "token", url: `${u.origin}${u.pathname}`, method: "POST", status: res.status, error: cleanError(text), location: null, ms });
    } catch {
      /* same */
    }
  }
  return out;
}
