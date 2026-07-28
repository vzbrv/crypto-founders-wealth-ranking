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
  price_usd?: number | string | null;
  circulating_supply?: number | string | null;
  excluded_supply?: number | string | null;
  excluded_value_usd?: number | string | null;
  outside_holder_supply?: number | string | null;
  market_cap_usd?: number | string | null;
  capital_raised_usd?: number | string | null;
  data_freshness?: Record<string, unknown> | null;
  calculated_at?: string | null;
}

interface ApiWalletEvidence {
  wallet_id: string;
  balance?: number | string | null;
  balance_observed_at?: string | null;
  balance_provider?: string | null;
  deductible_balance?: number | string | null;
  deductible_value_usd?: number | string | null;
}

interface ApiLeaderboardRow {
  rank: number | null;
  score_usd: number | string | null;
  confidence_label: string;
  project_breakdown: unknown;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: number | null): string {
  if (value === null) return "Awaiting API observation";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function amount(value: number | null): string {
  if (value === null) return "Awaiting API observation";
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
    : "Not observed";
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
    <span className="warning-text">Source missing</span>
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
      fetch(`${baseUrl}/rest/v1/current_leaderboard?select=*`, {
        headers,
      }).then((response) => {
        if (!response.ok) throw new Error("Leaderboard unavailable");
        return response.json() as Promise<ApiLeaderboardRow[]>;
      }),
    ])
      .then(([details, walletRows, leaderboard]) => {
        const ranking = leaderboardMatch(leaderboard, evidence.project.id);
        setDetail({
          ...(details[0] ?? {}),
          rank: ranking?.rank ?? null,
          score_usd: ranking?.score_usd ?? details[0]?.score_usd ?? null,
          confidence_label:
            ranking?.confidence_label ?? evidence.project.confidenceLevel,
        });
        setApiWallets(walletRows);
      })
      .catch((error: unknown) => {
        setApiWarning(
          error instanceof Error
            ? error.message
            : "Live observations unavailable",
        );
      });
  }, [
    evidence.project.confidenceLevel,
    evidence.project.id,
    evidence.project.slug,
  ]);

  const values = useMemo(() => {
    const marketCap = numberOrNull(detail?.market_cap_usd);
    const excluded = numberOrNull(detail?.excluded_value_usd);
    const capital = numberOrNull(detail?.capital_raised_usd);
    return {
      marketCap,
      excluded,
      capital,
      score:
        marketCap !== null && excluded !== null && capital !== null
          ? calculateScoreBreakdown({
              marketCapUsd: marketCap,
              excludedValueUsd: excluded,
              capitalRaisedUsd: capital,
            })
          : numberOrNull(detail?.score_usd),
    };
  }, [detail]);

  const fundingTotal = evidence.fundingRounds
    .filter((round) => round.includeInCapitalDeduction)
    .reduce((total, round) => total + Number(round.amountUsdAtEvent), 0);
  const warnings = [
    apiWarning,
    ...evidence.wallets
      .filter((wallet) => wallet.circulatingInclusionFraction === null)
      .map(
        (wallet) =>
          `${wallet.label}: circulating fraction is unknown, so no holdings are deducted.`,
      ),
    evidence.project.methodologyNotes,
  ].filter((item): item is string => Boolean(item));

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
            <strong>{detail?.rank ?? "Unranked"}</strong>
          </div>
          <div>
            <span>Score</span>
            <strong>{money(values.score)}</strong>
          </div>
          <div>
            <span>Confidence</span>
            <strong>
              {detail?.confidence_label ?? evidence.project.confidenceLevel}
            </strong>
          </div>
        </div>
      </header>

      <section className="panel" aria-labelledby="formula-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Reproducible calculation</p>
            <h2 id="formula-heading">Score breakdown</h2>
          </div>
          <a href="/methodology/">Read methodology</a>
        </div>
        <p className="formula-statement">
          Market cap − approved affiliated circulating holdings − qualifying
          outside capital = estimated wealth created
        </p>
        <div className="formula-grid">
          <div>
            <span>Price</span>
            <strong>{money(numberOrNull(detail?.price_usd))}</strong>
            <small>API observation</small>
          </div>
          <div>
            <span>Circulating supply</span>
            <strong>{amount(numberOrNull(detail?.circulating_supply))}</strong>
            <small>API observation</small>
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
            <span>Final score</span>
            <strong>{money(values.score)}</strong>
            <small>Calculated result</small>
          </div>
        </div>
        <p className="equation" data-testid="score-equation">
          {values.marketCap === null ||
          values.excluded === null ||
          values.capital === null
            ? "The full numeric equation appears when canonical market and wallet observations are available."
            : `${money(values.marketCap)} − ${money(values.excluded)} − ${money(values.capital)} = ${money(values.score)}`}
        </p>
      </section>

      <section className="panel" aria-labelledby="wallet-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated + API evidence</p>
            <h2 id="wallet-heading">Wallet deductions</h2>
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
                const observed = apiWallets.find(
                  (row) => row.wallet_id === wallet.id,
                );
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
                        : "$0.00"}
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

      <section className="panel" aria-labelledby="funding-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Curated research</p>
            <h2 id="funding-heading">Outside capital</h2>
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

      <section className="panel evidence-summary">
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
