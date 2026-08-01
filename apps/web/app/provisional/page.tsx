import type { Metadata } from "next";
import Link from "next/link";

import { SiteNav } from "../../components/site-nav";
import { getProvisionalRanking } from "../../lib/research-data";

export const metadata: Metadata = {
  title: "Provisional founder ranking",
  description:
    "A dated, source-linked ranking of crypto founders and founding teams by provisional value created for outside holders.",
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
          <h1>Top Crypto Founders Ranked by Value Created for Others.</h1>
          <p>
            Top 10 founders and founding teams using market observations dated{" "}
            {observedAt}. It equals project circulating market value minus
            verified affiliated holdings and reviewed outside capital; it is not
            founder net worth or personal wealth.
          </p>
        </header>

        <section className="warning-panel" aria-labelledby="coverage-heading">
          <h2 id="coverage-heading">Coverage warning</h2>
          <p>
            Unknown deductions are omitted from arithmetic, not treated as $0.
            Values with evidence gaps are upper estimates and may be overstated.
            This is not founder net worth or personal wealth.
          </p>
        </section>

        <section
          id="ranking"
          className="panel"
          aria-labelledby="provisional-table-heading"
        >
          <div className="section-heading compact">
            <h2 id="provisional-table-heading">Provisional founder ranking</h2>
            <p>
              One entry per joint founding unit; a co-founded project&apos;s
              value is not duplicated across people. Every row links to its
              inputs.
            </p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table research-universe-table">
              <thead>
                <tr>
                  <th>Provisional rank</th>
                  <th>Founder or founding team</th>
                  <th>Project</th>
                  <th className="number">Circulating market value</th>
                  <th>Accepted deductions</th>
                  <th className="number">
                    Provisional value created for outside holders.
                  </th>
                  <th>Confidence</th>
                  <th>Evidence coverage</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((entry) => {
                  return (
                    <tr key={entry.projectId}>
                      <td className="rank">{entry.provisionalRank}</td>
                      <td>
                        <Link href={`/provisional/${entry.projectId}/`}>
                          <strong>{entry.foundersTeam}</strong>
                        </Link>
                        <small>
                          <Link href={`/provisional/${entry.projectId}/`}>
                            Calculation &amp; sources
                          </Link>
                        </small>
                      </td>
                      <td>
                        <strong>{entry.project}</strong>
                      </td>
                      <td className="number">
                        {money(entry.circulatingMarketValueUsd)}
                        <small>Observed {entry.marketDataTimestamp}</small>
                      </td>
                      <td>
                        {entry.deductions.length > 0
                          ? entry.deductions.map((deduction) => (
                              <small
                                key={`${deduction.label}-${deduction.sourceIds.join("-")}`}
                              >
                                {deduction.label}: {money(deduction.amountUsd)}
                              </small>
                            ))
                          : "Unknown"}
                      </td>
                      <td className="number">
                        <strong>
                          {money(entry.provisionalOutsideHolderValueUsd)}
                        </strong>
                      </td>
                      <td>
                        {entry.confidence.score}/100 · {entry.confidence.label}
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
