import { GUIDES, describeProbe } from "@/lib/guides";
import { probeEndpoints } from "@/lib/probe";
import { allow, clientKey } from "@/lib/limit";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Library guides only: the URLs come from our own data, never from the request. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const g = GUIDES.find((x) => x.slug === slug);
  if (!g) return Response.json({ error: "Unknown guide." }, { status: 404 });
  if (!allow(`probe:${clientKey(req)}`, 30)) return Response.json({ error: "Slow down a little." }, { status: 429 });
  const results = await probeEndpoints(g.prepare);
  if (!results.length) return Response.json({ error: `${g.name}'s endpoints didn't answer from the server, so nothing is recorded as tested.` });
  return Response.json({ checkedAt: new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC", results, lines: results.map(describeProbe) });
}
