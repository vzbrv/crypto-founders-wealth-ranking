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
}

export interface RawProjectDetail {
  id: string;
  slug: string;
  name: string;
  symbol: string | null;
  market_cap_usd: number | string | null;
  outside_holder_value_usd: number | string | null;
  capital_raised_usd: number | string | null;
  data_freshness: unknown;
  calculated_at: string | null;
}

export interface RankingEntry {
  rank: number | null;
  rankChange: number | null;
  scoreUsd: number | null;
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
  }>;
  excludedHoldingsUsd: number | null;
  capitalDeductedUsd: number | null;
  freshestObservationAt: string;
  warnings: string[];
  status: "ranked" | "research";
}

interface ProjectBreakdownItem {
  projectId: string;
  attributionFraction: number;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
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
    const attributionFraction = numberOrNull(record.attributionFraction);
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
    let excludedHoldingsUsd = 0;
    let capitalDeductedUsd = 0;
    let hasExcludedDetail = false;
    let hasCapitalDetail = false;
    const observations: string[] = [];

    const projects = linkedProjects.flatMap(
      ({ projectId, attributionFraction }) => {
        const project = projectsById.get(projectId);
        if (!project) return [];

        const marketCap = numberOrNull(project.market_cap_usd);
        const outsideValue = numberOrNull(project.outside_holder_value_usd);
        const capitalRaised = numberOrNull(project.capital_raised_usd);
        if (marketCap !== null && outsideValue !== null) {
          excludedHoldingsUsd +=
            Math.max(0, marketCap - outsideValue) * attributionFraction;
          hasExcludedDetail = true;
        }
        if (capitalRaised !== null) {
          capitalDeductedUsd += capitalRaised * attributionFraction;
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
          },
        ];
      },
    );

    const normalizedConfidence = confidence(row.confidence_label);
    return {
      rank: row.rank,
      rankChange: row.rank_change,
      scoreUsd: numberOrNull(row.score_usd),
      confidence: normalizedConfidence,
      calculatedAt: row.calculated_at,
      foundingUnitId: row.founding_unit_id,
      slug: row.slug,
      displayName: row.display_name,
      description: row.description,
      imageUrl: row.image_url,
      iqWikiSlug: row.iq_wiki_slug,
      projects,
      excludedHoldingsUsd: hasExcludedDetail ? excludedHoldingsUsd : null,
      capitalDeductedUsd: hasCapitalDetail ? capitalDeductedUsd : null,
      freshestObservationAt: observations.sort().at(-1) ?? row.calculated_at,
      warnings: warnings(row.warnings),
      status:
        row.rank === null || normalizedConfidence === "insufficient"
          ? "research"
          : "ranked",
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
