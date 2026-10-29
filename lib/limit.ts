/** Best-effort throttle for the live endpoints. In-memory, so per instance. Enough to stop a loop, not an attacker. */
const hits = new Map<string, number[]>();

export function allow(key: string, max: number, windowMs = 3_600_000, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear();
  return true;
}

export function clientKey(req: Request): string {
  return (req.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
}
