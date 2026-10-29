import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServer } from "@/lib/mcp";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: Request): Promise<Response> {
  const origin = new URL(req.url).origin;
  const handler = createMcpHandler(() => buildServer(origin));
  const res = await handler.fetch(req);
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-expose-headers", "mcp-protocol-version, mcp-session-id");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-allow-headers": "content-type, accept, mcp-protocol-version, mcp-session-id, authorization",
    },
  });
}
