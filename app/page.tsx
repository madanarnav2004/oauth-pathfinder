import Link from "next/link";
import { headers } from "next/headers";
import { listGuides } from "@/lib/guides";
import { verdict } from "@/lib/render";
import { CopyButton } from "@/components/Client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const install = `claude mcp add --transport http pathfinder ${proto}://${host}/mcp`;

  return (
    <main>
      <h1 className="hero">
        How hard is it to get
        <br />
        an OAuth app approved?
      </h1>
      <p className="lede">
        An agent reads the provider&apos;s docs, tries what it can, and tells you plainly what it couldn&apos;t confirm. No invented timelines.
      </p>

      <h2 className="sec">Ask it where you already work</h2>
      <p className="say">
        This is mostly an MCP server. Add it once and ask your agent in plain words &mdash; it answers in the chat, so you never come back here.
      </p>
      <div className="install">
        <code>{install}</code>
        <CopyButton label="copy" text={install} quiet />
      </div>
      <p className="hint">
        <Link href="/agent">Codex, Cursor, VS Code, ChatGPT and Claude.ai</Link> take the same URL.
      </p>

      <h2 className="sec">Or look one up here</h2>
      <form className="ask" action="/new" method="get">
        <input name="q" placeholder="linear.app, hubspot, github…" aria-label="App name or website" autoComplete="off" autoCapitalize="off" spellCheck={false} required />
        <button type="submit">look it up</button>
      </form>
      <p className="hint">Anything outside the eight below gets researched live, in about a minute.</p>

      <h2 className="sec" id="library">
        Eight we checked by hand
      </h2>
      <div className="lib">
        {listGuides().map((g) => (
          <Link key={g.slug} href={`/g/${g.slug}`} className="row">
            <span className="nm">{g.name.split(" (")[0]}</span>
            <span className="vd">{verdict(g)}</span>
          </Link>
        ))}
      </div>
      <p className="hint lastword">
        Chosen to be different from each other: one with no review at all, one where the cliff is a user cap, two where approval is a business process.{" "}
        <Link href="/how-we-checked">What we corrected, and what we couldn&apos;t confirm</Link>.
      </p>
    </main>
  );
}
