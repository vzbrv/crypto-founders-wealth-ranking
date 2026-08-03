import Link from "next/link";
import type { ReactNode } from "react";

import type {
  UnifiedCalculation,
  UnifiedDataset,
  UnifiedMarketCompany,
  UnifiedMarketToken,
  UnifiedSource,
} from "@crypto-founders/curated-data/unified";

import { HourlySnapshotStatus } from "./hourly-snapshot-status";

function money(value: string | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function sourceLink(source: UnifiedSource | undefined): ReactNode {
  if (!source) return "Source record unavailable";
  return (
    <a href={source.url} target="_blank" rel="noreferrer">
      {source.name}
    </a>
  );
}

export function UnifiedCalculationPage({
  calculation,
  dataset,
}: {
  calculation: UnifiedCalculation;
  dataset: UnifiedDataset;
}) {
  const { entry } = calculation;
  const publicMarket: UnifiedMarketCompany | undefined =
    entry.market.type === "public" ? entry.market : undefined;
  const tokenMarket: UnifiedMarketToken | undefined =
    entry.market.type === "token" ? entry.market : undefined;
  const source = (id: string | undefined) =>
    dataset.sources.find((candidate) => candidate.id === id);
  const marketSource = publicMarket
    ? source(publicMarket.priceSourceId)
    : source(tokenMarket?.sourceId);
  const ownershipSource = source(entry.affiliatedOwnership.sourceId);
  const capitalEvents = entry.outsideCapital.events;

  return (
    <>
      <header className="detail-hero">
        <p className="eyebrow">
          Unified calculation · {entry.valueType} · {entry.snapshotDate}
        </p>
        <h1>{entry.founderTeam}</h1>
        <p>
          Project/company: <strong>{entry.project}</strong>. This published
          index estimate is not founder net worth, personal wealth,
          founder-retained value, or investment advice.
        </p>
      </header>

      <HourlySnapshotStatus
        variant="detail"
        entryId={entry.entryId}
        fallbackSnapshotDate={dataset.snapshotDate}
        fallbackObservationDate={entry.observationDate}
      />

      <section className="panel" aria-labelledby="unified-calculation-heading">
        <div className="section-heading compact">
          <h2 id="unified-calculation-heading">Calculation</h2>
          <p>Estimated value created for outside holders and shareholders.</p>
        </div>
        <div className="formula-grid">
          <div>
            <span>Value type</span>
            <strong>{entry.valueType}</strong>
          </div>
          <div>
            <span>Gross market value</span>
            <strong>{money(calculation.grossMarketValueUsd)}</strong>
          </div>
          <div>
            <span>Accepted affiliated ownership</span>
            <strong>{money(calculation.acceptedAffiliatedOwnershipUsd)}</strong>
          </div>
          <div>
            <span>Accepted outside capital</span>
            <strong>{money(calculation.acceptedOutsideCapitalUsd)}</strong>
          </div>
          <div>
            <span>Estimated value created</span>
            <strong>{money(calculation.provisionalValueCreatedUsd)}</strong>
          </div>
          <div>
            <span>Observation date</span>
            <strong>{entry.observationDate}</strong>
          </div>
        </div>
        <p className="equation">
          {calculation.formula} estimated value created for outside
          holders/shareholders.
        </p>
        {calculation.upperEstimate && (
          <p className="warning-text">
            Upper estimate: one or more ownership or capital deductions remain
            Unknown or incomplete. Unknown is not treated as $0.
          </p>
        )}
      </section>

      {publicMarket && (
        <section className="panel" aria-labelledby="public-market-heading">
          <div className="section-heading compact">
            <h2 id="public-market-heading">Public-company reconstruction</h2>
            <p>
              {publicMarket.ticker} · {publicMarket.exchange} · closing price
              date {publicMarket.priceDate}
            </p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Share class</th>
                  <th>Outstanding shares</th>
                  <th>Price</th>
                  <th>Value</th>
                  <th>Share-count source</th>
                </tr>
              </thead>
              <tbody>
                {publicMarket.shareClasses.map((shareClass) => (
                  <tr key={shareClass.className}>
                    <td>{shareClass.className}</td>
                    <td>
                      {Number(shareClass.sharesOutstanding).toLocaleString()}
                    </td>
                    <td>{money(publicMarket.priceUsd)}</td>
                    <td>
                      {money(
                        String(
                          Number(shareClass.sharesOutstanding) *
                            Number(publicMarket.priceUsd),
                        ),
                      )}
                    </td>
                    <td>{sourceLink(source(shareClass.sourceId))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            Gross market capitalization = each outstanding share class × the{" "}
            {money(publicMarket.priceUsd)} closing price. Share classes are
            added once; enterprise value and fully diluted shares are not used.
          </p>
          <p>
            Price source: {sourceLink(marketSource)}. Share-count filing dates
            are shown per row above; any date mismatch is disclosed in the
            source notes.
          </p>
        </section>
      )}

      <section className="panel" aria-labelledby="deductions-heading">
        <div className="section-heading compact">
          <h2 id="deductions-heading">Accepted deductions</h2>
          <p>Each accepted input is linked to a stored source record.</p>
        </div>
        {entry.affiliatedOwnership.status === "Accepted" ? (
          <>
            <p>
              Founder/affiliate shares: {entry.affiliatedOwnership.totalShares}{" "}
              shares × the applicable market price ={" "}
              {money(calculation.acceptedAffiliatedOwnershipUsd)}. Ownership
              source: {sourceLink(ownershipSource)}.
            </p>
            <ul>
              {(entry.affiliatedOwnership.holders ?? []).map((holder) => (
                <li key={holder.name}>
                  {holder.name}: {Number(holder.shares).toLocaleString()} shares
                  — {sourceLink(source(holder.sourceId))}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p>Affiliated ownership deduction: Unknown; no deduction applied.</p>
        )}
        {entry.outsideCapital.status === "Accepted" ? (
          <ul>
            {capitalEvents
              .filter((event) => event.disposition === "Accepted")
              .map((event) => (
                <li key={event.eventId}>
                  {event.label}: {money(event.amountUsd)} ({event.date}) —{" "}
                  {sourceLink(source(event.sourceId))}
                </li>
              ))}
          </ul>
        ) : (
          <p>Outside capital deduction: Unknown; no deduction applied.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="evidence-heading">
        <div className="section-heading compact">
          <h2 id="evidence-heading">Evidence treatment</h2>
          <p>
            Excluded, disputed and scenario-only evidence cannot affect rank.
          </p>
        </div>
        <h3>Included evidence</h3>
        <ul>
          {entry.includedEvidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <h3>Excluded evidence</h3>
        <ul>
          {entry.excludedEvidence.length > 0 ? (
            entry.excludedEvidence.map((item) => <li key={item}>{item}</li>)
          ) : (
            <li>None recorded.</li>
          )}
        </ul>
        <h3>Disputed or scenario-only evidence</h3>
        <ul>
          {entry.disputedEvidence.length > 0 ? (
            entry.disputedEvidence.map((item) => <li key={item}>{item}</li>)
          ) : (
            <li>None recorded.</li>
          )}
        </ul>
        <h3>Remaining unknowns</h3>
        <ul>
          {entry.unknowns.length > 0 ? (
            entry.unknowns.map((item) => <li key={item}>{item}</li>)
          ) : (
            <li>None recorded.</li>
          )}
        </ul>
      </section>

      <section className="panel" aria-labelledby="confidence-heading">
        <div className="section-heading compact">
          <h2 id="confidence-heading">Confidence</h2>
          <p>
            {entry.confidence.score}/100 · {entry.confidence.label}
          </p>
        </div>
        <ul>
          {entry.confidence.components.map((component) => (
            <li key={component.key}>
              <strong>
                {component.label}: {component.score}/{component.maxScore}
              </strong>{" "}
              — {component.detail}
            </li>
          ))}
        </ul>
        <p>{entry.comparability}</p>
      </section>

      <p>
        <Link href="/">Back to unified top 20</Link>
      </p>
    </>
  );
}
