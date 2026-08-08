import Decimal from "decimal.js";

import { decimalOrNull, type DecimalString } from "./decimal";

export type Confidence = "high" | "medium" | "low" | "insufficient";

export interface RawLeaderboardRow {
  rank: number | null;
  previous_rank: number | null;
  rank_change: number | null;
  score_usd: number | string | null;
  confidence_label: string;
  calculated_at: string;
  founding_unit_id: string;
  slug: string;
  display_name: string;
  description: string | null;
  image_url: string | null;
  iq_wiki_slug: string | null;
  project_breakdown: unknown;
  warnings: unknown;
  eligibility_status: "ranked" | "research_in_progress";
  ineligibility_reasons: unknown;
  research_status: "Ranked" | "Research in progress";
  wallet_review_status?: string | null;
  funding_review_status?: string | null;
  calculation_links?: unknown;
  is_stale?: boolean;
  stale_reason?: string | null;
}

export interface RawProjectDetail {
  id: string;
  slug: string;
  name: string;
  symbol: string | null;
  market_cap_usd: number | string | null;
  outside_holder_value_usd: number | string | null;
  excluded_value_usd: number | string | null;
  capital_raised_usd: number | string | null;
  score_usd?: number | string | null;
  price_usd?: number | string | null;
  circulating_supply?: number | string | null;
  excluded_supply?: number | string | null;
  outside_holder_supply?: number | string | null;
  data_freshness: unknown;
  calculated_at: string | null;
  eligibility_status?: "ranked" | "research_in_progress" | null;
  ineligibility_reasons?: unknown;
  wallet_review_status?: string | null;
  funding_review_status?: string | null;
}

export interface RankingEntry {
  rank: number | null;
  rankChange: number | null;
  scoreUsd: DecimalString | null;
  confidence: Confidence;
  calculatedAt: string;
  foundingUnitId: string;
  slug: string;
  displayName: string;
  description: string | null;
  imageUrl: string | null;
  iqWikiSlug: string | null;
  projects: Array<{
    id: string;
    slug: string;
    name: string;
    symbol: string | null;
    attributionFraction: DecimalString;
    canonicalScoreUsd: DecimalString | null;
    canonicalPriceUsd: DecimalString | null;
    circulatingSupply: DecimalString | null;
    excludedSupply: DecimalString | null;
    outsideHolderSupply: DecimalString | null;
    capitalRaisedUsd: DecimalString | null;
  }>;
  excludedHoldingsUsd: DecimalString | null;
  capitalDeductedUsd: DecimalString | null;
  freshestObservationAt: string;
  warnings: string[];
  eligibilityStatus: "ranked" | "research_in_progress";
  ineligibilityReasons: string[];
  walletReviewStatus: string | null;
  fundingReviewStatus: string | null;
  isStale: boolean;
  staleReason: string | null;
  status: "ranked" | "research";
}

interface ProjectBreakdownItem {
  projectId: string;
  attributionFraction: DecimalString;
}

function confidence(value: string): Confidence {
  return value === "high" || value === "medium" || value === "low"
    ? value
    : "insufficient";
}

function breakdown(value: unknown): ProjectBreakdownItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const projectId = record.projectId;
    const attributionFraction = decimalOrNull(record.attributionFraction);
    return typeof projectId === "string" && attributionFraction !== null
      ? [{ projectId, attributionFraction }]
      : [];
  });
}

function warnings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function marketObservedAt(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const observedAt = (value as Record<string, unknown>).marketObservedAt;
  return typeof observedAt === "string" ? observedAt : null;
}

