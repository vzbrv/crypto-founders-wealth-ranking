"use client";

import { useEffect, useMemo, useState } from "react";

import {
  calculateScoreBreakdown,
  explorerUrl,
  type ProjectEvidence,
  type SourceClaim,
} from "../lib/transparency";

interface ApiProjectDetail {
  rank?: number | null;
  score_usd?: number | string | null;
  confidence_label?: string | null;
  reviewed_confidence?: string | null;
  calculated_confidence_label?: string | null;
  confidence_total?: number | string | null;
  confidence_components?: unknown;
  confidence_explanation?: string | null;
  eligibility_status?: "ranked" | "research_in_progress" | null;
  ineligibility_reasons?: unknown;
  wallet_review_status?: string | null;
  wallet_review_reviewer?: string | null;
  wallet_review_reviewed_at?: string | null;
  wallet_review_evidence?: unknown;
  funding_review_status?: string | null;
  funding_review_reviewer?: string | null;
  funding_review_reviewed_at?: string | null;
  funding_review_evidence?: unknown;
  price_usd?: number | string | null;
  circulating_supply?: number | string | null;
  excluded_supply?: number | string | null;
  excluded_value_usd?: number | string | null;
  outside_holder_supply?: number | string | null;
  market_cap_usd?: number | string | null;
  capital_raised_usd?: number | string | null;
  data_freshness?: Record<string, unknown> | null;
  calculated_at?: string | null;
  market_observation_id?: string | null;
  market_provider?: string | null;
  market_source_url?: string | null;
  market_source_description?: string | null;
  market_observed_at?: string | null;
  market_fetched_at?: string | null;
  market_freshness_status?: "current" | "stale" | "unknown" | null;
}

interface ApiWalletEvidence {
  id: string;
  balance?: number | string | null;
  balance_observed_at?: string | null;
  balance_provider?: string | null;
  deductible_balance?: number | string | null;
  deductible_value_usd?: number | string | null;
  review_status?: string | null;
  reviewer?: string | null;
  reviewed_at?: string | null;
  evidence_source_ids?: unknown;
  review_evidence?: unknown;
  market_observation_id?: string | null;
  market_provider?: string | null;
  market_source_url?: string | null;
  market_source_description?: string | null;
  market_observed_at?: string | null;
  market_fetched_at?: string | null;
  market_freshness_status?: "current" | "stale" | "unknown" | null;
}

interface ApiArkhamEvidence {
  id: string;
  entity_name?: string | null;
  searched_alias?: string | null;
  chain_code?: string | null;
  address?: string | null;
  owner_class?: string | null;
  attribution_class?: string | null;
  expected_project_token_symbol?: string | null;
  token_quantity?: number | string | null;
  arkham_quote_time?: string | null;
  ingested_at?: string | null;
  review_status?: string | null;
  ownership_confidence?: string | null;
  circulating_inclusion_fraction?: number | string | null;
  score_affecting?: boolean | null;
  evidence_status?: string | null;
  exclusion_reason?: string | null;
  source_endpoint?: string | null;
}

interface ApiArkhamCoverage {
  id: string;
  searched_alias: string;
  entity_found?: boolean | null;
  discovery_status?: string | null;
  entity_id?: string | null;
  entity_name?: string | null;
  chain_code?: string | null;
  owner_class?: string | null;
  attribution_class?: string | null;
  review_status?: string | null;
  ownership_confidence?: string | null;
  score_affecting?: boolean | null;
  exclusion_reason?: string | null;
  observed_at?: string | null;
  last_success_at?: string | null;
  source_endpoint?: string | null;
  notes?: string | null;
}

interface ReviewEvidence {
  id: string;
  title: string;
  url: string;
  publisher: string;
}

interface ApiLeaderboardRow {
  rank: number | null;
  score_usd: number | string | null;
  confidence_label: string;
  reviewed_confidence?: string | null;
  eligibility_status?: "ranked" | "research_in_progress";
  ineligibility_reasons?: unknown;
  project_breakdown: unknown;
}

interface ConfidenceComponent {
  component: string;
  maximumScore: number | null;
  score: number | null;
  complete: boolean;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function confidenceComponents(value: unknown): ConfidenceComponent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const component = item as Record<string, unknown>;
    if (typeof component.component !== "string") return [];
    return [
      {
        component: component.component,
        maximumScore: numberOrNull(component.maximumScore),
        score: numberOrNull(component.score),
        complete: component.complete === true,
      },
    ];
  });
}

