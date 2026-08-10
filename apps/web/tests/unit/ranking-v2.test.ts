import { describe, expect, it } from "vitest";

import {
  formatV2Rank,
  formatV2Value,
  isNewerPublishedSnapshot,
  validateCurrentRankingV2,
} from "../../lib/ranking-v2";

const row = {
  snapshot_id: "snapshot-1",
  economic_as_of: "2026-08-09T00:00:00.000Z",
  knowledge_cutoff: "2026-08-09T01:00:00.000Z",
  published_at: "2026-08-09T02:00:00.000Z",
  economic_project_id: "project-1",
  project_slug: "alpha",
  project_name: "Alpha",
  founder_team: "Ada Founder (founder)",
  value_created_lower: "70000000.00000000",
  value_created_upper: "90000000.00000000",
  eligibility_status: "provisional",
  rank_min: 1,
  rank_max: 2,
  rank_order_status: "overlapping",
  confidence_status: "medium",
  is_invalidated: false,
  invalidation_message: null,
  methodology_version_id: "v2",
  confidence_policy_version: "v1",
};
const second = {
  ...row,
  economic_project_id: "project-2",
  project_slug: "beta",
  project_name: "Beta",
  rank_min: 2,
  rank_max: 2,
  rank_order_status: "exact",
};

describe("ranking v2 public snapshot", () => {
  it("prefers only a strictly newer published snapshot", () => {
    expect(
      isNewerPublishedSnapshot(
        "published",
        "2026-08-09T02:00:00.000Z",
        "2026-08-09T01:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      isNewerPublishedSnapshot(
        "published",
        "2026-08-09T01:00:00.000Z",
        "2026-08-09T01:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      isNewerPublishedSnapshot(
        "failed",
        "2026-08-09T02:00:00.000Z",
        "2026-08-09T01:00:00.000Z",
      ),
    ).toBe(false);
    expect(
      isNewerPublishedSnapshot("published", null, "2026-08-09T01:00:00.000Z"),
    ).toBe(false);
  });

  it("accepts one coherent immutable snapshot without re-sorting it", () => {
    expect(validateCurrentRankingV2([row, second])?.rows).toEqual([
      row,
      second,
    ]);
  });

  it("rejects invalidated, mixed, duplicate, and out-of-order snapshots", () => {
    expect(
      validateCurrentRankingV2([{ ...row, is_invalidated: true }]),
    ).toBeNull();
    expect(
      validateCurrentRankingV2([
        row,
        { ...row, economic_as_of: "2026-08-08T00:00:00Z" },
      ]),
    ).toBeNull();
    expect(validateCurrentRankingV2([row, row])).toBeNull();
    expect(
      validateCurrentRankingV2([
        row,
        {
          ...row,
          economic_project_id: "project-2",
          project_slug: "beta",
          rank_min: 3,
        },
        {
          ...row,
          economic_project_id: "project-3",
          project_slug: "gamma",
          rank_min: 2,
        },
      ]),
    ).toBeNull();
  });

  it("enforces eligibility and rank coherence", () => {
    expect(
      validateCurrentRankingV2([{ ...row, eligibility_status: "ineligible" }]),
    ).toBeNull();
    expect(
      validateCurrentRankingV2([
        {
          ...row,
          eligibility_status: "ineligible",
          rank_min: null,
          rank_max: null,
          rank_order_status: "not_eligible",
        },
      ]),
    ).not.toBeNull();
  });

  it("rejects malformed numeric bounds without throwing", () => {
    expect(
      validateCurrentRankingV2([
        { ...row, value_created_lower: "not-a-number" },
      ]),
    ).toBeNull();
  });

  it("formats bounded rank and score intervals", () => {
    const parsed = validateCurrentRankingV2([row, second]);
    expect(parsed).not.toBeNull();
    expect(formatV2Rank(parsed!.rows[0]!)).toBe("1–2");
    expect(formatV2Value(parsed!.rows[0]!)).toBe("$70M–$90M");
  });
});
