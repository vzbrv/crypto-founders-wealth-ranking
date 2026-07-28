import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProjectDetail } from "../../../components/project-detail";
import { SiteNav } from "../../../components/site-nav";
import { getProjectEvidence, getProjectSlugs } from "../../../lib/transparency";

export function generateStaticParams() {
  return getProjectSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const evidence = getProjectEvidence(slug);
  return evidence
    ? {
        title: `${evidence.project.name} calculation transparency`,
        description: evidence.project.description,
      }
    : { title: "Project not found" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const evidence = getProjectEvidence(slug);
  if (!evidence) notFound();
  return (
    <>
      <SiteNav />
      <ProjectDetail evidence={evidence} />
    </>
  );
}