export function buildRankingEntries(
  rows: RawLeaderboardRow[],
  projectDetails: RawProjectDetail[],
): RankingEntry[] {
  const projectsById = new Map(
    projectDetails.map((project) => [project.id, project]),
  );

  return rows.map((row) => {
    const linkedProjects = breakdown(row.project_breakdown);
    let excludedHoldingsUsd = new Decimal(0);
    let capitalDeductedUsd = new Decimal(0);
    let hasExcludedDetail = false;
    let hasCapitalDetail = false;
    const observations: string[] = [];

    const projects = linkedProjects.flatMap(
      ({ projectId, attributionFraction }) => {
        const project = projectsById.get(projectId);
        if (!project) return [];

        const excludedValue = decimalOrNull(project.excluded_value_usd);
        const capitalRaised = decimalOrNull(project.capital_raised_usd);
        if (excludedValue !== null) {
          excludedHoldingsUsd = excludedHoldingsUsd.plus(
            new Decimal(excludedValue).times(attributionFraction),
          );
          hasExcludedDetail = true;
        }
        if (capitalRaised !== null) {
          capitalDeductedUsd = capitalDeductedUsd.plus(
            new Decimal(capitalRaised).times(attributionFraction),
          );
          hasCapitalDetail = true;
        }
        const observedAt = marketObservedAt(project.data_freshness);
        if (observedAt) observations.push(observedAt);

        return [
          {
            id: project.id,
            slug: project.slug,
            name: project.name,
            symbol: project.symbol,
            attributionFraction,
            canonicalScoreUsd: decimalOrNull(project.score_usd),
            canonicalPriceUsd: decimalOrNull(project.price_usd),
            circulatingSupply: decimalOrNull(project.circulating_supply),
            excludedSupply: decimalOrNull(project.excluded_supply),
            outsideHolderSupply: decimalOrNull(project.outside_holder_supply),
            capitalRaisedUsd: capitalRaised,
          },
        ];
      },
    );

    const normalizedConfidence = confidence(row.confidence_label);
    return {
      rank: row.rank,
      rankChange: row.rank_change,
      scoreUsd: decimalOrNull(row.score_usd),
      confidence: normalizedConfidence,
      calculatedAt: row.calculated_at,
      foundingUnitId: row.founding_unit_id,
      slug: row.slug,
      displayName: row.display_name,
      description: row.description,
      imageUrl: row.image_url,
      iqWikiSlug: row.iq_wiki_slug,
      projects,
      excludedHoldingsUsd: hasExcludedDetail
        ? excludedHoldingsUsd.toString()
        : null,
      capitalDeductedUsd: hasCapitalDetail
        ? capitalDeductedUsd.toString()
        : null,
      freshestObservationAt: observations.sort().at(-1) ?? row.calculated_at,
      warnings: warnings(row.warnings),
      eligibilityStatus: row.eligibility_status,
      ineligibilityReasons: warnings(row.ineligibility_reasons),
      walletReviewStatus: row.wallet_review_status ?? null,
      fundingReviewStatus: row.funding_review_status ?? null,
      isStale: row.is_stale ?? false,
      staleReason: row.stale_reason ?? null,
      status: row.eligibility_status === "ranked" ? "ranked" : "research",
    };
  });
}

export function filterEntries(
  entries: RankingEntry[],
  query: string,
  confidenceFilter: string,
  projectFilter: string,
): RankingEntry[] {
  const needle = query.trim().toLocaleLowerCase();
  return entries.filter((entry) => {
    const matchesSearch =
      !needle ||
      entry.displayName.toLocaleLowerCase().includes(needle) ||
      entry.projects.some((project) =>
        `${project.name} ${project.symbol ?? ""}`
          .toLocaleLowerCase()
          .includes(needle),
      );
    const matchesConfidence =
      confidenceFilter === "all" || entry.confidence === confidenceFilter;
    const matchesProject =
      projectFilter === "all" ||
      entry.projects.some((project) => project.id === projectFilter);
    return matchesSearch && matchesConfidence && matchesProject;
  });
}

export function freshnessLabel(
  observedAt: string,
  now = Date.now(),
): "Live" | "Recent" | "Stale" {
  const age = now - Date.parse(observedAt);
  if (!Number.isFinite(age) || age > 60 * 60 * 1000) return "Stale";
  if (age > 10 * 60 * 1000) return "Recent";
  return "Live";
}