function confidenceComponentName(component: string): string {
  return component.replace(/_/g, " ");
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function money(value: number | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function amount(value: number | null): string {
  if (value === null) return "Unknown";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(
    value,
  );
}

function date(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Unknown";
}

function reviewEvidence(value: unknown): ReviewEvidence[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const source = item as Record<string, unknown>;
    if (
      typeof source.id !== "string" ||
      typeof source.title !== "string" ||
      typeof source.url !== "string" ||
      typeof source.publisher !== "string"
    ) {
      return [];
    }
    return [
      {
        id: source.id,
        title: source.title,
        url: source.url,
        publisher: source.publisher,
      },
    ];
  });
}

function claimFor(claims: SourceClaim[], recordId: string, field?: string) {
  return claims.find(
    (claim) => claim.recordId === recordId && (!field || claim.field === field),
  );
}

function SourceLink({ claim }: { claim: SourceClaim | undefined }) {
  return claim ? (
    <a href={claim.source.url} rel="noreferrer" target="_blank">
      {claim.source.publisher}
    </a>
  ) : (
    <span className="warning-text">Unknown — missing evidence</span>
  );
}

function ReviewEvidenceLinks({ value }: { value: unknown }) {
  const sources = reviewEvidence(value);
  return sources.length > 0 ? (
    <>
      {sources.map((source, index) => (
        <span key={source.id}>
          {index > 0 ? ", " : ""}
          <a href={source.url} rel="noreferrer" target="_blank">
            {source.publisher}
          </a>
        </span>
      ))}
    </>
  ) : (
    <span className="warning-text">Unknown — missing evidence</span>
  );
}

function leaderboardMatch(
  rows: ApiLeaderboardRow[],
  projectId: string,
): ApiLeaderboardRow | null {
  return (
    rows.find(
      (row) =>
        Array.isArray(row.project_breakdown) &&
        row.project_breakdown.some((item) => {
          if (!item || typeof item !== "object") return false;
          return (item as Record<string, unknown>).projectId === projectId;
        }),
    ) ?? null
  );
}

