import { describe, expect, it } from "vitest";

import { PROJECT_SCORE_GOLDEN_FIXTURES } from "./fixtures/golden.js";
import {
  CalculationInputError,
  calculateConfidence,
  calculateDataFreshness,
  calculateDeductibleWalletBalance,
  calculateExcludedSupply,
  calculateFoundingUnitScore,
  calculateProjectScore,
  calculateQualifyingCapital,
  calculateRankings,
  compareMarketProviders,
  generateCalculationWarnings,
} from "./index.js";
import type { DataFreshnessInput } from "./types.js";

describe("golden project score fixtures", () => {
  for (const fixture of PROJECT_SCORE_GOLDEN_FIXTURES) {
    it(fixture.name, () => {
      const result = calculateProjectScore(fixture.input);

      expect({
        status: result.status,
        excludedSupply: result.excludedSupply,
        qualifyingCapitalUsd: result.qualifyingCapitalUsd,
        outsideHolderSupply: result.outsideHolderSupply,
        scoreUsd: result.scoreUsd,
        warningCodes: result.warnings.map((item) => item.code),
      }).toEqual(fixture.expected);
    });
  }
});

describe("wallet and supply deductions", () => {
  it("does not deduct a visible-only wallet", () => {
    expect(
      calculateDeductibleWalletBalance({
        walletId: "wallet-visible",
        normalizedBalance: "999",
        circulatingInclusionFraction: null,
        affectsScore: false,
        ownershipConfidence: "disputed",
      }),
    ).toMatchObject({
      deductibleBalance: "0",
      complete: true,
      warnings: [{ code: "WALLET_ATTRIBUTION_DISPUTED" }],
    });
  });

  it("sums only known deductions and exposes incompleteness", () => {
    const result = calculateExcludedSupply([
      {
        walletId: "known",
        normalizedBalance: "10.5",
        circulatingInclusionFraction: "0.5",
        affectsScore: true,
        ownershipConfidence: "high",
      },
      {
        walletId: "unknown",
        normalizedBalance: "7",
        circulatingInclusionFraction: null,
        affectsScore: true,
        ownershipConfidence: "high",
      },
    ]);

    expect(result).toMatchObject({
      excludedSupply: null,
      knownExcludedSupply: "5.25",
      complete: false,
    });
  });

  it("rejects fractions outside zero to one", () => {
    expect(() =>
      calculateDeductibleWalletBalance({
        walletId: "bad-fraction",
        normalizedBalance: "1",
        circulatingInclusionFraction: "1.1",
        affectsScore: true,
        ownershipConfidence: "high",
      }),
    ).toThrow(CalculationInputError);
  });
});

describe("qualifying capital", () => {
  it("ignores explicitly excluded rounds", () => {
    expect(
      calculateQualifyingCapital([
        {
          fundingRoundId: "included",
          amountUsdAtEvent: "12.3456789",
          includeInCapitalDeduction: true,
        },
        {
          fundingRoundId: "excluded",
          amountUsdAtEvent: null,
          includeInCapitalDeduction: false,
        },
      ]),
    ).toMatchObject({
      qualifyingCapitalUsd: "12.34567890",
      knownQualifyingCapitalUsd: "12.34567890",
      complete: true,
      warnings: [],
    });
  });
});

describe("market reconciliation", () => {
  it("warns beyond the default five-percent tolerance", () => {
    const result = compareMarketProviders({
      derivedMarketCapUsd: "100",
      providerMarketCapUsd: "106",
    });

    expect(result.withinTolerance).toBe(false);
    expect(result.varianceFraction).toBe("0.06");
    expect(result.warnings[0]?.code).toBe("MARKET_CAP_RECONCILIATION_WARNING");
  });

  it("handles zero derived market cap without division by zero", () => {
    expect(
      compareMarketProviders({
        derivedMarketCapUsd: "0",
        providerMarketCapUsd: "1",
      }),
    ).toMatchObject({ varianceFraction: null, withinTolerance: false });
  });
});

describe("project score safeguards", () => {
  it("blocks excluded supply greater than circulating supply", () => {
    const result = calculateProjectScore({
      projectId: "project-over",
      assetId: "asset-over",
      priceUsd: "2",
      circulatingSupply: "10",
      wallets: [
        {
          walletId: "wallet-over",
          normalizedBalance: "11",
          circulatingInclusionFraction: "1",
          affectsScore: true,
          ownershipConfidence: "high",
        },
      ],
      fundingRounds: [],
    });

    expect(result.scoreUsd).toBeNull();
    expect(result.warnings.map((item) => item.code)).toContain(
      "EXCLUDED_SUPPLY_EXCEEDS_CIRCULATING",
    );
  });

  it("rejects zero and negative prices", () => {
    const base = PROJECT_SCORE_GOLDEN_FIXTURES[0]?.input;
    expect(base).toBeDefined();
    if (base === undefined) return;

    expect(() => calculateProjectScore({ ...base, priceUsd: "0" })).toThrow(
      CalculationInputError,
    );
    expect(() => calculateProjectScore({ ...base, priceUsd: "-1" })).toThrow(
      CalculationInputError,
    );
  });
});

describe("founding-unit aggregation", () => {
  it("supports multiple projects and attribution fractions", () => {
    expect(
      calculateFoundingUnitScore({
        foundingUnitId: "unit-a",
        projects: [
          { projectId: "project-a", scoreUsd: "100" },
          {
            projectId: "project-b",
            scoreUsd: "50",
            attributionFraction: "0.4",
          },
        ],
      }),
    ).toEqual({
      foundingUnitId: "unit-a",
      status: "available",
      scoreUsd: "120.00000000",
      unavailableProjectIds: [],
    });
  });

  it("is unavailable if any required project score is unavailable", () => {
    expect(
      calculateFoundingUnitScore({
        foundingUnitId: "unit-b",
        projects: [
          { projectId: "project-a", scoreUsd: "100" },
          { projectId: "project-b", scoreUsd: null },
        ],
      }),
    ).toMatchObject({
      status: "unavailable",
      scoreUsd: null,
      unavailableProjectIds: ["project-b"],
    });
  });
});

