import { describe, expect, it } from "vitest";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { buildServer, CARD_URI } from "../lib/mcp";

const handler = createMcpHandler(() => buildServer("https://pathfinder.test"));

async function rpc(method: string, params: unknown = {}, id = 1) {
  const res = await handler.fetch(
    new Request("https://pathfinder.test/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
    }),
  );
  const raw = await res.text();
  const body = raw.startsWith("event:") || raw.includes("\ndata:") ? raw.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).pop()! : raw;
  return JSON.parse(body);
}

const init = { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } };

describe("mcp server", () => {
  it("initializes", async () => {
    const r = await rpc("initialize", init);
    expect(r.result.serverInfo.name).toBe("pathfinder");
  });

  it("lists five tools and only one carries a UI resource", async () => {
    const r = await rpc("tools/list");
    const tools = r.result.tools as { name: string; _meta?: { ui?: { resourceUri?: string } } }[];
    expect(tools.map((t) => t.name).sort()).toEqual(["generate_oauth_guide", "get_oauth_guide", "prepare_setup", "render_guide_card", "report_blocker"]);
    const withUi = tools.filter((t) => t._meta?.ui?.resourceUri);
    expect(withUi.map((t) => t.name)).toEqual(["render_guide_card"]);
    expect(withUi[0]._meta!.ui!.resourceUri).toBe(CARD_URI);
  });

  it("serves the card as a self-contained MCP App resource", async () => {
    const r = await rpc("resources/read", { uri: CARD_URI });
    const c = r.result.contents[0];
    expect(c.mimeType).toBe("text/html;profile=mcp-app");
    expect(c.text).toContain("<div id=\"root\">");
    expect(c.text).not.toMatch(/<script[^>]+src=/);
    expect(c.text).not.toMatch(/<link[^>]+href=/);
  });

  it("render_guide_card returns structured content for the card plus text for everyone else", async () => {
    const r = await rpc("tools/call", { name: "render_guide_card", arguments: { app: "google" } });
    expect(r.result.structuredContent.guide.slug).toBe("google");
    expect(r.result.structuredContent.shareUrl).toBe("https://pathfinder.test/g/google");
    expect(r.result.content[0].text).toContain("the gauntlet");
  });

  it("get_oauth_guide says so when an app is unknown", async () => {
    const r = await rpc("tools/call", { name: "get_oauth_guide", arguments: { app: "linear.app" } });
    expect(r.result.content[0].text).toContain("generate_oauth_guide");
  });

  it("generate_oauth_guide fails helpfully with no LLM configured", async () => {
    const saved = { ...process.env };
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
    delete process.env.CLOUDFLARE_API_TOKEN;
    delete process.env.LLM_BASE_URL;
    const r = await rpc("tools/call", { name: "generate_oauth_guide", arguments: { app: "linear.app" } });
    Object.assign(process.env, saved);
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/CLOUDFLARE_ACCOUNT_ID/);
  });

  it("prepare_setup and report_blocker are deterministic", async () => {
    const p = await rpc("tools/call", { name: "prepare_setup", arguments: { app: "github", origins: ["http://localhost:3000", "https://app.example.com"] } });
    expect(p.result.structuredContent.plan.env).toContain("GITHUB_CLIENT_ID=");
    const b = await rpc("tools/call", { name: "report_blocker", arguments: { app: "slack", symptom: "bad_redirect_uri" } });
    expect(b.result.structuredContent.report.matched).toBe(true);
  });
});
