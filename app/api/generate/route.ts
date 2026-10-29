import { lookupGuide } from "@/lib/service";
import { PipelineError } from "@/lib/pipeline";
import { allow, clientKey } from "@/lib/limit";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const enc = new TextEncoder();
  const limit = Number(process.env.LIVE_PER_HOUR ?? 12);
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
      try {
        if (q.length < 2) throw new PipelineError("no_sources", "Give me an app name or a website.");
        if (!allow(`gen:${clientKey(req)}`, limit) || !allow("gen:global", limit * 8)) {
          throw new PipelineError("no_sources", "That's a lot of live research for one hour. Try again later, or use a library app.");
        }
        const r = await lookupGuide(q, { origin: url.origin, onEvent: (e) => send({ type: "event", ...e }) });
        if (r.kind === "no_oauth") send({ type: "no_oauth", app: r.app, reason: r.reason });
        else send({ type: "result", url: r.shareUrl, library: r.library });
      } catch (e) {
        const code = e instanceof PipelineError ? e.code : "error";
        send({ type: "error", code, message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" },
  });
}
