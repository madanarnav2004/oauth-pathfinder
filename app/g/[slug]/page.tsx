import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GUIDES, getGuide } from "@/lib/guides";
import { DIFFICULTY } from "@/lib/render";
import { GuideView } from "@/components/GuideView";

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = getGuide((await params).slug);
  return g ? { title: `${g.name} OAuth setup: ${DIFFICULTY[g.difficulty]}`, description: g.summary } : {};
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await params).slug);
  if (!g) notFound();
  return <GuideView guide={g} library />;
}
