import { describe, expect, it } from "vitest";

import {
  isAffirmativeZero,
  selectLatestPublished,
  utcHourKey,
  validateHourlySnapshot,
  type HourlySnapshot,
} from "./hourly-snapshot.js";

function snapshot(overrides: Partial<HourlySnapshot> = {}): HourlySnapshot {
  const results = Array.from({ length: 20 }, (_, index) => ({
    entryId: index === 0 ? "coinbase" : `entry-${index + 1}`,
    rank: index + 1,
    valueType:
      index < 10 ? ("Token/network" as const) : ("Public company" as const),
    grossValueUsd: "100",
    finalValueUsd: "90",
    founderAffiliateDeductionUsd: null,
    outsideCapitalDeductionUsd: null,
    confidenceScore: 0.8,
    confidenceLabel: "Medium",
    sourceIds: [`source-${index + 1}`],
    observationAt: "2026-08-01T12:00:00.000Z",
    status: "current" as const,
  }));
  return {
    snapshotId: "snapshot-1",
    utcHour: "2026-08-01T12:00:00.000Z",
    observationAt: "2026-08-01T12:00:00.000Z",
    publicationAt: "2026-08-01T12:01:00.000Z",
    calculationVersion: "unified-v1",
    results,
    sources: results.map((result) => ({
      sourceId: result.sourceIds[0]!,
      sourceUrl: "https://example.com/market",
      observedAt: result.observationAt,
      fetchedAt: "2026-08-01T12:00:30.000Z",
    })),
    ...overrides,
  };
}

describe("hourly snapshot contract", () => {
  it("uses one idempotent key for every run in a UTC hour", () => {
    expect(utcHourKey("2026-08-01T12:00:01.000Z")).toBe(
      "2026-08-01T12:00:00.000Z",
    );
    expect(utcHourKey("2026-08-01T12:59:59.999Z")).toBe(
      "2026-08-01T12:00:00.000Z",
    );
  });

  it("rejects partial results, duplicate ranks, and missing sources", () => {
    expect(
      validateHourlySnapshot(
        snapshot({ results: snapshot().results.slice(0, 19) }),
      ),
    ).toContain("exactly twenty results are required");
    expect(
      validateHourlySnapshot(
        snapshot({
          results: snapshot().results.map((result, index) =>
            index === 1 ? { ...result, rank: 1 } : result,
          ),
        }),
      ),
    ).toContain("ranks must be unique and contiguous");
    expect(
      validateHourlySnapshot(
        snapshot({
          results: snapshot().results.map((result, index) =>
            index === 0 ? { ...result, sourceIds: ["missing"] } : result,
          ),
        }),
      ),
    ).toContain("coinbase references an unknown source");
  });

  it("keeps unknown deductions distinct from affirmative zero", () => {
    expect(snapshot().results[0]?.outsideCapitalDeductionUsd).toBeNull();
    expect(isAffirmativeZero("0", 1)).toBe(true);
    expect(isAffirmativeZero("0", 0)).toBe(false);
  });

  it("selects the latest valid publication without mutating history", () => {
    const baseline = { publicationAt: "2026-07-30T12:00:00.000Z" };
    const current = { publicationAt: "2026-08-01T12:01:00.000Z" };
    expect(selectLatestPublished([baseline, current])).toBe(current);
    expect(baseline.publicationAt).toBe("2026-07-30T12:00:00.000Z");
  });
});
