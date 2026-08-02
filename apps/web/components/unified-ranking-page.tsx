import Link from "next/link";

import { SiteNav } from "./site-nav";
import {
  getPrivateCompanyCandidates,
  getUnifiedDataset,
  getUnifiedRanking,
} from "../lib/research-data";

function money(value: string | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export default async function UnifiedRankingPage() {
  const [dataset, ranking, candidates] = await Promise.all([
    getUnifiedDataset(),
    getUnifiedRanking(),
    getPrivateCompanyCandidates(),
  ]);

  return (
    <>
      <SiteNav />
      <main className="content-page" id="main-content" tabIndex={-1}>
        <header className="page-header">
          <p className="eyebrow">Unified provisional screen</p>
          <h1>Top Crypto Founders Ranked by Value Created for Others.</h1>
          <p>
            One provisional top 20 across token/network founding teams and
            qualifying public-company founders, using observations dated{" "}
            {dataset.snapshotDate}. The metric is not founder net worth,
            personal wealth, or an investment recommendation.
          </p>
        </header>

        <section className="warning-panel" aria-labelledby="coverage-heading">
          <h2 id="coverage-heading">Coverage warning</h2>
          <p>
            Unknown deductions remain Unknown and do not reduce the score.
            Incomplete deductions are upper estimates. Disputed, excluded and
            scenario-only evidence does not affect this primary ranking.
          </p>
        </section>

        <section
          id="ranking"
          className="panel"
          aria-labelledby="ranking-heading"
        >
          <div className="section-heading compact">
            <h2 id="ranking-heading">
              Provisional value created for outside holders and shareholders
            </h2>
            <p>
              One joint founding unit per economic entity. Public-company market
              caps use reconstructed outstanding shares, not enterprise value.
            </p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table research-universe-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Founder or joint founding team</th>
                  <th>Project or company</th>
                  <th>Value type</th>
                  <th className="number">Gross market value</th>
                  <th className="number">Affiliated ownership</th>
                  <th className="number">Outside capital</th>
                  <th className="number">Provisional value created</th>
                  <th>Confidence</th>
                  <th>Snapshot</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(
                  ({
                    entry,
                    grossMarketValueUsd,
                    acceptedAffiliatedOwnershipUsd,
                    acceptedOutsideCapitalUsd,
                    provisionalValueCreatedUsd,
                    upperEstimate,
                  }) => (
                    <tr key={entry.entryId}>
                      <td className="rank">{entry.rank}</td>
                      <td>
                        <Link href={`/ranking/${entry.entryId}/`}>
                          <strong>{entry.founderTeam}</strong>
                        </Link>
                        <small>
                          <Link href={`/ranking/${entry.entryId}/`}>
                            Calculation &amp; sources
                          </Link>
                        </small>
                      </td>
                      <td>
                        <strong>{entry.project}</strong>
                        {entry.market.type === "public" && (
                          <small>
                            {entry.market.ticker} · {entry.market.exchange}
                          </small>
                        )}
                      </td>
                      <td>{entry.valueType}</td>
                      <td className="number">{money(grossMarketValueUsd)}</td>
                      <td className="number">
                        {money(acceptedAffiliatedOwnershipUsd)}
                      </td>
                      <td className="number">
                        {money(acceptedOutsideCapitalUsd)}
                      </td>
                      <td className="number">
                        <strong>{money(provisionalValueCreatedUsd)}</strong>
                        {upperEstimate && <small>Upper estimate</small>}
                      </td>
                      <td>
                        {entry.confidence.score}/100 · {entry.confidence.label}
                      </td>
                      <td>{entry.snapshotDate}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="private-heading">
          <div className="section-heading compact">
            <h2 id="private-heading">Private-company candidates</h2>
            <p>
              Shown for transparency only. These candidates receive no rank and
              do not affect the top 20.
            </p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Founder/team</th>
                  <th>Company</th>
                  <th>Why it might qualify</th>
                  <th>Most recent valuation reference</th>
                  <th>Missing evidence / exclusion</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <tr key={candidate.candidateId}>
                    <td>{candidate.founderTeam}</td>
                    <td>
                      <strong>{candidate.company}</strong>
                    </td>
                    <td>{candidate.whyQualifies}</td>
                    <td>{candidate.mostRecentValuationReference}</td>
                    <td>
                      {candidate.missingEvidence.join(" ")}{" "}
                      {candidate.exclusionReason}
                    </td>
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
