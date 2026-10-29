import type { Metadata } from "next";
import verification from "@/data/verification.json";
import { listGuides } from "@/lib/guides";
import { countStatuses, chip } from "@/lib/render";
import type { Status } from "@/lib/schema";

export const metadata: Metadata = { title: "How we checked", description: "What was corrected, confirmed, and left unknown while writing the guides." };

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
      <h1 className="hero" style={{ fontSize: "2.4rem" }}>How we checked</h1>
      <p className="lede">{verification.method}</p>

      <div className="tally">
        <div><b>{guides.length}</b>guides</div>
        <div><b>{sources}</b>pages read</div>
        <div><b>{total.sourced}</b>sourced claims</div>
        <div><b>{total.inferred}</b>inferred</div>
        <div><b>{total.unknown}</b>left unknown</div>
        <div><b>{total.tested}</b>tested so far</div>
      </div>
      <p className="hint" style={{ marginTop: "1rem" }} dangerouslySetInnerHTML={{ __html: `${chip("tested")} ${chip("sourced")} ${chip("inferred")} ${chip("unknown")}` }} />

      <h2 className="sec">what changed while writing them</h2>
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

      <h2 className="sec">limits, stated plainly</h2>
      <ul style={{ paddingLeft: "1.1rem" }}>
        {verification.limits.map((l, i) => (
          <li key={i} style={{ marginBottom: "0.6rem" }}>{l}</li>
        ))}
      </ul>
      <p className="hint">Checked {verification.checkedOn}.</p>
    </main>
  );
}
