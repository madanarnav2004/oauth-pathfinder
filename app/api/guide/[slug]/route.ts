import { getGuide } from "@/lib/guides";
import { guideToMarkdown } from "@/lib/render";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await params).slug);
  if (!g) return Response.json({ error: "Unknown guide." }, { status: 404 });
  const fmt = new URL(req.url).searchParams.get("format");
  if (fmt === "md") return new Response(guideToMarkdown(g), { headers: { "content-type": "text/markdown; charset=utf-8" } });
  return Response.json(g);
}
