import type { Metadata } from "next";
import { headers } from "next/headers";
import { CopyButton } from "@/components/Client";

export const metadata: Metadata = { title: "Use it in your agent" };
export const dynamic = "force-dynamic";

export default async function Agent() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const url = `${proto}://${host}/mcp`;
  const snippets: { title: string; note?: string; code: string }[] = [
    { title: "Claude Code", code: `claude mcp add --transport http pathfinder ${url}` },
    {
      title: "Codex",
      note: "In ~/.codex/config.toml. If your version only speaks stdio, the second form bridges it.",
      code: `[mcp_servers.pathfinder]\nurl = "${url}"\n\n# or, stdio-only clients:\n[mcp_servers.pathfinder]\ncommand = "npx"\nargs = ["-y", "mcp-remote", "${url}"]`,
    },
    { title: "Cursor, VS Code", note: ".cursor/mcp.json or .vscode/mcp.json", code: `{ "mcpServers": { "pathfinder": { "url": "${url}" } } }` },
    { title: "Claude.ai, ChatGPT", note: "Add a custom connector and paste the URL. The card renders inline in hosts that support MCP Apps.", code: url },
  ];
  return (
    <main className="tight">
      <h1 className="hero" style={{ fontSize: "2.4rem" }}>Skip the website</h1>
      <p className="lede">
        If you build with an agent, the guide should show up where you already work. Add the server once, then ask it &ldquo;how hard is it to get a Slack OAuth app approved?&rdquo; in plain words.
      </p>
      {snippets.map((s) => (
        <section key={s.title} style={{ marginBottom: "1.6rem" }}>
          <h3 style={{ margin: "0 0 0.2rem", fontFamily: "var(--serif)" }}>{s.title}</h3>
          {s.note && <p className="hint" style={{ margin: 0 }}>{s.note}</p>}
          <pre className="snippet">{s.code}</pre>
          <CopyButton label="copy" text={s.code.split("\n\n#")[0]} quiet />
        </section>
      ))}
      <h2 className="sec">what it gives your agent</h2>
      <div className="lib" style={{ marginTop: "0.6rem" }}>
        {[
          ["render_guide_card", "The visual answer: difficulty, hands-on, waiting, what will bite, the route. Inline in hosts that render MCP Apps; plain text elsewhere."],
          ["get_oauth_guide", "The same guide as text, from the checked library."],
          ["generate_oauth_guide", "For apps we haven't seen. Researches live, checks its own quotes, probes endpoints."],
          ["prepare_setup", "Redirect URIs per environment, env var names, which scopes are gated. The agent does its part, you do yours."],
          ["report_blocker", "Paste an error. Get the cause and fix if we know it, or a list of what to collect if we don't."],
        ].map(([n, d]) => (
          <div key={n} style={{ display: "grid", gridTemplateColumns: "12rem 1fr", gap: "1rem", padding: "0.8rem 0", borderBottom: "1px solid var(--rule)" }}>
            <code style={{ fontFamily: "var(--mono)", fontSize: "0.8rem" }}>{n}</code>
            <span>{d}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
