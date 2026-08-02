export type SnapshotStatus = "current" | "stale" | "historical";

export interface HourlySnapshotSource {
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  fetchedAt: string;
}

export interface HourlySnapshotResult {
  entryId: string;
  rank: number;
  valueType: "Token/network" | "Public company";
  grossValueUsd: string | null;
  finalValueUsd: string | null;
  founderAffiliateDeductionUsd: string | null;
  outsideCapitalDeductionUsd: string | null;
  confidenceScore: number;
  confidenceLabel: string;
  sourceIds: readonly string[];
  observationAt: string;
  status: SnapshotStatus;
}

export interface HourlySnapshot {
  snapshotId: string;
  utcHour: string;
  observationAt: string;
  publicationAt: string;
  calculationVersion: string;
  results: readonly HourlySnapshotResult[];
  sources: readonly HourlySnapshotSource[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function utcHourKey(input: Date | string = new Date()): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid UTC date");
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      date.getUTCHours(),
    ),
  ).toISOString();
}

export function validateHourlySnapshot(snapshot: HourlySnapshot): string[] {
  const problems: string[] = [];
  if (!snapshot.snapshotId.trim()) problems.push("snapshotId is required");
  if (utcHourKey(snapshot.observationAt) !== snapshot.utcHour) {
    problems.push("utcHour must match the observation hour");
  }
  for (const [label, value] of [
    ["utcHour", snapshot.utcHour],
    ["observationAt", snapshot.observationAt],
    ["publicationAt", snapshot.publicationAt],
  ] as const) {
    if (!ISO_DATE.test(value))
      problems.push(`${label} must be an ISO UTC timestamp`);
  }
  if (snapshot.results.length !== 20)
    problems.push("exactly twenty results are required");
  const ranks = snapshot.results
    .map((result) => result.rank)
    .sort((a, b) => a - b);
  if (ranks.some((rank, index) => rank !== index + 1)) {
    problems.push("ranks must be unique and contiguous");
  }
  const sourceIds = new Set(snapshot.sources.map((source) => source.sourceId));
  for (const result of snapshot.results) {
    if (!result.finalValueUsd)
      problems.push(`${result.entryId} has no final value`);
    if (result.sourceIds.length === 0)
      problems.push(`${result.entryId} has no sources`);
    if (result.sourceIds.some((sourceId) => !sourceIds.has(sourceId))) {
      problems.push(`${result.entryId} references an unknown source`);
    }
    if (!ISO_DATE.test(result.observationAt)) {
      problems.push(`${result.entryId} has an invalid observation timestamp`);
    }
  }
  for (const source of snapshot.sources) {
    if (!source.sourceUrl.startsWith("https://")) {
      problems.push(`${source.sourceId} must use an HTTPS source URL`);
    }
    if (!ISO_DATE.test(source.observedAt) || !ISO_DATE.test(source.fetchedAt)) {
      problems.push(`${source.sourceId} has invalid source timestamps`);
    }
  }
  return problems;
}

export function selectLatestPublished<T extends { publicationAt: string }>(
  snapshots: readonly T[],
): T | undefined {
  return [...snapshots].sort((left, right) =>
    right.publicationAt.localeCompare(left.publicationAt),
  )[0];
}

export function isAffirmativeZero(
  value: string | null,
  evidenceCount: number,
): boolean {
  return value === "0" && evidenceCount > 0;
}
