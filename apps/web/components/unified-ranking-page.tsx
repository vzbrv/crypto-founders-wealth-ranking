import { SiteFooter, SiteNav } from "./site-nav";
import { HourlyRankingTable } from "./hourly-ranking-table";
import { getUnifiedDataset, getUnifiedRanking } from "../lib/production-data";

export default async function UnifiedRankingPage() {
  const [dataset, ranking] = await Promise.all([
    getUnifiedDataset(),
    getUnifiedRanking(),
  ]);

  return (
    <>
      <SiteNav />
      <main className="content-page" id="main-content" tabIndex={-1}>
        <header className="page-header">
          <p className="eyebrow">Crypto Founders Value Created Index</p>
          <h1>Top Crypto Founders Ranked by Value Created for Others.</h1>
          <p>
            This index ranks crypto founders and founding teams by estimated
            value created for outside token holders and public-company
            shareholders. It is not founder net worth, personal wealth, or
            investment advice.
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
          <div className="section-heading ranking-heading">
            <h2 id="ranking-heading">
              Estimated value created for outside holders and shareholders
            </h2>
            <p>
              Each rank belongs to one founder or joint founding team. Notable
              public members are named inside team rows when supported by cited
              evidence; they are not ranked again separately. Public-company
              market caps use reconstructed outstanding shares, not enterprise
              value.
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
      </main>
      <SiteFooter />
    </>
  );
}
