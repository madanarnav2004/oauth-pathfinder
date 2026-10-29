import { deflateRawSync, inflateRawSync } from "node:zlib";
import { Guide } from "./schema";

/**
 * Generated guides have no database. The guide itself travels in the link:
 * JSON, deflated, base64url. A typical guide is a few KB, which fits in a URL
 * and survives being pasted into Slack. Decoding re-validates everything, so a
 * hand-edited link can't smuggle in a malformed guide.
 */
export function encodeGuide(guide: Guide): string {
  const json = JSON.stringify(guide);
  return deflateRawSync(Buffer.from(json, "utf8"), { level: 9 }).toString("base64url");
}

export function decodeGuide(token: string): Guide | null {
  try {
    if (token.length > 60_000) return null;
    const raw = inflateRawSync(Buffer.from(token, "base64url"), { maxOutputLength: 200_000 });
    const parsed = Guide.safeParse(JSON.parse(raw.toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function shareUrl(base: string, guide: Guide, library: boolean): string {
  const root = base.replace(/\/$/, "");
  return library ? `${root}/g/${guide.slug}` : `${root}/g/live?d=${encodeGuide(guide)}`;
}
