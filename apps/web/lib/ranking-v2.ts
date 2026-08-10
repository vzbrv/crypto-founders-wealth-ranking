import Decimal from "decimal.js";

const eligibilityStatuses = new Set(["eligible", "provisional", "ineligible"]);
const rankOrderStatuses = new Set([
  "exact",
  "tied",
  "overlapping",
  "indeterminate",
  "not_eligible",
]);
const confidenceStatuses = new Set(["insufficient", "low", "medium", "high"]);

export type CurrentRankingV2Row = {
  snapshot_id: string;
  economic_as_of: string;
  knowledge_cutoff: string;
  published_at: string;
  economic_project_id: string;
  project_slug: string;
  project_name: string;
  founder_team: string;
  value_created_lower: string;
  value_created_upper: string;
  eligibility_status: "eligible" | "provisional" | "ineligible";
  rank_min: number | null;
  rank_max: number | null;
  rank_order_status:
    "exact" | "tied" | "overlapping" | "indeterminate" | "not_eligible";
  confidence_status: "insufficient" | "low" | "medium" | "high";
  is_invalidated: boolean;
  invalidation_message: string | null;
  methodology_version_id: string;
  confidence_policy_version: string;
};

export type CurrentRankingV2 = {
  snapshotId: string;
  economicAsOf: string;
  knowledgeCutoff: string;
  publishedAt: string;
  rows: CurrentRankingV2Row[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function isTimestamp(value: unknown): value is string {
  return isText(value) && Number.isFinite(Date.parse(value));
}

export function isNewerPublishedSnapshot(
  status: string | undefined,
  candidatePublishedAt: string | null | undefined,
  currentPublishedAt: string,
): boolean {
  return (
    status === "published" &&
    isTimestamp(candidatePublishedAt) &&
    isTimestamp(currentPublishedAt) &&
    Date.parse(candidatePublishedAt) > Date.parse(currentPublishedAt)
  );
}

function isRank(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function parseDecimal(value: unknown): Decimal | null {
  if (!isText(value)) return null;
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : null;
  } catch {
    return null;
  }
}

function parseRow(value: unknown): CurrentRankingV2Row | null {
  if (!isRecord(value)) return null;
  const lower = parseDecimal(value.value_created_lower);
  const upper = parseDecimal(value.value_created_upper);
  if (
    !isText(value.snapshot_id) ||
    !isTimestamp(value.economic_as_of) ||
    !isTimestamp(value.knowledge_cutoff) ||
    !isTimestamp(value.published_at) ||
    !isText(value.economic_project_id) ||
    !isText(value.project_slug) ||
    !isText(value.project_name) ||
    !isText(value.founder_team) ||
    !lower?.isFinite() ||
    !upper?.isFinite() ||
    lower.gt(upper) ||
    !eligibilityStatuses.has(String(value.eligibility_status)) ||
    !rankOrderStatuses.has(String(value.rank_order_status)) ||
    !confidenceStatuses.has(String(value.confidence_status)) ||
    typeof value.is_invalidated !== "boolean" ||
    (value.invalidation_message !== null &&
      typeof value.invalidation_message !== "string") ||
    !isText(value.methodology_version_id) ||
    !isText(value.confidence_policy_version)
  ) {
    return null;
  }

  const ineligible = value.eligibility_status === "ineligible";
  if (
    (ineligible &&
      (value.rank_min !== null ||
        value.rank_max !== null ||
        value.rank_order_status !== "not_eligible")) ||
    (!ineligible &&
      (!isRank(value.rank_min) ||
        !isRank(value.rank_max) ||
        value.rank_min > value.rank_max ||
        value.rank_order_status === "not_eligible" ||
        ((value.rank_order_status === "exact" ||
          value.rank_order_status === "tied") &&
          value.rank_min !== value.rank_max)))
  ) {
    return null;
  }

  return value as unknown as CurrentRankingV2Row;
}

export function validateCurrentRankingV2(
  values: unknown,
): CurrentRankingV2 | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const rows = values.map(parseRow);
  if (rows.some((row) => row === null)) return null;
  const validRows = rows as CurrentRankingV2Row[];
  const first = validRows[0];
  if (!first) return null;
  if (
    validRows.some(
      (row) =>
        row.snapshot_id !== first.snapshot_id ||
        row.economic_as_of !== first.economic_as_of ||
        row.knowledge_cutoff !== first.knowledge_cutoff ||
        row.published_at !== first.published_at ||
        row.methodology_version_id !== first.methodology_version_id ||
        row.confidence_policy_version !== first.confidence_policy_version ||
        row.is_invalidated,
    ) ||
    new Set(validRows.map((row) => row.economic_project_id)).size !==
      validRows.length ||
    new Set(validRows.map((row) => row.project_slug)).size !== validRows.length
  ) {
    return null;
  }

  let previousRank = 0;
  let sawUnranked = false;
  const rankedCount = validRows.filter((row) => row.rank_min !== null).length;
  for (const row of validRows) {
    if (row.rank_min === null) {
      sawUnranked = true;
      continue;
    }
    if (
      sawUnranked ||
      row.rank_min < previousRank ||
      row.rank_max === null ||
      row.rank_max > rankedCount
    )
      return null;
    previousRank = row.rank_min;
  }

  return {
    snapshotId: first.snapshot_id,
    economicAsOf: first.economic_as_of,
    knowledgeCutoff: first.knowledge_cutoff,
    publishedAt: first.published_at,
    rows: validRows,
  };
}

export function formatV2Rank(row: CurrentRankingV2Row): string {
  if (row.rank_min === null || row.rank_max === null) return "Not eligible";
  return row.rank_min === row.rank_max
    ? String(row.rank_min)
    : `${row.rank_min}–${row.rank_max}`;
}

export function formatV2Value(row: CurrentRankingV2Row): string {
  const money = (value: string) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(new Decimal(value).toNumber());
  return new Decimal(row.value_created_lower).eq(row.value_created_upper)
    ? money(row.value_created_lower)
    : `${money(row.value_created_lower)}–${money(row.value_created_upper)}`;
}
