import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyButton } from "@/components/Client";

export const metadata: Metadata = { title: "Use it in your agent" };
export const dynamic = "force-dynamic";

const TOOLS: [string, string][] = [
  ["render_guide_card", "The answer as a card, inline in the chat: what it takes, what will bite you, and the route. Hosts without MCP Apps get the same thing as text."],
  ["get_oauth_guide", "The checked guide for one of the eight, as text."],
  ["generate_oauth_guide", "Anything else. Researches it live, checks its own quotes against the pages, probes the endpoints."],
  ["prepare_setup", "Redirect URIs for your environments, env var names, which scopes are gated. What to paste into the provider's console."],
  ["report_blocker", "Paste the error. Cause and fix if we know it, or what to collect if we don't."],
];

export default async function Agent() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/mcp`;

  const snippets: { title: string; note?: string; code: string }[] = [
    { title: "Claude Code", code: `claude mcp add --transport http pathfinder ${url}` },
    { title: "Codex", note: "In ~/.codex/config.toml", code: `[mcp_servers.pathfinder]\nurl = "${url}"` },
    { title: "Cursor, VS Code", note: ".cursor/mcp.json or .vscode/mcp.json", code: `{ "mcpServers": { "pathfinder": { "url": "${url}" } } }` },
    { title: "Claude.ai, ChatGPT", note: "Add a custom connector and paste the URL.", code: url },
  ];

  return (
    <main className="tight">
      <h1 className="hero" style={{ fontSize: "2.5rem" }}>
        Skip the website
      </h1>
      <p className="lede">
        You already have an agent open. Add the server once, then ask it &ldquo;how hard is it to get a Slack OAuth app approved?&rdquo; and read the answer where you&apos;re working.
      </p>

      {snippets.map((s) => (
        <section key={s.title} style={{ marginTop: "2rem" }}>
          <h2 className="sec" style={{ marginTop: 0, borderTop: 0, paddingTop: 0 }}>
            {s.title}
          </h2>
          {s.note && <p className="hint" style={{ margin: "0 0 0.5rem" }}>{s.note}</p>}
          <div className="install">
            <code style={{ whiteSpace: "pre" }}>{s.code}</code>
            <CopyButton label="copy" text={s.code} quiet />
          </div>
        </section>
      ))}

      <h2 className="sec">What your agent gets</h2>
      <div className="tools">
        {TOOLS.map(([name, desc]) => (
          <div key={name}>
            <code>{name}</code>
            <span>{desc}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        In a host that renders MCP Apps, <code>render_guide_card</code> draws the guide in the conversation. Everywhere else the same call returns the same guide as text, so nothing breaks.
      </p>
    </main>
  );
}
