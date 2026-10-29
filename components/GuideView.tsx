import Link from "next/link";
import { renderGuide, guideToMarkdown } from "@/lib/render";
import { CopyButton, ProbeButton } from "./Client";
import type { Guide } from "@/lib/schema";

export function GuideView({ guide, library }: { guide: Guide; library: boolean }) {
  return (
    <main className="tight">
      <Link className="back" href="/">
        ← library
      </Link>
      <div style={{ marginTop: "1.4rem" }} dangerouslySetInnerHTML={{ __html: renderGuide(guide) }} />
      <div className="bar-actions">
        <CopyButton label="copy link" />
        <CopyButton label="copy as markdown" text={guideToMarkdown(guide)} quiet />
        {library && <ProbeButton slug={guide.slug} />}
        <Link className="btn quiet" href="/agent">
          use in my agent
        </Link>
      </div>
    </main>
  );
}
