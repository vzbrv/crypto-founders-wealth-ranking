export const CALCULATION_WARNING_CODES = [
  "MARKET_DATA_MISSING",
  "MARKET_DATA_STALE",
  "WALLET_DATA_STALE",
  "FUNDING_DATA_INCOMPLETE",
  "WALLET_ATTRIBUTION_LOW_CONFIDENCE",
  "WALLET_ATTRIBUTION_DISPUTED",
  "UNKNOWN_CIRCULATION_TREATMENT",
  "EXCLUDED_SUPPLY_EXCEEDS_CIRCULATING",
  "MARKET_CAP_RECONCILIATION_WARNING",
  "LIVE_PRICE_VARIANCE",
  "PROVIDER_FALLBACK_ACTIVE",
  "RESEARCH_REVIEW_OVERDUE",
] as const;

export type CalculationWarningCode = (typeof CALCULATION_WARNING_CODES)[number];
export type ConfidenceLabel = "high" | "medium" | "low" | "insufficient";
export type OwnershipConfidence = "high" | "medium" | "low" | "disputed";
export type WarningSeverity = "info" | "warning" | "blocking";

export type CalculationWarning = {
  code: CalculationWarningCode;
  severity: WarningSeverity;
  message: string;
  relatedIds: string[];
};

export type ProjectWalletInput = {
  walletId: string;
  normalizedBalance: string;
  circulatingInclusionFraction: string | null;
  affectsScore: boolean;
  ownershipConfidence: OwnershipConfidence;
};

export type FundingRoundInput = {
  fundingRoundId: string;
  amountUsdAtEvent: string | null;
  includeInCapitalDeduction: boolean;
};

export type ProjectCalculationInput = {
  projectId: string;
  assetId: string;
  priceUsd: string;
  circulatingSupply: string;
  providerMarketCapUsd?: string;
  wallets: ProjectWalletInput[];
  fundingRounds: FundingRoundInput[];
};

export type DeductibleWalletBalanceResult = {
  walletId: string;
  deductibleBalance: string | null;
  complete: boolean;
  warnings: CalculationWarning[];
};

export type ExcludedSupplyResult = {
  excludedSupply: string | null;
  knownExcludedSupply: string;
  complete: boolean;
  walletResults: DeductibleWalletBalanceResult[];
  warnings: CalculationWarning[];
};

export type QualifyingCapitalResult = {
  qualifyingCapitalUsd: string | null;
  knownQualifyingCapitalUsd: string;
  complete: boolean;
  warnings: CalculationWarning[];
};

export type MarketProviderComparison = {
  derivedMarketCapUsd: string;
  providerMarketCapUsd: string;
  absoluteDifferenceUsd: string;
  varianceFraction: string | null;
  withinTolerance: boolean;
  warnings: CalculationWarning[];
};

export type ProjectScoreResult = {
  projectId: string;
  assetId: string;
  status: "available" | "unavailable";
  circulatingMarketValueUsd: string;
  excludedSupply: string | null;
  knownExcludedSupply: string;
  excludedValueUsd: string | null;
  qualifyingCapitalUsd: string | null;
  knownQualifyingCapitalUsd: string;
  outsideHolderSupply: string | null;
  outsideHolderValueUsd: string | null;
  scoreUsd: string | null;
  marketProviderComparison: MarketProviderComparison | null;
  warnings: CalculationWarning[];
};

export type FoundingUnitProjectScoreInput = {
  projectId: string;
  scoreUsd: string | null;
  attributionFraction?: string;
};

export type FoundingUnitScoreResult = {
  foundingUnitId: string;
  status: "available" | "unavailable";
  scoreUsd: string | null;
  unavailableProjectIds: string[];
};

export type ConfidenceComponents = {
  founderIdentityEvidence: string;
  founderWalletCoverage: string;
  teamFoundationTreasuryCoverage: string;
  circulationTreatment: string;
  fundingCompleteness: string;
  marketReliability: string;
};

export type ConfidenceResult = {
  score: string;
  label: ConfidenceLabel;
  components: ConfidenceComponents;
};

export type RankingInput = {
  foundingUnitId: string;
  scoreUsd: string | null;
  confidenceLabel: ConfidenceLabel;
  previousRank?: number | null;
};

export type RankingResult = RankingInput & {
  rank: number | null;
  status: "ranked" | "research";
  movement: number | null;
};

export const DATA_FRESHNESS_KEYS = [
  "price",
  "marketCap",
  "circulatingSupply",
  "wallet",
  "ownershipReview",
  "fundingReview",
  "canonicalRanking",
] as const;

export type DataFreshnessKey = (typeof DATA_FRESHNESS_KEYS)[number];
export type FreshnessDatumInput = {
  observedAt: string | null;
  staleAfterSeconds: number;
};
export type DataFreshnessInput = {
  asOf: string;
  data: Record<DataFreshnessKey, FreshnessDatumInput>;
};
export type FreshnessDatumResult = {
  observedAt: string | null;
  status: "fresh" | "stale" | "missing" | "future";
  ageSeconds: number | null;
};
export type DataFreshnessResult = {
  asOf: string;
  data: Record<DataFreshnessKey, FreshnessDatumResult>;
  warnings: CalculationWarning[];
};

export type CalculationWarningInput = {
  project?: ProjectCalculationInput;
  marketDataMissing?: boolean;
  marketDataStale?: boolean;
  walletDataStale?: boolean;
  livePriceVariance?: boolean;
  providerFallbackActive?: boolean;
  researchReviewOverdue?: boolean;
};
