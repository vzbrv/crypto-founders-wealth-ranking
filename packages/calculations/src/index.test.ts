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
import type {
  DataFreshnessInput,
  FundingRoundInput,
  ProjectWalletInput,
  RankingInput,
} from "./types.js";

const wallet = (
  input: Partial<ProjectWalletInput> & Pick<ProjectWalletInput, "walletId">,
): ProjectWalletInput => ({
  deduplicationKey: input.walletId,
  normalizedBalance: "1",
  circulatingInclusionFraction: "1",
  balanceIncludedInCirculatingSupply: true,
  affectsScore: true,
  classification: "founder",
  ownershipConfidence: "high",
  reviewStatus: "approved_sufficient",
  evidenceComplete: true,
  ...input,
});

const funding = (
  input: Partial<FundingRoundInput> & Pick<FundingRoundInput, "fundingRoundId">,
): FundingRoundInput => ({
  deduplicationKey: input.fundingRoundId,
  amountUsdAtEvent: "1",
  includeInCapitalDeduction: true,
  inclusionReason: "Reviewed and included.",
  reviewStatus: "approved_sufficient",
  evidenceComplete: true,
  ...input,
});

const ranking = (
  input: Partial<RankingInput> & Pick<RankingInput, "foundingUnitId">,
): RankingInput => ({
  scoreUsd: "1",
  calculatedConfidenceLabel: "medium",
  marketDataStatus: "recent_sourced",
  fundingReviewStatus: "approved_sufficient",
  walletReviewStatus: "approved_sufficient",
  evidenceComplete: true,
  ...input,
});

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
      calculateDeductibleWalletBalance(
        wallet({
          walletId: "wallet-visible",
          normalizedBalance: "999",
          circulatingInclusionFraction: null,
          balanceIncludedInCirculatingSupply: null,
          affectsScore: false,
          ownershipConfidence: "disputed",
          reviewStatus: "not_reviewed",
          evidenceComplete: false,
        }),
      ),
    ).toMatchObject({
      deductibleBalance: "0",
      complete: true,
      warnings: [{ code: "WALLET_ATTRIBUTION_DISPUTED" }],
    });
  });

  it("sums only known deductions and exposes incompleteness", () => {
    const result = calculateExcludedSupply(
      [
        wallet({
          walletId: "known",
          normalizedBalance: "10.5",
          circulatingInclusionFraction: "0.5",
        }),
        wallet({
          walletId: "unknown",
          normalizedBalance: "7",
          circulatingInclusionFraction: null,
          balanceIncludedInCirculatingSupply: null,
        }),
      ],
      "approved_sufficient",
    );

    expect(result).toMatchObject({
      excludedSupply: null,
      knownExcludedSupply: "5.25",
      complete: false,
    });
  });

  it("rejects fractions outside zero to one", () => {
    expect(() =>
      calculateDeductibleWalletBalance(
        wallet({
          walletId: "bad-fraction",
          circulatingInclusionFraction: "1.1",
        }),
      ),
    ).toThrow(CalculationInputError);
  });

  it("never deducts a low-confidence score-affecting wallet", () => {
    expect(
      calculateDeductibleWalletBalance(
        wallet({ walletId: "low-confidence", ownershipConfidence: "low" }),
      ),
    ).toMatchObject({
      deductibleBalance: null,
      complete: false,
      warnings: [
        { code: "WALLET_ATTRIBUTION_LOW_CONFIDENCE" },
        { code: "WALLET_ATTRIBUTION_INELIGIBLE" },
      ],
    });
  });

  it("never deducts a non-founder score-affecting wallet", () => {
    expect(
      calculateDeductibleWalletBalance(
        wallet({ walletId: "team-wallet", classification: "team" }),
      ),
    ).toMatchObject({
      deductibleBalance: null,
      complete: false,
      warnings: [{ code: "WALLET_ATTRIBUTION_INELIGIBLE" }],
    });
  });

  it("does not double-deduct balances excluded from circulating supply", () => {
    expect(
      calculateDeductibleWalletBalance(
        wallet({
          walletId: "locked-wallet",
          normalizedBalance: "42",
          balanceIncludedInCirculatingSupply: false,
        }),
      ),
    ).toMatchObject({ deductibleBalance: "0", complete: true });
  });
});

