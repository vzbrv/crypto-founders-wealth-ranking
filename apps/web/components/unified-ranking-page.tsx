import { SiteFooter, SiteNav } from "./site-nav";
import { HourlyRankingTable } from "./hourly-ranking-table";
import {
  getPrivateCompanyCandidates,
  getUnifiedDataset,
  getUnifiedRanking,
} from "../lib/research-data";

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
          <p className="eyebrow">Crypto Founders Value Index</p>
          <h1>Top Crypto Founders Ranked by Value Created for Others.</h1>
          <p>
            The top 20 token/network founding teams and qualifying
            public-company founders, based on observations dated{" "}
            {dataset.snapshotDate}. The index estimates value created for
            outside holders and shareholders; it is not founder net worth,
            personal wealth, or investment advice.
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
              Estimated value created for outside holders and shareholders
            </h2>
            <p>
              One joint founding unit per economic entity. Public-company market
              caps use reconstructed outstanding shares, not enterprise value.
            </p>
          </div>
          <HourlyRankingTable
            fallbackRanking={ranking}
            fallbackSnapshotDate={dataset.snapshotDate}
            fallbackObservationDate={
              dataset.entries[0]?.observationDate ?? dataset.snapshotDate
            }
          />
        </section>

        <section className="panel" aria-labelledby="private-heading">
          <div className="section-heading compact">
            <h2 id="private-heading">Private-company coverage</h2>
            <p>
              Shown for transparency only. These companies are not ranked
              because the evidence required for a comparable estimate is not yet
              available.
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
      <SiteFooter />
    </>
  );
}