describe("confidence", () => {
  const componentsFor = (founderIdentityEvidence: string) => ({
    founderIdentityEvidence,
    founderWalletCoverage: "20",
    teamFoundationTreasuryCoverage: "20",
    circulationTreatment: "20",
    fundingCompleteness: "20",
    marketReliability: "0",
  });

  it.each([
    ["5", "high", "85.00"],
    ["4.99", "medium", "84.99"],
    ["0", "medium", "80.00"],
  ] as const)("labels score %s correctly", (identity, label, score) => {
    expect(calculateConfidence(componentsFor(identity))).toMatchObject({
      label,
      score,
    });
  });

  it("covers low and insufficient thresholds", () => {
    expect(
      calculateConfidence({
        founderIdentityEvidence: "10",
        founderWalletCoverage: "10",
        teamFoundationTreasuryCoverage: "10",
        circulationTreatment: "10",
        fundingCompleteness: "0",
        marketReliability: "0",
      }).label,
    ).toBe("low");
    expect(
      calculateConfidence({
        founderIdentityEvidence: "9.99",
        founderWalletCoverage: "10",
        teamFoundationTreasuryCoverage: "10",
        circulationTreatment: "10",
        fundingCompleteness: "0",
        marketReliability: "0",
      }).label,
    ).toBe("insufficient");
  });
});

describe("rankings", () => {
  it("ranks descending, preserves ties, supports negative scores, and leaves insufficient unranked", () => {
    const results = calculateRankings([
      {
        foundingUnitId: "unit-b",
        scoreUsd: "10",
        confidenceLabel: "medium",
        previousRank: 1,
      },
      {
        foundingUnitId: "unit-a",
        scoreUsd: "10",
        confidenceLabel: "high",
        previousRank: 3,
      },
      {
        foundingUnitId: "unit-negative",
        scoreUsd: "-1",
        confidenceLabel: "low",
      },
      {
        foundingUnitId: "unit-insufficient",
        scoreUsd: "100",
        confidenceLabel: "insufficient",
      },
      {
        foundingUnitId: "unit-unavailable",
        scoreUsd: null,
        confidenceLabel: "high",
      },
    ]);

    expect(results).toEqual([
      {
        foundingUnitId: "unit-b",
        scoreUsd: "10",
        confidenceLabel: "medium",
        previousRank: 1,
        rank: 1,
        status: "ranked",
        movement: 0,
      },
      {
        foundingUnitId: "unit-a",
        scoreUsd: "10",
        confidenceLabel: "high",
        previousRank: 3,
        rank: 1,
        status: "ranked",
        movement: 2,
      },
      {
        foundingUnitId: "unit-negative",
        scoreUsd: "-1",
        confidenceLabel: "low",
        rank: 3,
        status: "ranked",
        movement: null,
      },
      {
        foundingUnitId: "unit-insufficient",
        scoreUsd: "100",
        confidenceLabel: "insufficient",
        rank: null,
        status: "research",
        movement: null,
      },
      {
        foundingUnitId: "unit-unavailable",
        scoreUsd: null,
        confidenceLabel: "high",
        rank: null,
        status: "research",
        movement: null,
      },
    ]);
  });
});

describe("data freshness and contextual warnings", () => {
  const freshnessInput: DataFreshnessInput = {
    asOf: "2026-07-27T12:00:00.000Z",
    data: {
      price: { observedAt: "2026-07-27T11:59:30.000Z", staleAfterSeconds: 60 },
      marketCap: { observedAt: null, staleAfterSeconds: 60 },
      circulatingSupply: {
        observedAt: "2026-07-27T11:58:00.000Z",
        staleAfterSeconds: 60,
      },
      wallet: {
        observedAt: "2026-07-26T12:00:00.000Z",
        staleAfterSeconds: 3600,
      },
      ownershipReview: {
        observedAt: "2026-07-01T12:00:00.000Z",
        staleAfterSeconds: 86400,
      },
      fundingReview: {
        observedAt: "2026-07-27T12:00:01.000Z",
        staleAfterSeconds: 86400,
      },
      canonicalRanking: {
        observedAt: "2026-07-27T11:00:00.000Z",
        staleAfterSeconds: 86400,
      },
    },
  };

  it("tracks every freshness dimension separately", () => {
    const result = calculateDataFreshness(freshnessInput);

    expect(result.data.price).toMatchObject({
      status: "fresh",
      ageSeconds: 30,
    });
    expect(result.data.marketCap).toMatchObject({
      status: "missing",
      ageSeconds: null,
    });
    expect(result.data.circulatingSupply).toMatchObject({
      status: "stale",
      ageSeconds: 120,
    });
    expect(result.data.fundingReview).toMatchObject({
      status: "future",
      ageSeconds: -1,
    });
    expect(result.warnings.map((item) => item.code)).toEqual([
      "MARKET_DATA_MISSING",
      "MARKET_DATA_STALE",
      "WALLET_DATA_STALE",
      "RESEARCH_REVIEW_OVERDUE",
    ]);
  });

  it("emits operational warnings independently from financial calculations", () => {
    expect(
      generateCalculationWarnings({
        livePriceVariance: true,
        providerFallbackActive: true,
      }).map((item) => item.code),
    ).toEqual(["LIVE_PRICE_VARIANCE", "PROVIDER_FALLBACK_ACTIVE"]);
  });
});
