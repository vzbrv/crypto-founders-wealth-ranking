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
      wallets: [
        {
          walletId: "wallet-partial",
          normalizedBalance: "100000000",
          circulatingInclusionFraction: "0.8",
          affectsScore: true,
          ownershipConfidence: "high",
        },
        {
          walletId: "wallet-visible-only",
          normalizedBalance: "50000000",
          circulatingInclusionFraction: null,
          affectsScore: false,
          ownershipConfidence: "medium",
        },
      ],
      fundingRounds: [
        {
          fundingRoundId: "round-seed",
          amountUsdAtEvent: "400000000",
          includeInCapitalDeduction: true,
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
    name: "qualifying capital can produce a negative score",
    input: {
      projectId: "project-negative",
      assetId: "asset-negative",
      priceUsd: "2",
      circulatingSupply: "100000000",
      wallets: [
        {
          walletId: "wallet-negative",
          normalizedBalance: "40000000",
          circulatingInclusionFraction: "0.25",
          affectsScore: true,
          ownershipConfidence: "high",
        },
      ],
      fundingRounds: [
        {
          fundingRoundId: "round-negative",
          amountUsdAtEvent: "350000000",
          includeInCapitalDeduction: true,
        },
      ],
    },
    expected: {
      status: "available",
      excludedSupply: "10000000",
      qualifyingCapitalUsd: "350000000.00000000",
      outsideHolderSupply: "90000000",
      scoreUsd: "-170000000.00000000",
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
      wallets: [
        {
          walletId: "wallet-unknown-circulation",
          normalizedBalance: "100",
          circulatingInclusionFraction: null,
          affectsScore: true,
          ownershipConfidence: "low",
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
        "UNKNOWN_CIRCULATION_TREATMENT",
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
      wallets: [],
      fundingRounds: [
        {
          fundingRoundId: "round-known",
          amountUsdAtEvent: "100",
          includeInCapitalDeduction: true,
        },
        {
          fundingRoundId: "round-unknown",
          amountUsdAtEvent: null,
          includeInCapitalDeduction: true,
        },
      ],
    },
    expected: {
      status: "unavailable",
      excludedSupply: "0",
      qualifyingCapitalUsd: null,
      outsideHolderSupply: null,
      scoreUsd: null,
      warningCodes: ["FUNDING_DATA_INCOMPLETE"],
    },
  },
];