export function ProjectDetail({ evidence }: { evidence: ProjectEvidence }) {
  const [detail, setDetail] = useState<ApiProjectDetail | null>(null);
  const [apiWallets, setApiWallets] = useState<ApiWalletEvidence[]>([]);
  const [apiArkhamEvidence, setApiArkhamEvidence] = useState<
    ApiArkhamEvidence[]
  >([]);
  const [apiArkhamCoverage, setApiArkhamCoverage] = useState<
    ApiArkhamCoverage[]
  >([]);
  const [apiWarning, setApiWarning] = useState<string | null>(() =>
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      ? null
      : "Live API observations are not configured in this build; curated evidence remains visible.",
  );

  useEffect(() => {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!baseUrl || !key) return;
    const headers = { apikey: key, Authorization: `Bearer ${key}` };
    const slug = encodeURIComponent(evidence.project.slug);
    Promise.all([
      fetch(
        `${baseUrl}/rest/v1/public_project_details?select=*&slug=eq.${slug}`,
        { headers },
      ).then((response) => {
        if (!response.ok) throw new Error("Project calculation unavailable");
        return response.json() as Promise<ApiProjectDetail[]>;
      }),
      fetch(
        `${baseUrl}/rest/v1/public_wallet_evidence?select=*&project_slug=eq.${slug}`,
        { headers },
      ).then((response) => {
        if (!response.ok) throw new Error("Wallet evidence unavailable");
        return response.json() as Promise<ApiWalletEvidence[]>;
      }),
      fetch(`${baseUrl}/rest/v1/public_leaderboard?select=*`, {
        headers,
      }).then((response) => {
        if (!response.ok) throw new Error("Leaderboard unavailable");
        return response.json() as Promise<ApiLeaderboardRow[]>;
      }),
      fetch(
        `${baseUrl}/rest/v1/public_arkham_evidence?select=*&project_slug=eq.${slug}`,
        { headers },
      ).then((response) => {
        if (!response.ok) throw new Error("Arkham evidence unavailable");
        return response.json() as Promise<ApiArkhamEvidence[]>;
      }),
      fetch(
        `${baseUrl}/rest/v1/public_arkham_coverage?select=*&project_slug=eq.${slug}`,
        { headers },
      ).then((response) => {
        if (!response.ok) throw new Error("Arkham coverage unavailable");
        return response.json() as Promise<ApiArkhamCoverage[]>;
      }),
    ])
      .then(
        ([
          details,
          walletRows,
          leaderboard,
          arkhamEvidence,
          arkhamCoverage,
        ]) => {
          const ranking = leaderboardMatch(leaderboard, evidence.project.id);
          const calculatedConfidenceLabel =
            details[0]?.calculated_confidence_label ??
            details[0]?.confidence_label ??
            ranking?.confidence_label ??
            "insufficient";
          setDetail({
            ...(details[0] ?? {}),
            rank: ranking?.rank ?? null,
            score_usd: ranking?.score_usd ?? details[0]?.score_usd ?? null,
            confidence_label: calculatedConfidenceLabel,
            calculated_confidence_label: calculatedConfidenceLabel,
            reviewed_confidence: calculatedConfidenceLabel,
            eligibility_status:
              ranking?.eligibility_status ??
              details[0]?.eligibility_status ??
              null,
            ineligibility_reasons:
              ranking?.ineligibility_reasons ??
              details[0]?.ineligibility_reasons ??
              [],
          });
          setApiWallets(walletRows);
          setApiArkhamEvidence(arkhamEvidence);
          setApiArkhamCoverage(arkhamCoverage);
        },
      )
      .catch((error: unknown) => {
        setApiWarning(
          error instanceof Error
            ? error.message
            : "Live observations unavailable",
        );
      });
  }, [evidence.project.id, evidence.project.slug]);

  const values = useMemo(() => {
    const marketCap = numberOrNull(detail?.market_cap_usd);
    const excluded = numberOrNull(detail?.excluded_value_usd);
    const capital = numberOrNull(detail?.capital_raised_usd);
    return {
      marketCap,
      excluded,
      capital,
      score:
        detail?.eligibility_status === "ranked" &&
        marketCap !== null &&
        excluded !== null &&
        capital !== null
          ? calculateScoreBreakdown({
              marketCapUsd: marketCap,
              excludedValueUsd: excluded,
              capitalRaisedUsd: capital,
            })
          : detail?.eligibility_status === "ranked"
            ? numberOrNull(detail?.score_usd)
            : null,
    };
  }, [detail]);

  const includedFunding = evidence.fundingRounds.filter(
    (round) => round.includeInCapitalDeduction,
  );
  const fundingTotal =
    includedFunding.length > 0 &&
    includedFunding.every(
      (round) =>
        round.reviewStatus === "approved_sufficient" &&
        numberOrNull(round.amountUsdAtEvent) !== null,
    )
      ? includedFunding.reduce(
          (total, round) => total + Number(round.amountUsdAtEvent),
          0,
        )
      : null;
  const warnings = [
    apiWarning,
    ...strings(detail?.ineligibility_reasons),
    ...evidence.wallets
      .filter((wallet) => wallet.circulatingInclusionFraction === null)
      .map(
        (wallet) =>
          `${wallet.label}: circulating fraction is unknown, so no holdings are deducted.`,
      ),
    evidence.project.methodologyNotes,
  ].filter((item): item is string => Boolean(item));
  const confidenceRows = confidenceComponents(detail?.confidence_components);
  const confidenceTotal = numberOrNull(detail?.confidence_total);
  const confidenceLabel =
    detail?.calculated_confidence_label ??
    detail?.confidence_label ??
    "insufficient";
  const acceptedArkham = apiArkhamEvidence.filter(
    (row) => row.score_affecting === true,
  );
  const predictedArkham = apiArkhamEvidence.filter(
    (row) => row.attribution_class === "predicted",
  );
  const custodialArkham = apiArkhamEvidence.filter(
    (row) => row.evidence_status === "custodial_excluded",
  );
  const lastArkhamVerified = [
    ...apiArkhamEvidence.map((row) => row.ingested_at),
    ...apiArkhamCoverage.map((row) => row.last_success_at),
  ]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return (
    <main className="detail-page" id="main-content" tabIndex={-1}>
      <header className="detail-hero">
        <p className="eyebrow">Project evidence</p>
        <h1>{evidence.project.name}</h1>
        <p>{evidence.project.description}</p>
        <div className="metric-strip">
          <div>
            <span>Founding unit</span>
            <strong>
              {evidence.foundingUnit?.displayName ?? "Not mapped"}
            </strong>
          </div>
          <div>
            <span>Rank</span>
            <strong>{detail?.rank ?? "Research in progress"}</strong>
          </div>
          <div>
            <span>Estimated outside-holder token value</span>
            <strong>{money(values.score)}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>{confidenceLabel}</strong>
          </div>
        </div>
      </header>

      <section
        className="panel"
        id="calculation"
        aria-labelledby="formula-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reproducible calculation</p>
            <h2 id="formula-heading">Score breakdown</h2>
          </div>
          <a href="/methodology/">Read methodology</a>
        </div>
        <p className="formula-statement">
          Estimated outside-holder token value = max(0, circulating market value
          − reviewed affiliated circulating holdings − reviewed disclosed
          outside capital). This is an estimate, not personal wealth.
        </p>
        <div className="formula-grid" id="market-data">
          <div
            data-testid="market-observation"
            data-market-observation-id={
              detail?.market_observation_id ?? undefined
            }
          >
            <span>Market observation</span>
            <strong>
              {detail?.market_source_url ? (
                <a
                  href={detail.market_source_url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {detail.market_source_description ??
                    detail.market_provider ??
                    "Market data source"}
                </a>
              ) : (
                <span className="warning-text">Unknown — missing evidence</span>
              )}
            </strong>
            <small>
              Observation {detail?.market_observation_id ?? "Unknown"} ·
              Observed {date(detail?.market_observed_at)} · Fetched{" "}
              {date(detail?.market_fetched_at)} ·{" "}
              {detail?.market_freshness_status ?? "unknown"}
            </small>
          </div>
          <div>
            <span>Price</span>
            <strong>{money(numberOrNull(detail?.price_usd))}</strong>
            <small>Linked market observation</small>
          </div>
          <div>
            <span>Circulating supply</span>
            <strong>{amount(numberOrNull(detail?.circulating_supply))}</strong>
            <small>Linked market observation</small>
          </div>
          <div>
            <span>Excluded supply</span>
            <strong>{amount(numberOrNull(detail?.excluded_supply))}</strong>
            <small>Calculated from approved wallets</small>
          </div>
          <div>
            <span>Outside-holder supply</span>
            <strong>
              {amount(numberOrNull(detail?.outside_holder_supply))}
            </strong>
            <small>Calculated</small>
          </div>
          <div>
            <span>Market cap</span>
            <strong>{money(values.marketCap)}</strong>
            <small>Price × circulating supply</small>
          </div>
          <div>
            <span>Excluded value</span>
            <strong>{money(values.excluded)}</strong>
            <small>Price × deductible balance</small>
          </div>
          <div>
            <span>Capital deducted</span>
            <strong>{money(values.capital ?? fundingTotal)}</strong>
            <small>Curated funding records</small>
          </div>
          <div>
            <span>Estimated outside-holder token value</span>
            <strong>{money(values.score)}</strong>
            <small>
              {detail?.eligibility_status === "ranked"
                ? "Ranked"
                : "Research in progress"}
            </small>
          </div>
        </div>
        <p
          className="equation"
          data-testid="score-equation"
          data-market-observation-id={
            detail?.market_observation_id ?? undefined
          }
        >
          {values.marketCap === null ||
          values.excluded === null ||
          values.capital === null
            ? "The full numeric equation appears when published market and wallet observations are available."
            : `max(0, ${money(values.marketCap)} − ${money(values.excluded)} − ${money(values.capital)}) = ${money(values.score)}`}
        </p>
      </section>

      <section
        className="panel"
        id="confidence"
        aria-labelledby="confidence-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Calculated from stored evidence</p>
            <h2 id="confidence-heading">Confidence explanation</h2>
          </div>
        </div>
        <div className="formula-grid">
          <div>
            <span>Calculated label</span>
            <strong>{confidenceLabel}</strong>
            <small>Used for ranking eligibility</small>
          </div>
          <div>
            <span>Total</span>
            <strong>
              {confidenceTotal === null
                ? "Unavailable"
                : `${confidenceTotal.toFixed(2)} / 100`}
            </strong>
            <small>Required evidence components</small>
          </div>
        </div>
        <p>
          {detail?.confidence_explanation ??
            "Calculated confidence is unavailable until a current calculation is published."}
        </p>
        <div className="table-shell evidence-shell">
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Score</th>
                <th>Maximum</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {confidenceRows.length > 0 ? (
                confidenceRows.map((component) => (
                  <tr key={component.component}>
                    <td>{confidenceComponentName(component.component)}</td>
                    <td>
                      {component.score === null
                        ? "Missing"
                        : component.score.toFixed(2)}
                    </td>
                    <td>
                      {component.maximumScore === null
                        ? "Unknown"
                        : component.maximumScore.toFixed(2)}
                    </td>
                    <td>{component.complete ? "Complete" : "Incomplete"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4}>
                    No current confidence evidence is published.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" id="wallets" aria-labelledby="wallet-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated + API evidence</p>
            <h2 id="wallet-heading">Wallet deductions</h2>
            <p>
              Review:{" "}
              {detail?.wallet_review_status ??
                evidence.project.walletReview.status}
              {detail?.wallet_review_reviewer ||
              evidence.project.walletReview.reviewer
                ? ` · ${detail?.wallet_review_reviewer ?? evidence.project.walletReview.reviewer}`
                : ""}
              {detail?.wallet_review_reviewed_at ||
              evidence.project.walletReview.reviewedAt
                ? ` · ${date(detail?.wallet_review_reviewed_at ?? evidence.project.walletReview.reviewedAt)}`
                : ""}
              <br />
              Review evidence:{" "}
              <ReviewEvidenceLinks value={detail?.wallet_review_evidence} />
            </p>
          </div>
        </div>
        <div className="table-shell evidence-shell">
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Wallet</th>
                <th>Classification</th>
                <th>Balance</th>
                <th>Circulating fraction</th>
                <th>Deductible</th>
                <th>Value</th>
                <th>Confidence</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {evidence.wallets.map((wallet) => {
                const observed = apiWallets.find((row) => row.id === wallet.id);
                const explorer = explorerUrl(wallet.chainCode, wallet.address);
                return (
                  <tr key={wallet.id}>
                    <td>
                      <strong>{wallet.label}</strong>
                      <code>{wallet.address}</code>
                      {explorer && (
                        <a href={explorer} rel="noreferrer" target="_blank">
                          Explorer
                        </a>
                      )}
                    </td>
                    <td>{wallet.classification}</td>
                    <td>
                      {amount(numberOrNull(observed?.balance))}
                      <small>
                        {date(observed?.balance_observed_at)} ·{" "}
                        {observed?.balance_provider ?? "API pending"}
                      </small>
                    </td>
                    <td>{wallet.circulatingInclusionFraction ?? "Unknown"}</td>
                    <td>
                      {wallet.affectsScore &&
                      wallet.circulatingInclusionFraction !== null
                        ? amount(numberOrNull(observed?.deductible_balance))
                        : "No deduction"}
                    </td>
                    <td>
                      {wallet.affectsScore &&
                      wallet.circulatingInclusionFraction !== null
                        ? money(numberOrNull(observed?.deductible_value_usd))
                        : "No deduction"}
                    </td>
                    <td>{wallet.ownershipConfidence}</td>
                    <td>
                      <SourceLink
                        claim={claimFor(
                          evidence.sourceClaims,
                          wallet.id,
                          "ownership",
                        )}
                      />
                      <br />
                      Review evidence:{" "}
                      <ReviewEvidenceLinks value={observed?.review_evidence} />
                      <small>
                        Reviewed {date(wallet.researchReviewedAt)}
                        <br />
                        {wallet.notes}
                      </small>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="panel"
        id="arkham-evidence"
        aria-labelledby="arkham-heading"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Server-side research evidence</p>
            <h2 id="arkham-heading">Arkham affiliated holdings</h2>
            <p>
              Accepted Arkham holdings are known-entity subtotals only. Coverage
              is incomplete; predicted wallets, custodial assets, unrelated
              tokens and unreviewed mappings do not affect the rank. Last
              verified {date(lastArkhamVerified)}.
            </p>
          </div>
        </div>
        <div className="formula-grid">
          <div>
            <span>Accepted holdings</span>
            <strong>{acceptedArkham.length}</strong>
            <small>Approved score-affecting rows</small>
          </div>
          <div>
            <span>Predictions excluded</span>
            <strong>{predictedArkham.length}</strong>
            <small>Research only</small>
          </div>
          <div>
            <span>Custodial assets excluded</span>
            <strong>{custodialArkham.length}</strong>
            <small>No affiliated deduction</small>
          </div>
          <div>
            <span>Coverage rows</span>
            <strong>{apiArkhamCoverage.length}</strong>
            <small>Missing remains Unknown</small>
          </div>
        </div>
        {apiArkhamEvidence.length > 0 ? (
          <div className="table-shell evidence-shell">
            <table className="evidence-table">
              <thead>
                <tr>
                  <th>Alias / entity</th>
                  <th>Chain</th>
                  <th>Project token quantity</th>
                  <th>Treatment</th>
                  <th>Review</th>
                  <th>Observed</th>
                </tr>
              </thead>
              <tbody>
                {apiArkhamEvidence.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.searched_alias ?? "Unknown"}</strong>
                      <small>
                        {row.entity_name ?? "Entity name unavailable"}
                      </small>
                    </td>
                    <td>{row.chain_code ?? "Unknown"}</td>
                    <td>{amount(numberOrNull(row.token_quantity))}</td>
                    <td>
                      {row.evidence_status ?? "review_required"}
                      {row.exclusion_reason ? (
                        <small>{row.exclusion_reason}</small>
                      ) : null}
                    </td>
                    <td>
                      {row.review_status ?? "Unknown"} ·{" "}
                      {row.ownership_confidence ?? "Unknown"}
                    </td>
                    <td>{date(row.arkham_quote_time ?? row.ingested_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="warning-text">
            No Arkham balance has passed the review gate for this project.
            Unknown remains null; absence of Arkham data is not zero.
          </p>
        )}
      </section>

      <section className="panel" id="funding" aria-labelledby="funding-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated research</p>
            <h2 id="funding-heading">Outside capital</h2>
            <p>
              Review:{" "}
              {detail?.funding_review_status ??
                evidence.project.fundingReview.status}
              {detail?.funding_review_reviewer ||
              evidence.project.fundingReview.reviewer
                ? ` · ${detail?.funding_review_reviewer ?? evidence.project.fundingReview.reviewer}`
                : ""}
              {detail?.funding_review_reviewed_at ||
              evidence.project.fundingReview.reviewedAt
                ? ` · ${date(detail?.funding_review_reviewed_at ?? evidence.project.fundingReview.reviewedAt)}`
                : ""}
              <br />
              Review evidence:{" "}
              <ReviewEvidenceLinks value={detail?.funding_review_evidence} />
            </p>
          </div>
        </div>
        <div className="table-shell evidence-shell">
          <table className="evidence-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Round</th>
                <th>Original amount</th>
                <th>USD at event</th>
                <th>Included</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {evidence.fundingRounds.map((round) => (
                <tr key={round.id}>
                  <td>{round.eventDate}</td>
                  <td>{round.roundType}</td>
                  <td>
                    {round.originalAmount ?? "Unknown"}{" "}
                    {round.originalCurrency ?? ""}
                  </td>
                  <td>
                    {money(numberOrNull(round.amountUsdAtEvent))}
                    <small>
                      {round.conversionMethod ?? "Conversion method missing"}
                    </small>
                  </td>
                  <td>{round.includeInCapitalDeduction ? "Yes" : "No"}</td>
                  <td>
                    <SourceLink
                      claim={claimFor(
                        evidence.sourceClaims,
                        round.id,
                        "amountUsdAtEvent",
                      )}
                    />
                    <small>Reviewed {date(round.reviewedAt)}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel evidence-summary" id="evidence">
        <div>
          <p className="eyebrow">Claim-level provenance</p>
          <h2>{evidence.sourceClaims.length} sourced claims</h2>
          <p>
            Manual identity, classification, circulation, attribution, and
            funding inputs link to their supporting records.
          </p>
          <a href={`/sources/?project=${evidence.project.slug}`}>
            Inspect source registry
          </a>
        </div>
        <div>
          <p className="eyebrow">Freshness</p>
          <h2>{date(detail?.calculated_at)}</h2>
          <p>
            Research reviewed {date(evidence.project.researchReviewedAt)}.
            Market and balance timestamps come from API observations.
          </p>
        </div>
      </section>

      <section className="warning-panel" aria-labelledby="warnings-heading">
        <h2 id="warnings-heading">Warnings and limitations</h2>
        <ul>
          {warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