describe("qualifying capital", () => {
  it("accepts explicitly reviewed zero deductions", () => {
    const wallets = calculateExcludedSupply(
      [wallet({ walletId: "reviewed-zero-wallet", normalizedBalance: "0" })],
      "approved_sufficient",
    );
    const capital = calculateQualifyingCapital(
      [
        funding({
          fundingRoundId: "reviewed-zero-funding",
          amountUsdAtEvent: "0",
        }),
      ],
      "approved_sufficient",
    );

    expect(wallets).toMatchObject({
      excludedSupply: "0",
      knownExcludedSupply: "0",
      complete: true,
    });
    expect(capital).toMatchObject({
      qualifyingCapitalUsd: "0.00000000",
      knownQualifyingCapitalUsd: "0.00000000",
      complete: true,
    });
  });

  it("keeps unresolved excluded financing incomplete", () => {
    expect(
      calculateQualifyingCapital(
        [
          funding({
            fundingRoundId: "included",
            amountUsdAtEvent: "12.3456789",
          }),
          funding({
            fundingRoundId: "excluded",
            amountUsdAtEvent: null,
            includeInCapitalDeduction: false,
            reviewStatus: "not_reviewed",
            evidenceComplete: false,
            inclusionReason: "Excluded pending review.",
          }),
        ],
        "approved_sufficient",
      ),
    ).toMatchObject({
      qualifyingCapitalUsd: null,
      knownQualifyingCapitalUsd: "12.34567890",
      complete: false,
      warnings: [{ code: "FUNDING_REVIEW_INCOMPLETE" }],
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
      walletReviewStatus: "approved_sufficient",
      fundingReviewStatus: "approved_sufficient",
      wallets: [
        wallet({
          walletId: "wallet-over",
          normalizedBalance: "11",
        }),
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
  it.each([
    ["39", "insufficient", "9", "0", "0"],
    ["40", "low", "10", "0", "0"],
    ["64", "low", "20", "14", "0"],
    ["65", "medium", "20", "15", "0"],
    ["84", "medium", "20", "14", "20"],
    ["85", "high", "20", "15", "20"],
  ] as const)(
    "labels score %s correctly",
    (score, label, teamScore, circulationScore, fundingScore) => {
      expect(
        calculateConfidence({
          founderIdentityEvidence: "10",
          founderWalletCoverage: "20",
          teamFoundationTreasuryCoverage: teamScore,
          circulationTreatment: circulationScore,
          fundingCompleteness: fundingScore,
          marketReliability: "0",
        }),
      ).toMatchObject({ label, score: `${score}.00`, complete: true });
    },
  );

  it("does not assume missing evidence points or award a high label", () => {
    expect(
      calculateConfidence({
        founderIdentityEvidence: "10",
        founderWalletCoverage: null,
        teamFoundationTreasuryCoverage: "20",
        circulationTreatment: "20",
        fundingCompleteness: "20",
        marketReliability: "10",
      }),
    ).toMatchObject({
      score: "80.00",
      label: "insufficient",
      complete: false,
      missingComponents: ["founderWalletCoverage"],
    });
  });
});

describe("rankings", () => {
  it("assigns contiguous ranks with deterministic tie-breaking", () => {
    const results = calculateRankings([
      ranking({
        foundingUnitId: "unit-b",
        scoreUsd: "10",
        previousRank: 1,
      }),
      ranking({
        foundingUnitId: "unit-a",
        scoreUsd: "10",
        calculatedConfidenceLabel: "high",
        previousRank: 3,
      }),
      ranking({ foundingUnitId: "unit-zero", scoreUsd: "0" }),
      ranking({
        foundingUnitId: "unit-insufficient",
        scoreUsd: "100",
        calculatedConfidenceLabel: "insufficient",
      }),
      ranking({
        foundingUnitId: "unit-unavailable",
        scoreUsd: null,
      }),
    ]);

    expect(
      results.map(({ foundingUnitId, rank }) => [foundingUnitId, rank]),
    ).toEqual([
      ["unit-b", 2],
      ["unit-a", 1],
      ["unit-zero", 3],
      ["unit-insufficient", null],
      ["unit-unavailable", null],
    ]);
    expect(results[3]).toMatchObject({
      status: "research",
      eligibilityStatus: "ineligible",
      ineligibilityReasons: ["confidence is insufficient"],
    });
    expect(results[4]).toMatchObject({
      status: "research",
      ineligibilityReasons: ["calculation unavailable"],
    });
  });

  it("does not rank a numeric score without all eligibility gates", () => {
    const [result] = calculateRankings([
      ranking({
        foundingUnitId: "unit-gated",
        scoreUsd: "1000000",
        marketDataStatus: "stale",
        fundingReviewStatus: "in_progress",
        walletReviewStatus: "reviewed_insufficient",
        evidenceComplete: false,
      }),
    ]);

    expect(result).toMatchObject({
      rank: null,
      status: "research",
      ineligibilityReasons: [
        "recent sourced market data unavailable",
        "funding review is not approved and sufficient",
        "wallet review is not approved and sufficient",
        "deduction or exclusion evidence is incomplete",
      ],
    });
  });

  it("does not use manual confidence to bypass calculated eligibility", () => {
    const [result] = calculateRankings([
      ranking({
        foundingUnitId: "unit-manual-high",
        scoreUsd: "100",
        calculatedConfidenceLabel: "insufficient",
        manualConfidenceLabel: "high",
      }),
    ]);

    expect(result).toMatchObject({
      rank: null,
      status: "research",
      eligibilityStatus: "ineligible",
      ineligibilityReasons: ["confidence is insufficient"],
    });
  });
});

describe("deduplication safeguards", () => {
  it("blocks duplicate wallet deductions", () => {
    const result = calculateExcludedSupply(
      [
        wallet({ walletId: "wallet-a", deduplicationKey: "same-address" }),
        wallet({ walletId: "wallet-b", deduplicationKey: "same-address" }),
      ],
      "approved_sufficient",
    );

    expect(result.excludedSupply).toBeNull();
    expect(result.knownExcludedSupply).toBe("1");
    expect(result.warnings.map(({ code }) => code)).toContain(
      "DUPLICATE_WALLET_DEDUCTION",
    );
  });

  it("blocks duplicate funding deductions", () => {
    const result = calculateQualifyingCapital(
      [
        funding({ fundingRoundId: "round-a", deduplicationKey: "same-round" }),
        funding({ fundingRoundId: "round-b", deduplicationKey: "same-round" }),
      ],
      "approved_sufficient",
    );

    expect(result.qualifyingCapitalUsd).toBeNull();
    expect(result.knownQualifyingCapitalUsd).toBe("1.00000000");
    expect(result.warnings.map(({ code }) => code)).toContain(
      "DUPLICATE_FUNDING_DEDUCTION",
    );
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
