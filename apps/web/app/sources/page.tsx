import type { Metadata } from "next";
import { Suspense } from "react";

import { SiteNav } from "../../components/site-nav";
import { SourceRegistry } from "../../components/source-registry";
import { getResearchDataset } from "../../lib/research-data";
import { getAllSourceClaims } from "../../lib/transparency-data";

export const metadata: Metadata = {
  title: "Source registry",
  description: "Claim-level sources behind the Crypto Founding Units Index.",
  alternates: { canonical: "/sources/" },
};

export default async function SourcesPage() {
  const researchSources = (await getResearchDataset()).sources;

  return (
    <>
      <SiteNav />
      <main className="content-page" id="main-content" tabIndex={-1}>
        <header className="page-header">
          <p className="eyebrow">Public evidence register</p>
          <h1>Sources</h1>
          <p>
            Every manually curated input used by the calculation links to a
            public source. API observations are labelled separately on project
            pages.
          </p>
        </header>
        <Suspense fallback={<p>Loading source registry…</p>}>
          <SourceRegistry claims={getAllSourceClaims()} />
        </Suspense>
        <section className="panel" aria-labelledby="research-sources-heading">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Separate dated register</p>
              <h2 id="research-sources-heading">
                Founding-unit research references
              </h2>
            </div>
            <p>
              These {researchSources.length} sources support the founding-unit
              research universe. They are not published ranking inputs unless
              separately promoted through the publication gate.
            </p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Category</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Quality</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {researchSources.map((source) => (
                  <tr key={source.id}>
                    <td>
                      <code>{source.id}</code>
                    </td>
                    <td>{source.category}</td>
                    <td>
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.name}
                      </a>
                    </td>
                    <td>{source.date ?? "Undated"}</td>
                    <td>{source.quality}</td>
                    <td>{source.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
