import type { Metadata } from "next";

import type {
  UnifiedEntry,
  UnifiedMarketCompany,
} from "@crypto-founders/curated-data/unified";

import { ProviderStatus } from "../../components/provider-status";
import { HourlySnapshotStatus } from "../../components/hourly-snapshot-status";
import { SiteFooter, SiteNav } from "../../components/site-nav";
import { getUnifiedDataset } from "../../lib/research-data";

export const metadata: Metadata = {
  alternates: { canonical: "/status/" },
  description:
    "Current data-provider monitoring state for the Crypto Founders Value Created Index.",
  title: "System status",
};

export default async function StatusPage() {
  const dataset = await getUnifiedDataset();
  const publicEntries = dataset.entries.filter(
    (entry): entry is UnifiedEntry & { market: UnifiedMarketCompany } =>
      entry.valueType === "Public company" && entry.market.type === "public",
  );

  return (
    <>
      <SiteNav />
      <main className="content-page" id="main-content" tabIndex={-1}>
        <header className="page-header">
          <p className="eyebrow">Operational transparency</p>
          <h1>System status</h1>
          <p>
            Latest health checks for market and wallet data providers. Raw
            diagnostic messages are restricted to operators.
          </p>
        </header>
        <HourlySnapshotStatus
          variant="status"
          fallbackSnapshotDate={dataset.snapshotDate}
          fallbackObservationDate={
            dataset.entries[0]?.observationDate ?? dataset.snapshotDate
          }
        />
        <ProviderStatus />
        <section className="panel" aria-labelledby="dataset-status-heading">
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Research freshness</p>
              <h2 id="dataset-status-heading">
                Unified public-company dataset
              </h2>
            </div>
            <p>
              The ranking remains provisional where filings or capital history
              are incomplete.
            </p>
          </div>
          <dl className="status-grid">
            <div>
              <dt>Snapshot</dt>
              <dd>{dataset.snapshotDate}</dd>
            </div>
            <div>
              <dt>Ranked entries</dt>
              <dd>{dataset.entries.length}</dd>
            </div>
            <div>
              <dt>Public companies</dt>
              <dd>{publicEntries.length}</dd>
            </div>
            <div>
              <dt>Source records</dt>
              <dd>{dataset.sources.length}</dd>
            </div>
          </dl>
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Ticker / exchange</th>
                  <th>Price date</th>
                  <th>Share-count date</th>
                  <th>Ownership date</th>
                  <th>Capital status</th>
                </tr>
              </thead>
              <tbody>
                {publicEntries.map((entry) => (
                  <tr key={entry.entryId}>
                    <td>{entry.project}</td>
                    <td>
                      {entry.market.ticker} · {entry.market.exchange}
                    </td>
                    <td>{entry.market.priceDate}</td>
                    <td>
                      {entry.market.shareClasses[0]?.asOfDate ?? "Unknown"}
                    </td>
                    <td>
                      {entry.affiliatedOwnership.ownershipDate ?? "Unknown"}
                    </td>
                    <td>{entry.outsideCapital.status}</td>
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
