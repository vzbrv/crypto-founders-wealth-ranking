import { describe, expect, it } from "vitest";

import {
  buildRankingEntries,
  filterEntries,
  freshnessLabel,
  type RawLeaderboardRow,
  type RawProjectDetail,
} from "../../lib/ranking";

const calculatedAt = "2026-07-28T12:00:00.000Z";

const rows: RawLeaderboardRow[] = [
  {
    rank: 1,
    previous_rank: 2,
    rank_change: 1,
    score_usd: "800000000",
    confidence_label: "high",
    calculated_at: calculatedAt,
    founding_unit_id: "unit-alpha",
    slug: "alice",
    display_name: "Alice Founder",
    description: null,
    image_url: null,
    iq_wiki_slug: null,
    project_breakdown: [
      { projectId: "project-alpha", attributionFraction: 0.5 },
    ],
    warnings: [],
  },
  {
    rank: null,
    previous_rank: null,
    rank_change: null,
    score_usd: null,
    confidence_label: "insufficient",
    calculated_at: calculatedAt,
    founding_unit_id: "unit-beta",
    slug: "beta-team",
    display_name: "Beta Team",
    description: null,
    image_url: null,
    iq_wiki_slug: null,
    project_breakdown: [{ projectId: "project-beta", attributionFraction: 1 }],
    warnings: ["Circulating supply requires review."],
  },
];

const projects: RawProjectDetail[] = [
  {
    id: "project-alpha",
    slug: "alpha",
    name: "Alpha Protocol",
    symbol: "ALPHA",
    market_cap_usd: "2000000000",
    outside_holder_value_usd: "1600000000",
    capital_raised_usd: "100000000",
    score_usd: "1500000000",
    price_usd: "2",
    circulating_supply: "1000000000",
    excluded_supply: "200000000",
    outside_holder_supply: "800000000",
    data_freshness: { marketObservedAt: "2026-07-28T11:58:00.000Z" },
    calculated_at: calculatedAt,
  },
  {
    id: "project-beta",
    slug: "beta",
    name: "Beta Network",
    symbol: "BETA",
    market_cap_usd: null,
    outside_holder_value_usd: null,
    capital_raised_usd: null,
    data_freshness: {},
    calculated_at: calculatedAt,
  },
];

describe("ranking data", () => {
  it("keeps insufficient-confidence entries unranked and calculates deductions", () => {
    const entries = buildRankingEntries(rows, projects);

    expect(entries[0]).toMatchObject({
      status: "ranked",
      excludedHoldingsUsd: 200_000_000,
      capitalDeductedUsd: 50_000_000,
      freshestObservationAt: "2026-07-28T11:58:00.000Z",
      projects: [
        expect.objectContaining({
          attributionFraction: 0.5,
          canonicalPriceUsd: 2,
          outsideHolderSupply: 800_000_000,
        }),
      ],
    });
    expect(entries[1]).toMatchObject({
      rank: null,
      scoreUsd: null,
      status: "research",
      excludedHoldingsUsd: null,
      capitalDeductedUsd: null,
    });
  });

  it("filters by founder, project, and confidence", () => {
    const entries = buildRankingEntries(rows, projects);

    expect(filterEntries(entries, "alpha", "all", "all")).toHaveLength(1);
    expect(
      filterEntries(entries, "", "insufficient", "all")[0]?.displayName,
    ).toBe("Beta Team");
    expect(
      filterEntries(entries, "", "all", "project-alpha")[0]?.displayName,
    ).toBe("Alice Founder");
  });

  it("labels market-data freshness consistently", () => {
    const now = Date.parse("2026-07-28T12:00:00.000Z");
    expect(freshnessLabel("2026-07-28T11:58:00.000Z", now)).toBe("Live");
    expect(freshnessLabel("2026-07-28T11:40:00.000Z", now)).toBe("Recent");
    expect(freshnessLabel("2026-07-28T10:00:00.000Z", now)).toBe("Stale");
  });
});
