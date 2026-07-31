import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteNav } from "../../../components/site-nav";
import {
  getResearchDataset,
  getResearchProjectIds,
} from "../../../lib/research-data";

export const dynamicParams = false;

function money(value: string | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number(value));
}

export async function generateStaticParams() {
  return [
    { projectId: [] as string[] },
    ...(await getResearchProjectIds()).map((projectId) => ({
      projectId: [projectId],
    })),
  ];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId?: string[] }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  if (!projectId?.length) {
    return {
      title: "Founding-unit research universe",
      description:
        "Dated, unranked founding-unit research candidates and evidence gaps.",
      alternates: { canonical: "/research/" },
    };
  }

  const id = projectId.length === 1 ? projectId[0] : undefined;
  const candidate = id
    ? (await getResearchDataset()).candidates.find(
        ({ projectId: candidateId }) => candidateId === id,
      )
    : undefined;
  return candidate
    ? {
        title: `${candidate.project} founding-unit research`,
        description: `${candidate.snapshotDate} research snapshot for ${candidate.project}.`,
        alternates: { canonical: `/research/${candidate.projectId}/` },
      }
    : { title: "Research candidate not found" };
}

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ projectId?: string[] }>;
}) {
  const { projectId } = await params;
  const dataset = await getResearchDataset();

  if (!projectId?.length) {
    const snapshotDate = dataset.candidates[0]?.snapshotDate ?? "unknown";
    return (
      <>
        <SiteNav />
        <main className="content-page" id="main-content" tabIndex={-1}>
          <header className="page-header">
            <p className="eyebrow">Dated research snapshot</p>
            <h1>Founding-unit research universe</h1>
            <p>
              {dataset.candidates.length} candidates screened as of{" "}
              {snapshotDate}. Research estimates are aids, not live
              observations, published ranks, or personal-wealth claims.
            </p>
          </header>
          <section className="panel" aria-labelledby="research-table-heading">
            <div className="section-heading compact">
              <h2 id="research-table-heading">Candidate screen</h2>
              <p>
                Unknown inputs remain unknown. A candidate is ranking-ready only
                when all three evidence dimensions are complete.
              </p>
            </div>
            <div className="table-shell evidence-shell">
              <table className="evidence-table research-universe-table">
                <thead>
                  <tr>
                    <th>Gross screen</th>
                    <th>Project</th>
                    <th>Founding unit</th>
                    <th className="number">Gross value</th>
                    <th className="number">Research estimate</th>
                    <th className="number">Published value</th>
                    <th>Status</th>
                    <th>Missing evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.candidates.map((candidate) => (
                    <tr key={candidate.projectId}>
                      <td className="rank">
                        {candidate.grossScreenRank ?? "—"}
                      </td>
                      <td>
                        <Link href={`/research/${candidate.projectId}/`}>
                          <strong>{candidate.project}</strong>
                        </Link>
                        <small>{candidate.ticker}</small>
                      </td>
                      <td>{candidate.foundersTeam}</td>
                      <td className="number">
                        {money(candidate.grossValueUsd)}
                      </td>
                      <td className="number">
                        {money(candidate.provisionalOutsideWealthUsd)}
                      </td>
                      <td className="number">
                        {money(candidate.canonicalOutsideWealthUsd)}
                      </td>
                      <td>
                        <span className="badge">
                          {candidate.publicationStatus}
                        </span>
                      </td>
                      <td>
                        {candidate.missingEvidence.join(" ") ||
                          "None recorded."}
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

  const id = projectId.length === 1 ? projectId[0] : undefined;
  const candidate = id
    ? dataset.candidates.find(
        ({ projectId: candidateId }) => candidateId === id,
      )
    : undefined;
  if (!candidate) notFound();

  const wallets = dataset.wallets.filter(
    ({ projectId: candidateId }) => candidateId === candidate.projectId,
  );
  const capitalRecords = dataset.capitalRecords.filter(
    ({ projectId: candidateId }) => candidateId === candidate.projectId,
  );
  const sourceIds = new Set(
    [
      candidate.grossSourceId,
      candidate.holdingsSourceId,
      candidate.capitalSourceId,
      ...wallets.map(({ sourceId }) => sourceId),
      ...capitalRecords.map(({ sourceId }) => sourceId),
    ].filter((sourceId): sourceId is string => sourceId !== null),
  );
  const sources = dataset.sources.filter(({ id: sourceId }) =>
    sourceIds.has(sourceId),
  );

  return (
    <>
      <SiteNav />
      <main className="detail-page" id="main-content" tabIndex={-1}>
        <header className="detail-hero">
          <p className="eyebrow">
            Research snapshot · {candidate.snapshotDate}
          </p>
          <h1>{candidate.project}</h1>
          <p>
            {candidate.foundersTeam}. This record is a dated evidence screen,
            not a live ranking or personal-wealth claim.
          </p>
        </header>

        <section className="metric-strip" aria-label="Research summary">
          <div>
            <span>Gross screen</span>
            <strong>#{candidate.grossScreenRank ?? "—"}</strong>
          </div>
          <div>
            <span>Publication status</span>
            <strong>{candidate.publicationStatus}</strong>
          </div>
          <div>
            <span>Research estimate</span>
            <strong>{money(candidate.provisionalOutsideWealthUsd)}</strong>
          </div>
          <div>
            <span>Published value</span>
            <strong>{money(candidate.canonicalOutsideWealthUsd)}</strong>
          </div>
        </section>

        <section className="panel" aria-labelledby="calculation-heading">
          <div className="section-heading compact">
            <h2 id="calculation-heading">Research calculation</h2>
            <p>{candidate.valuationBasis}</p>
          </div>
          <p className="formula-statement">
            Research estimate = gross value − known affiliated holdings
            exclusions − verified external capital − other known deductions.
            Missing deductions are not treated as zero for publication.
          </p>
          <div className="formula-grid">
            <div>
              <span>Gross value</span>
              <strong>{money(candidate.grossValueUsd)}</strong>
            </div>
            <div>
              <span>Known affiliated holdings</span>
              <strong>{money(candidate.knownFounderTeamExcludedUsd)}</strong>
            </div>
            <div>
              <span>Verified external capital</span>
              <strong>{money(candidate.verifiedExternalCapitalUsd)}</strong>
            </div>
            <div>
              <span>Other deductions</span>
              <strong>{money(candidate.otherDeductionsUsd)}</strong>
            </div>
          </div>
          <p className="equation">
            {money(candidate.grossValueUsd)} −{" "}
            {money(candidate.knownFounderTeamExcludedUsd)} −{" "}
            {money(candidate.verifiedExternalCapitalUsd)} −{" "}
            {money(candidate.otherDeductionsUsd)} ={" "}
            {money(candidate.provisionalOutsideWealthUsd)} research estimate
          </p>
        </section>

        <section className="panel" aria-labelledby="completeness-heading">
          <div className="section-heading compact">
            <h2 id="completeness-heading">Evidence completeness</h2>
            <p>{candidate.eligibilityNote}</p>
          </div>
          <div className="evidence-summary">
            <div>
              <span>Gross valuation</span>
              <strong>{candidate.grossStatus}</strong>
            </div>
            <div>
              <span>Affiliated holdings</span>
              <strong>{candidate.founderHoldingsStatus}</strong>
            </div>
            <div>
              <span>External capital</span>
              <strong>{candidate.capitalStatus}</strong>
            </div>
            <div>
              <span>Published rank</span>
              <strong>
                {candidate.canonicalRank ?? "Research in progress"}
              </strong>
            </div>
          </div>
          <p>
            <strong>Missing evidence:</strong>{" "}
            {candidate.missingEvidence.join(" ") || "None recorded."}
          </p>
          <p>
            <strong>Next action:</strong> {candidate.nextAction}
          </p>
        </section>

        <section className="panel" aria-labelledby="wallet-heading">
          <div className="section-heading compact">
            <h2 id="wallet-heading">Wallet and entity evidence</h2>
            <p>
              These records are excluded from live wallet synchronization and
              cannot change a published score.
            </p>
          </div>
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Owner/entity</th>
                  <th>Chain</th>
                  <th>Address/entity</th>
                  <th>Attribution</th>
                  <th>Confidence</th>
                  <th>Decision</th>
                  <th className="number">Snapshot holdings</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet, index) => {
                  const source = wallet.sourceId
                    ? dataset.sources.find(
                        ({ id: sourceId }) => sourceId === wallet.sourceId,
                      )
                    : undefined;
                  return (
                    <tr key={`${wallet.ownerEntity}-${index}`}>
                      <td>{wallet.ownerEntity}</td>
                      <td>{wallet.chain ?? "Unknown"}</td>
                      <td>
                        <code>{wallet.addressOrEntity ?? "Unknown"}</code>
                      </td>
                      <td>{wallet.attributionStatus}</td>
                      <td>{wallet.confidence}</td>
                      <td>{wallet.inclusionDecision}</td>
                      <td className="number">
                        {money(wallet.snapshotHoldingsUsd)}
                      </td>
                      <td>
                        {source ? (
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.id}
                          </a>
                        ) : wallet.sourceUrl ? (
                          <a
                            href={wallet.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Public source
                          </a>
                        ) : (
                          "None"
                        )}
                        <small>{wallet.notes}</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel" aria-labelledby="source-heading">
          <div className="section-heading compact">
            <h2 id="source-heading">Referenced sources</h2>
            <p>Public evidence referenced by this research record.</p>
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
                {sources.map((source) => (
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
          {capitalRecords.length ? (
            <p className="formula-statement">
              Capital evidence records: {capitalRecords.length}. The amount is
              shown in the calculation only when the importer accepts it as a
              verified deduction.
            </p>
          ) : null}
        </section>

        <p className="research-link">
          <Link href="/research/">← Back to the research universe</Link>
        </p>
      </main>
    </>
  );
}
