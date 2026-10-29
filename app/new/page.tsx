import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveApp } from "@/lib/guides";
import { liveConfigured } from "@/lib/service";
import { GenerateRunner } from "@/components/Client";

export const metadata = { title: "Researching…", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function New({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  if (!q) redirect("/");
  const known = resolveApp(q);
  if (known) redirect(`/g/${known.slug}`);
  const cfg = liveConfigured();
  return (
    <main className="tight">
      <Link className="back" href="/">
        ← library
      </Link>
      <h1 className="hero" style={{ marginTop: "1.4rem", fontSize: "2.2rem" }}>
        Not in the library. Reading the docs.
      </h1>
      <p className="lede" style={{ marginBottom: 0 }}>
        Search, read, draft, check every quote against the page, probe the endpoints, verify with a second model. Usually 30 to 90 seconds.
      </p>
      {cfg.llm && cfg.search ? (
        <GenerateRunner q={q} />
      ) : (
        <div className="note-box">
          <b>Live mode isn&apos;t switched on in this deployment.</b> It needs an LLM ({cfg.llm ? "set" : "missing: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN"}) and a search provider ({cfg.search ? "set" : "missing: EXA_API_KEY or TAVILY_API_KEY"}). The eight library guides work without either. See <code>.env.example</code>.
        </div>
      )}
    </main>
  );
}
