import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ProjectDetail } from "../../../components/project-detail";
import { SiteNav } from "../../../components/site-nav";
import {
  getProjectEvidence,
  getProjectSlugs,
} from "../../../lib/transparency-data";

export function generateStaticParams() {
  return [
    { slug: [] as string[] },
    ...getProjectSlugs().map((slug) => ({ slug: [slug] })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!slug?.length) {
    return {
      title: "Reviewed projects",
      description: "Reviewed project transparency records.",
      alternates: { canonical: "/project/" },
    };
  }

  const projectSlug = slug.length === 1 ? slug[0] : undefined;
  const evidence = projectSlug ? getProjectEvidence(projectSlug) : undefined;
  return evidence
    ? {
        title: `${evidence.project.name} calculation transparency`,
        description: evidence.project.description,
        alternates: { canonical: `/project/${projectSlug}/` },
        openGraph: {
          title: `${evidence.project.name} calculation transparency`,
          description: evidence.project.description,
          url: `/project/${projectSlug}/`,
        },
      }
    : { title: "Project not found" };
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug?: string[] }>;
}) {
  const { slug } = await params;
  if (!slug?.length) {
    const projects = getProjectSlugs().flatMap((projectSlug) => {
      const evidence = getProjectEvidence(projectSlug);
      return evidence ? [evidence] : [];
    });

    return (
      <>
        <SiteNav />
        <main className="content-page" id="main-content" tabIndex={-1}>
          <header className="page-header">
            <p className="eyebrow">Calculation transparency</p>
            <h1>Reviewed projects</h1>
            <p>Only reviewed production records are published here.</p>
          </header>
          {projects.length ? (
            <ul>
              {projects.map((evidence) => (
                <li key={evidence.project.slug}>
                  <Link href={`/project/${evidence.project.slug}/`}>
                    {evidence.project.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No reviewed project profiles are currently published.</p>
          )}
        </main>
      </>
    );
  }

  const projectSlug = slug.length === 1 ? slug[0] : undefined;
  const evidence = projectSlug ? getProjectEvidence(projectSlug) : undefined;
  if (!evidence) notFound();
  return (
    <>
      <SiteNav />
      <ProjectDetail evidence={evidence} />
    </>
  );
}
