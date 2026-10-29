import type { Metadata } from "next";
import verification from "@/data/verification.json";
import { listGuides } from "@/lib/guides";
import { countStatuses } from "@/lib/render";
import type { Status } from "@/lib/schema";

export const metadata: Metadata = {
  title: "How we checked",
  description: "What was corrected, what was confirmed, and what we could not find out.",
};

export default function HowWeChecked() {
  const guides = listGuides();
  const total: Record<Status, number> = { tested: 0, sourced: 0, inferred: 0, unknown: 0 };
  let sources = 0;
  for (const g of guides) {
    const c = countStatuses(g);
    (Object.keys(total) as Status[]).forEach((k) => (total[k] += c[k]));
    sources += Object.keys(g.sources).length;
  }
  const entries = verification.entries as { guide: string; result: "corrected" | "confirmed" | "unverifiable"; claim: string; detail: string }[];

  return (
    <main className="tight how">
      <h1 className="hero" style={{ fontSize: "2.5rem" }}>
        How we checked
      </h1>
      <p className="lede">{verification.method}</p>

      <div className="tally">
        <div>
          <b>{guides.length}</b>guides
        </div>
        <div>
          <b>{sources}</b>pages read
        </div>
        <div>
          <b>{total.sourced}</b>claims with a source
        </div>
        <div>
          <b>{total.tested}</b>we ran ourselves
        </div>
        <div>
          <b>{total.inferred}</b>our own reading
        </div>
        <div>
          <b>{total.unknown}</b>we couldn&apos;t answer
        </div>
      </div>
      <p className="hint">
        A guide marks only the last three. Anything unmarked has a numbered source underneath it, so the page stays quiet and a badge always means something.
      </p>

      <h2 className="sec">What changed while writing them</h2>
      <div>
        {entries.map((e, i) => (
          <div className="entry" key={i}>
            <div>
              <div className={`res ${e.result}`}>{e.result}</div>
              <div className="gd">{e.guide}</div>
            </div>
            <div>
              <h3>{e.claim}</h3>
              <p>{e.detail}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="sec">Limits, stated plainly</h2>
      <ul style={{ paddingLeft: "1.05rem", maxWidth: "38em" }}>
        {verification.limits.map((l, i) => (
          <li key={i} style={{ marginBottom: "0.7rem" }}>
            {l}
          </li>
        ))}
      </ul>
      <p className="hint">Last checked {verification.checkedOn}.</p>
    </main>
  );
}
