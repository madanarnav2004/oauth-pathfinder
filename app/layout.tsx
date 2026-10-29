import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "../styles/guide.css";
import "../styles/site.css";

export const metadata: Metadata = {
  title: { default: "pathfinder: how hard is that OAuth app?", template: "%s · pathfinder" },
  description: "Look up any app, get an OAuth setup guide you can follow and share, and see exactly which claims were tested, sourced, guessed, or unknown.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <header className="nav">
            <Link className="mark" href="/">
              path<i>/</i>finder
            </Link>
            <nav>
              <Link href="/#library">library</Link>
              <Link href="/how-we-checked">how we checked</Link>
              <Link href="/agent">use in your agent</Link>
            </nav>
          </header>
          {children}
          <footer className="footer">
            <span>Every claim links to where it came from, or admits that it can&apos;t.</span>
            <span>
              <a href="https://github.com/madanarnav2004/oauth-pathfinder">source</a>
            </span>
          </footer>
        </div>
      </body>
    </html>
  );
}
