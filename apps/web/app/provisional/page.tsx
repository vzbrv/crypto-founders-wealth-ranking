import type { Metadata } from "next";
import Link from "next/link";

import { SiteNav } from "../../components/site-nav";
import { getProvisionalRanking } from "../../lib/research-data";

export const metadata: Metadata = {
  title: "Provisional outside-holder value screen",
  description:
    "A dated provisional screen using sourced circulating market values and reviewed deductions.",
  alternates: { canonical: "/provisional/" },
};

function money(value: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default async function ProvisionalPage() {
  const ranking = await getProvisionalRanking();
  const observedAt = ranking[0]?.marketDataTimestamp ?? "unknown";

  return (
    <>
      <SiteNav />
      <main className="content-page" id="main-content" tabIndex={-1}>
        <header className="page-header">
          <p className="eyebrow">Dated provisional screen</p>
          <h1>Provisional outside-holder value screen</h1>
          <p>
            Top 10 founding units using market observations dated {observedAt}.
            This is a research screen, not the canonical ranking or a personal-
            wealth claim.
          </p>
        </header>

        <section className="warning-panel" aria-labelledby="coverage-heading">
          <h2 id="coverage-heading">Coverage warning</h2>
          <p>
            Unknown deductions are omitted from arithmetic, not treated as $0.
            Values with evidence gaps are upper estimates and may be overstated.
          </p>
        </section>

        <section className="panel" aria-labelledby="provisional-table-heading">
          <div className="section-heading compact">
            <h2 id="provisional-table-heading">Provisional top 10</h2>
            <p>One entry per founding unit. Every row links to its inputs.</p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table research-universe-table">
              <thead>
                <tr>
                  <th>Provisional rank</th>
                  <th>Project</th>
                  <th>Founding unit</th>
                  <th className="number">Market value</th>
                  <th>Deduction coverage</th>
                  <th className="number">Provisional value</th>
                  <th>Coverage</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry) => {
                  return (
                    <tr key={entry.projectId}>
                      <td className="rank">{entry.provisionalRank}</td>
                      <td>
                        <Link href={`/provisional/${entry.projectId}/`}>
                          <strong>{entry.project}</strong>
                        </Link>
                        <small>
                          <Link href={`/provisional/${entry.projectId}/`}>
                            Calculation &amp; sources
                          </Link>
                        </small>
                      </td>
                      <td>{entry.foundersTeam}</td>
                      <td className="number">
                        {money(entry.circulatingMarketValueUsd)}
                        <small>Observed {entry.marketDataTimestamp}</small>
                      </td>
                      <td>
                        {entry.deductions.length > 0
                          ? `${entry.deductions.length} reviewed input${entry.deductions.length === 1 ? "" : "s"}`
                          : "Unknown"}
                      </td>
                      <td className="number">
                        <strong>
                          {money(entry.provisionalOutsideHolderValueUsd)}
                        </strong>
                      </td>
                      <td>{entry.coverageWarning}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
