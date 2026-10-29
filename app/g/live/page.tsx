import Link from "next/link";
import type { Metadata } from "next";
import { decodeGuide } from "@/lib/share";
import { GuideView } from "@/components/GuideView";

export const metadata: Metadata = { title: "Generated guide", robots: { index: false } };

export default async function Live({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const g = d ? decodeGuide(d) : null;
  if (!g) {
    return (
      <main className="tight">
        <Link className="back" href="/">
          ← library
        </Link>
        <h1 className="hero" style={{ marginTop: "1.4rem" }}>That link is broken.</h1>
        <p className="lede">A generated guide travels inside its own link, and this one got cut off or edited. Ask whoever shared it to copy the link again, or generate it fresh from the front page.</p>
      </main>
    );
  }
  return <GuideView guide={g} library={false} />;
}
