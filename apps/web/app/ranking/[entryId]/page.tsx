import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteNav } from "../../../components/site-nav";
import { UnifiedCalculationPage } from "../../../components/unified-calculation";
import {
  getUnifiedCalculation,
  getUnifiedDataset,
  getUnifiedProjectIds,
  getProvisionalCalculation,
  getProvisionalProjectIds,
  getResearchDataset,
} from "../../../lib/research-data";

export const dynamicParams = false;

function money(value: string | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export async function generateStaticParams() {
  const [unifiedIds, legacyIds] = await Promise.all([
    getUnifiedProjectIds(),
    getProvisionalProjectIds(),
  ]);
  return [...new Set([...unifiedIds, ...legacyIds])].map((entryId) => ({
    entryId,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ entryId: string }>;
}): Promise<Metadata> {
  const { entryId } = await params;
  const unified = await getUnifiedCalculation(entryId);
  if (unified) {
    return {
      title: `${unified.entry.founderTeam} — ${unified.entry.project} calculation`,
      description: `Dated ${unified.entry.valueType.toLowerCase()} calculation and source trail for ${unified.entry.founderTeam}.`,
      alternates: { canonical: `/ranking/${entryId}/` },
    };
  }
  const calculation = await getProvisionalCalculation(entryId);
  return calculation
    ? {
        title: `${calculation.foundersTeam} — ${calculation.project} calculation`,
        description: `Dated provisional calculation and source trail for ${calculation.foundersTeam} and ${calculation.project}.`,
        alternates: { canonical: `/ranking/${entryId}/` },
      }
    : { title: "Provisional calculation not found" };
}

async function LegacyProvisionalCalculationPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const [calculation, dataset] = await Promise.all([
    getProvisionalCalculation(entryId),
    getResearchDataset(),
  ]);
  if (!calculation) notFound();

  const sourceIds = new Set([
    calculation.marketSourceId,
    ...calculation.deductions.flatMap(({ sourceIds }) => sourceIds),
    ...calculation.excludedEvidence.map(({ sourceId }) => sourceId),
  ]);
  const sources = dataset.sources.filter(({ id }) => sourceIds.has(id));
  const marketSource = dataset.sources.find(
    ({ id }) => id === calculation.marketSourceId,
  );

  return (
    <>
      <SiteNav />
      <main className="detail-page" id="main-content" tabIndex={-1}>
        <header className="detail-hero">
          <p className="eyebrow">
            Provisional calculation · {calculation.marketDataTimestamp}
          </p>
          <h1>{calculation.foundersTeam}</h1>
          <p>
            Project: <strong>{calculation.project}</strong>. This is a dated
            calculation screen, not founder net worth or personal wealth.
          </p>
        </header>

        <section className="panel" aria-labelledby="calculation-heading">
          <div className="section-heading compact">
            <h2 id="calculation-heading">Calculation</h2>
            <p>
              Unknown deductions are omitted from arithmetic, not asserted as
              $0.
            </p>
          </div>
          <div className="formula-grid">
            <div>
              <span>Circulating market value</span>
              <strong>{money(calculation.circulatingMarketValueUsd)}</strong>
            </div>
            <div>
              <span>Observation time</span>
              <strong>{calculation.marketDataTimestamp}</strong>
            </div>
            <div>
              <span>Fetch time</span>
              <strong>{calculation.marketFetchTimestamp}</strong>
            </div>
            <div>
              <span>CoinGecko coin ID</span>
              <strong>{calculation.marketCoinGeckoCoinId}</strong>
            </div>
            <div>
              <span>Snapshot method</span>
              <strong>{calculation.marketSnapshotMethod}</strong>
            </div>
            <div>
              <span>Direct source URL</span>
              <strong>
                <a
                  href={calculation.marketDirectSourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  CoinGecko historical record
                </a>
              </strong>
            </div>
            <div>
              <span>Affiliated circulating holdings</span>
              <strong>
                {money(calculation.affiliatedCirculatingHoldingsUsd)}
              </strong>
            </div>
            <div>
              <span>Reviewed outside capital</span>
              <strong>
                {money(calculation.reviewedDisclosedOutsideCapitalUsd)}
              </strong>
            </div>
            <div>
              <span>Provisional value created for outside holders.</span>
              <strong>
                {money(calculation.provisionalOutsideHolderValueUsd)}
              </strong>
            </div>
          </div>
          <p className="equation">
            {money(calculation.circulatingMarketValueUsd)} −{" "}
            {money(calculation.affiliatedCirculatingHoldingsUsd)} −{" "}
            {money(calculation.reviewedDisclosedOutsideCapitalUsd)} ={" "}
            {money(calculation.provisionalOutsideHolderValueUsd)} provisional
            value created for outside holders.
          </p>
          <p className="warning-text">{calculation.coverageWarning}</p>
          <p className="warning-text">
            Incomplete evidence coverage makes this result an upper estimate.
          </p>
          {calculation.evidenceGaps.length > 0 && (
            <ul>
              {calculation.evidenceGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel" aria-labelledby="sources-heading">
          <div className="section-heading compact">
            <h2 id="sources-heading">Sources</h2>
            <p>Every amount deducted below has a direct supporting source.</p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Input</th>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Quality</th>
                  <th>Why accepted</th>
                </tr>
              </thead>
              <tbody>
                {marketSource && (
                  <tr>
                    <td>Circulating market value</td>
                    <td>
                      <a
                        href={marketSource.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {marketSource.name}
                      </a>
                    </td>
                    <td>{marketSource.date}</td>
                    <td>{marketSource.quality}</td>
                    <td>Reproducible July 30, 2026 market snapshot.</td>
                  </tr>
                )}
                {calculation.deductions.map((deduction, index) => (
                  <tr key={`${deduction.label}-${index}`}>
                    <td>
                      {deduction.label}: {money(deduction.amountUsd)}
                    </td>
                    <td>
                      {deduction.sourceIds.map((sourceId, sourceIndex) => {
                        const source = sources.find(
                          ({ id }) => id === sourceId,
                        );
                        return source ? (
                          <span key={source.id}>
                            {sourceIndex > 0 && ", "}
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {source.name}
                            </a>
                          </span>
                        ) : null;
                      })}
                    </td>
                    <td>
                      {deduction.sourceIds
                        .map(
                          (sourceId) =>
                            sources.find(({ id }) => id === sourceId)?.date,
                        )
                        .filter(Boolean)
                        .join(", ")}
                    </td>
                    <td>{deduction.sourceClass ?? "Wallet review"}</td>
                    <td>{deduction.qualification}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="confidence-heading">
          <div className="section-heading compact">
            <h2 id="confidence-heading">Confidence and evidence gaps</h2>
            <p>
              {calculation.confidence.score}/100 ·{" "}
              {calculation.confidence.label}
            </p>
          </div>
          <ul>
            {calculation.confidence.components.map((component) => (
              <li key={component.label}>
                <strong>
                  {component.label}: {component.score}/{component.maxScore}
                </strong>{" "}
                — {component.detail}
              </li>
            ))}
          </ul>
        </section>

        <section className="panel" aria-labelledby="excluded-heading">
          <div className="section-heading compact">
            <h2 id="excluded-heading">Excluded and unresolved evidence</h2>
            <p>
              These records are shown for transparency and do not affect the
              primary provisional ranking.
            </p>
          </div>
          {calculation.excludedEvidence.length > 0 ? (
            <ul>
              {calculation.excludedEvidence.map((record) => {
                const source = sources.find(({ id }) => id === record.sourceId);
                return (
                  <li key={record.recordId}>
                    <strong>{record.disposition}</strong>: {record.reason}{" "}
                    {source && (
                      <a href={source.url} target="_blank" rel="noreferrer">
                        {source.name}
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p>Unknown: no excluded or disputed record is currently listed.</p>
          )}
        </section>

        <p>
          <Link href="/">Back to unified top 20</Link>
        </p>
      </main>
    </>
  );
}

export default async function ProvisionalCalculationPage({
  params,
}: {
  params: Promise<{ entryId: string }>;
}) {
  const { entryId } = await params;
  const unified = await getUnifiedCalculation(entryId);
  if (unified) {
    return (
      <>
        <SiteNav />
        <main className="detail-page" id="main-content" tabIndex={-1}>
          <UnifiedCalculationPage
            calculation={unified}
            dataset={await getUnifiedDataset()}
          />
        </main>
      </>
    );
  }
  return (
    <LegacyProvisionalCalculationPage params={Promise.resolve({ entryId })} />
  );
}
