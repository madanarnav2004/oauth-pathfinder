import Link from "next/link";
import { listGuides } from "@/lib/guides";
import { DIFFICULTY } from "@/lib/render";
import { fmtSpan } from "@/lib/time";
import type { Span } from "@/lib/schema";

const t = (s: Span | null) => (s ? (s.hi === 0 ? "none" : fmtSpan(s)) : null);

export default function Home() {
  const guides = listGuides();
  return (
    <main>
      <h1 className="hero">
        How hard is it to get
        <br />
        an OAuth app approved?
      </h1>
      <p className="lede">
        Type an app. If it&apos;s one of the eight we checked by hand, you get the answer now. If not, an agent reads the docs, tests what it can, and tells you what it couldn&apos;t confirm.
      </p>
      <form className="ask" action="/new" method="get">
        <input name="q" placeholder="linear.app, hubspot, github…" aria-label="App name or website" autoComplete="off" autoCapitalize="off" spellCheck={false} required />
        <button type="submit">look up →</button>
      </form>
      <p className="hint">
        Works in your editor too: <Link href="/agent">add it to Claude Code, Codex or Cursor</Link>.
      </p>

      <h2 className="sec" id="library">
        library · easy to hard
      </h2>
      <div className="lib">
        <div className="head">
          <span>app</span>
          <span>difficulty</span>
          <span>hands-on</span>
          <span>waiting</span>
        </div>
        {guides.map((g) => (
          <Link key={g.slug} href={`/g/${g.slug}`} className="row">
            <span className="who">
              <span className="nm">{g.name.split(" (")[0]}</span>
              <span className="lb">{g.label}</span>
            </span>
            <span className="df">
              <span className="pf-dots" aria-hidden="true">
                {[1, 2, 3, 4, 5].map((i) => (
                  <i key={i} className={i <= g.difficulty ? "on" : ""} />
                ))}
              </span>{" "}
              {DIFFICULTY[g.difficulty]}
            </span>
            <span className="tm">{t(g.handsOn) ?? "?"}</span>
            <span className={`tm${g.wait ? "" : " fogcell"}`}>{t(g.wait) ?? "unknown"}</span>
          </Link>
        ))}
      </div>
      <p className="hint" style={{ marginTop: "1.2rem" }}>
        &ldquo;unknown&rdquo; means no source we could read gives a number. We leave it blank on purpose. <Link href="/how-we-checked">What we checked, and what we couldn&apos;t</Link>.
      </p>
    </main>
  );
}
