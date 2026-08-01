import type { ProjectCalculationInput } from "../types.js";

export type ProjectScoreGoldenFixture = {
  name: string;
  input: ProjectCalculationInput;
  expected: {
    status: "available" | "unavailable";
    excludedSupply: string | null;
    qualifyingCapitalUsd: string | null;
    outsideHolderSupply: string | null;
    scoreUsd: string | null;
    warningCodes: string[];
  };
};

export const PROJECT_SCORE_GOLDEN_FIXTURES: ProjectScoreGoldenFixture[] = [
  {
    name: "partial circulation produces a positive score",
    input: {
      projectId: "project-positive",
      assetId: "asset-positive",
      priceUsd: "20",
      circulatingSupply: "500000000",
      providerMarketCapUsd: "10000000000",
      walletReviewStatus: "approved_sufficient",
      fundingReviewStatus: "approved_sufficient",
      wallets: [
        {
          walletId: "wallet-partial",
          deduplicationKey: "project-positive:wallet-partial",
          normalizedBalance: "100000000",
          circulatingInclusionFraction: "0.8",
          balanceIncludedInCirculatingSupply: true,
          affectsScore: true,
          ownershipConfidence: "high",
          reviewStatus: "approved_sufficient",
          evidenceComplete: true,
        },
        {
          walletId: "wallet-visible-only",
          deduplicationKey: "project-positive:wallet-visible-only",
          normalizedBalance: "50000000",
          circulatingInclusionFraction: null,
          balanceIncludedInCirculatingSupply: null,
          affectsScore: false,
          ownershipConfidence: "medium",
          reviewStatus: "not_reviewed",
          evidenceComplete: false,
        },
      ],
      fundingRounds: [
        {
          fundingRoundId: "round-seed",
          deduplicationKey: "project-positive:seed",
          amountUsdAtEvent: "400000000",
          includeInCapitalDeduction: true,
          inclusionReason: "Reviewed and included.",
          reviewStatus: "approved_sufficient",
          evidenceComplete: true,
        },
      ],
    },
    expected: {
      status: "available",
      excludedSupply: "80000000",
      qualifyingCapitalUsd: "400000000.00000000",
      outsideHolderSupply: "420000000",
      scoreUsd: "8000000000.00000000",
      warningCodes: [],
    },
  },
  {
    name: "qualifying capital is clamped at zero",
    input: {
      projectId: "project-negative",
      assetId: "asset-negative",
      priceUsd: "2",
      circulatingSupply: "100000000",
      walletReviewStatus: "approved_sufficient",
      fundingReviewStatus: "approved_sufficient",
      wallets: [
        {
          walletId: "wallet-negative",
          deduplicationKey: "project-negative:wallet-negative",
          normalizedBalance: "40000000",
          circulatingInclusionFraction: "0.25",
          balanceIncludedInCirculatingSupply: true,
          affectsScore: true,
          ownershipConfidence: "high",
          reviewStatus: "approved_sufficient",
          evidenceComplete: true,
        },
      ],
      fundingRounds: [
        {
          fundingRoundId: "round-negative",
          deduplicationKey: "project-negative:round-negative",
          amountUsdAtEvent: "350000000",
          includeInCapitalDeduction: true,
          inclusionReason: "Reviewed and included.",
          reviewStatus: "approved_sufficient",
          evidenceComplete: true,
        },
      ],
    },
    expected: {
      status: "available",
      excludedSupply: "10000000",
      qualifyingCapitalUsd: "350000000.00000000",
      outsideHolderSupply: "90000000",
      scoreUsd: "0.00000000",
      warningCodes: [],
    },
  },
  {
    name: "unknown circulation remains unavailable rather than becoming zero",
    input: {
      projectId: "project-unknown-circulation",
      assetId: "asset-unknown-circulation",
      priceUsd: "1",
      circulatingSupply: "1000",
      walletReviewStatus: "approved_sufficient",
      fundingReviewStatus: "approved_sufficient",
      wallets: [
        {
          walletId: "wallet-unknown-circulation",
          deduplicationKey:
            "project-unknown-circulation:wallet-unknown-circulation",
          normalizedBalance: "100",
          circulatingInclusionFraction: null,
          balanceIncludedInCirculatingSupply: null,
          affectsScore: true,
          ownershipConfidence: "low",
          reviewStatus: "approved_sufficient",
          evidenceComplete: true,
        },
      ],
      fundingRounds: [],
    },
    expected: {
      status: "unavailable",
      excludedSupply: null,
      qualifyingCapitalUsd: "0.00000000",
      outsideHolderSupply: null,
      scoreUsd: null,
      warningCodes: [
        "WALLET_ATTRIBUTION_LOW_CONFIDENCE",
        "WALLET_ATTRIBUTION_INELIGIBLE",
      ],
    },
  },
  {
    name: "unknown included funding remains unavailable while preserving known capital",
    input: {
      projectId: "project-unknown-funding",
      assetId: "asset-unknown-funding",
      priceUsd: "5",
      circulatingSupply: "1000",
      walletReviewStatus: "approved_sufficient",
      fundingReviewStatus: "in_progress",
      wallets: [],
      fundingRounds: [
        {
          fundingRoundId: "round-known",
          deduplicationKey: "project-unknown-funding:round-known",
          amountUsdAtEvent: "100",
          includeInCapitalDeduction: true,
          inclusionReason: "Reviewed and included.",
          reviewStatus: "approved_sufficient",
          evidenceComplete: true,
        },
        {
          fundingRoundId: "round-unknown",
          deduplicationKey: "project-unknown-funding:round-unknown",
          amountUsdAtEvent: null,
          includeInCapitalDeduction: true,
          inclusionReason: "Reviewed and included.",
          reviewStatus: "in_progress",
          evidenceComplete: false,
        },
      ],
    },
    expected: {
      status: "unavailable",
      excludedSupply: "0",
      qualifyingCapitalUsd: null,
      outsideHolderSupply: null,
      scoreUsd: null,
      warningCodes: ["FUNDING_REVIEW_INCOMPLETE", "FUNDING_DATA_INCOMPLETE"],
    },
  },
];
