import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <h1 className="hero">Nothing here.</h1>
      <p className="lede">
        That page, or that guide, doesn&apos;t exist. <Link href="/">Back to the library</Link>.
      </p>
    </main>
  );
}
