import Decimal from "decimal.js";

import {
  CalculationInputError,
  formatDecimal,
  formatUsd,
  parseDecimal,
} from "./decimal.js";
import {
  DATA_FRESHNESS_KEYS,
  type CalculationWarning,
  type CalculationWarningInput,
  type ConfidenceComponents,
  type ConfidenceLabel,
  type ConfidenceResult,
  type DataFreshnessInput,
  type DataFreshnessResult,
  type DeductibleWalletBalanceResult,
  type ExcludedSupplyResult,
  type FoundingUnitProjectScoreInput,
  type FoundingUnitScoreResult,
  type FreshnessDatumResult,
  type FundingRoundInput,
  type MarketProviderComparison,
  type ProjectCalculationInput,
  type ProjectScoreResult,
  type ProjectWalletInput,
  type QualifyingCapitalResult,
  type RankingInput,
  type RankingResult,
  type ReviewStatus,
} from "./types.js";

export * from "./types.js";
export * from "./v2/inputs.js";
export { CalculationInputError } from "./decimal.js";

export const DEFAULT_MARKET_CAP_VARIANCE_TOLERANCE = "0.05";

const SCORE_ELIGIBLE_WALLET_CLASSIFICATIONS = new Set([
  "founder",
  "cofounder",
  "founder_controlled_company",
]);

const warning = (
  code: CalculationWarning["code"],
  severity: CalculationWarning["severity"],
  message: string,
  relatedIds: string[] = [],
): CalculationWarning => ({ code, severity, message, relatedIds });

const deduplicateWarnings = (
  warnings: CalculationWarning[],
): CalculationWarning[] => {
  const seen = new Set<string>();
  return warnings.filter((item) => {
    const key = `${item.code}:${item.relatedIds.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

export function calculateDeductibleWalletBalance(
  wallet: ProjectWalletInput,
): DeductibleWalletBalanceResult {
  const warnings: CalculationWarning[] = [];

  if (wallet.ownershipConfidence === "low") {
    warnings.push(
      warning(
        "WALLET_ATTRIBUTION_LOW_CONFIDENCE",
        "warning",
        "Wallet ownership attribution has low confidence.",
        [wallet.walletId],
      ),
    );
  } else if (wallet.ownershipConfidence === "disputed") {
    warnings.push(
      warning(
        "WALLET_ATTRIBUTION_DISPUTED",
        "warning",
        "Wallet ownership attribution is disputed.",
        [wallet.walletId],
      ),
    );
  }

  if (!wallet.affectsScore) {
    return {
      walletId: wallet.walletId,
      deductibleBalance: "0",
      complete: true,
      warnings,
    };
  }

  if (
    wallet.ownershipConfidence !== "high" ||
    !SCORE_ELIGIBLE_WALLET_CLASSIFICATIONS.has(wallet.classification)
  ) {
    warnings.push(
      warning(
        "WALLET_ATTRIBUTION_INELIGIBLE",
        "blocking",
        "Only high-confidence founder ownership can affect a published score.",
        [wallet.walletId],
      ),
    );
    return {
      walletId: wallet.walletId,
      deductibleBalance: null,
      complete: false,
      warnings,
    };
  }

  if (
    wallet.reviewStatus !== "approved_sufficient" ||
    !wallet.evidenceComplete
  ) {
    warnings.push(
      warning(
        "WALLET_REVIEW_INCOMPLETE",
        "blocking",
        "A score-affecting wallet requires an approved sufficient review and complete evidence.",
        [wallet.walletId],
      ),
    );
    return {
      walletId: wallet.walletId,
      deductibleBalance: null,
      complete: false,
      warnings,
    };
  }

  if (wallet.balanceIncludedInCirculatingSupply === false) {
    return {
      walletId: wallet.walletId,
      deductibleBalance: "0",
      complete: true,
      warnings,
    };
  }

  if (
    wallet.balanceIncludedInCirculatingSupply === null ||
    wallet.circulatingInclusionFraction === null
  ) {
    warnings.push(
      warning(
        "UNKNOWN_CIRCULATION_TREATMENT",
        "blocking",
        "Wallet circulation treatment is unknown; no deduction is assumed.",
        [wallet.walletId],
      ),
    );
    return {
      walletId: wallet.walletId,
      deductibleBalance: null,
      complete: false,
      warnings,
    };
  }

  if (wallet.normalizedBalance === null) {
    warnings.push(
      warning(
        "WALLET_BALANCE_MISSING",
        "blocking",
        "A reviewed score-affecting wallet is missing a balance observation.",
        [wallet.walletId],
      ),
    );
    return {
      walletId: wallet.walletId,
      deductibleBalance: null,
      complete: false,
      warnings,
    };
  }

  const balance = parseDecimal(
    wallet.normalizedBalance,
    `wallet ${wallet.walletId} balance`,
    { minimum: "0" },
  );

  const fraction = parseDecimal(
    wallet.circulatingInclusionFraction,
    `wallet ${wallet.walletId} circulation fraction`,
    { minimum: "0", maximum: "1" },
  );

  return {
    walletId: wallet.walletId,
    deductibleBalance: formatDecimal(balance.mul(fraction)),
    complete: true,
    warnings,
  };
}

export function calculateExcludedSupply(
  wallets: ProjectWalletInput[],
  reviewStatus: ReviewStatus,
): ExcludedSupplyResult {
  const seenKeys = new Map<string, string>();
  const duplicateWarnings: CalculationWarning[] = [];
  const uniqueWallets = wallets.filter((wallet) => {
    const firstWalletId = seenKeys.get(wallet.deduplicationKey);
    if (firstWalletId === undefined) {
      seenKeys.set(wallet.deduplicationKey, wallet.walletId);
      return true;
    }
    duplicateWarnings.push(
      warning(
        "DUPLICATE_WALLET_DEDUCTION",
        "blocking",
        "Duplicate wallet deduction was ignored to prevent double subtraction.",
        [firstWalletId, wallet.walletId],
      ),
    );
    return false;
  });
  const walletResults = uniqueWallets.map(calculateDeductibleWalletBalance);
  const knownExcludedSupply = walletResults.reduce(
    (total, result) =>
      result.deductibleBalance === null
        ? total
        : total.add(result.deductibleBalance),
    new Decimal(0),
  );
  const reviewComplete = reviewStatus === "approved_sufficient";
  const complete =
    reviewComplete &&
    duplicateWarnings.length === 0 &&
    walletResults.every((result) => result.complete);
  const reviewWarnings = reviewComplete
    ? []
    : [
        warning(
          "WALLET_REVIEW_INCOMPLETE",
          "blocking",
          "Project wallet coverage is not reviewed and sufficient; the deduction is Unknown.",
        ),
      ];
  const hasKnownValue =
    reviewComplete ||
    walletResults.some((result) => result.deductibleBalance !== null);

  return {
    excludedSupply: complete ? formatDecimal(knownExcludedSupply) : null,
    knownExcludedSupply: hasKnownValue
      ? formatDecimal(knownExcludedSupply)
      : null,
    complete,
    walletResults,
    warnings: deduplicateWarnings([
      ...walletResults.flatMap((result) => result.warnings),
      ...duplicateWarnings,
      ...reviewWarnings,
    ]),
  };
}

const sumKnownQualifyingCapital = (
  fundingRounds: FundingRoundInput[],
): Decimal => {
  let capital = new Decimal(0);

  for (const fundingRound of fundingRounds) {
    if (!fundingRound.includeInCapitalDeduction) continue;
    if (fundingRound.amountUsdAtEvent === null) continue;
    if (
      fundingRound.reviewStatus !== "approved_sufficient" ||
      !fundingRound.evidenceComplete
    )
      continue;
    capital = capital.add(
      parseDecimal(
        fundingRound.amountUsdAtEvent,
        `funding round ${fundingRound.fundingRoundId} amount`,
        { minimum: "0" },
      ),
    );
  }

  return capital;
};

export function calculateQualifyingCapital(
  fundingRounds: FundingRoundInput[],
  reviewStatus: ReviewStatus,
): QualifyingCapitalResult {
  const seenKeys = new Map<string, string>();
  const duplicateIds: string[] = [];
  const uniqueRounds = fundingRounds.filter((fundingRound) => {
    const firstRoundId = seenKeys.get(fundingRound.deduplicationKey);
    if (firstRoundId === undefined) {
      seenKeys.set(fundingRound.deduplicationKey, fundingRound.fundingRoundId);
      return true;
    }
    duplicateIds.push(firstRoundId, fundingRound.fundingRoundId);
    return false;
  });
  const capital = sumKnownQualifyingCapital(uniqueRounds);
  const missingIds = uniqueRounds
    .filter(
      (fundingRound) =>
        fundingRound.includeInCapitalDeduction &&
        fundingRound.amountUsdAtEvent === null,
    )
    .map((fundingRound) => fundingRound.fundingRoundId);
  const incompleteReviewIds = uniqueRounds
    .filter(
      (fundingRound) =>
        fundingRound.reviewStatus !== "approved_sufficient" ||
        !fundingRound.evidenceComplete ||
        !fundingRound.inclusionReason?.trim(),
    )
    .map((fundingRound) => fundingRound.fundingRoundId);
  const reviewComplete = reviewStatus === "approved_sufficient";
  const complete =
    reviewComplete &&
    missingIds.length === 0 &&
    incompleteReviewIds.length === 0 &&
    duplicateIds.length === 0;

  const warnings: CalculationWarning[] = [];
  if (!reviewComplete || incompleteReviewIds.length > 0) {
    warnings.push(
      warning(
        "FUNDING_REVIEW_INCOMPLETE",
        "blocking",
        "Project lifetime funding coverage and every financing event require an approved sufficient review, complete evidence, and an inclusion decision.",
        incompleteReviewIds,
      ),
    );
  }
  if (missingIds.length > 0) {
    warnings.push(
      warning(
        "FUNDING_DATA_INCOMPLETE",
        "blocking",
        "Included funding is missing a verified USD-at-event amount.",
        missingIds,
      ),
    );
  }
  if (duplicateIds.length > 0) {
    warnings.push(
      warning(
        "DUPLICATE_FUNDING_DEDUCTION",
        "blocking",
        "Duplicate funding deduction was ignored to prevent double subtraction.",
        [...new Set(duplicateIds)],
      ),
    );
  }

  return {
    qualifyingCapitalUsd: complete ? formatUsd(capital) : null,
    knownQualifyingCapitalUsd:
      reviewComplete || capital.gt(0) ? formatUsd(capital) : null,
    complete,
    warnings,
  };
}

export function compareMarketProviders(input: {
  derivedMarketCapUsd: string;
  providerMarketCapUsd: string;
  toleranceFraction?: string;
}): MarketProviderComparison {
  const derived = parseDecimal(
    input.derivedMarketCapUsd,
    "derived market cap",
    { minimum: "0" },
  );
  const provider = parseDecimal(
    input.providerMarketCapUsd,
    "provider market cap",
    { minimum: "0" },
  );
  const tolerance = parseDecimal(
    input.toleranceFraction ?? DEFAULT_MARKET_CAP_VARIANCE_TOLERANCE,
    "market cap variance tolerance",
    { minimum: "0", maximum: "1" },
  );
  const difference = derived.sub(provider).abs();
  const variance = derived.isZero() ? null : difference.div(derived);
  const withinTolerance =
    variance === null ? provider.isZero() : variance.lte(tolerance);

  return {
    derivedMarketCapUsd: formatUsd(derived),
    providerMarketCapUsd: formatUsd(provider),
    absoluteDifferenceUsd: formatUsd(difference),
    varianceFraction: variance === null ? null : formatDecimal(variance),
    withinTolerance,
    warnings: withinTolerance
      ? []
      : [
          warning(
            "MARKET_CAP_RECONCILIATION_WARNING",
            "warning",
            "Provider market cap differs from price multiplied by circulating supply beyond tolerance.",
          ),
        ],
  };
}

export function generateCalculationWarnings(
  input: CalculationWarningInput,
): CalculationWarning[] {
  const warnings: CalculationWarning[] = [];

  if (input.marketDataMissing) {
    warnings.push(
      warning(
        "MARKET_DATA_MISSING",
        "blocking",
        "Required market data is missing.",
      ),
    );
  }
  if (input.marketDataStale) {
    warnings.push(
      warning("MARKET_DATA_STALE", "warning", "Market data is stale."),
    );
  }
  if (input.walletDataStale) {
    warnings.push(
      warning("WALLET_DATA_STALE", "warning", "Wallet data is stale."),
    );
  }
  if (input.livePriceVariance) {
    warnings.push(
      warning(
        "LIVE_PRICE_VARIANCE",
        "warning",
        "Live price differs from the canonical snapshot.",
      ),
    );
  }
  if (input.providerFallbackActive) {
    warnings.push(
      warning(
        "PROVIDER_FALLBACK_ACTIVE",
        "warning",
        "A fallback market provider is active.",
      ),
    );
  }
  if (input.researchReviewOverdue) {
    warnings.push(
      warning(
        "RESEARCH_REVIEW_OVERDUE",
        "warning",
        "Ownership or funding research review is overdue.",
      ),
    );
  }

  if (input.project !== undefined) {
    const excluded = calculateExcludedSupply(
      input.project.wallets,
      input.project.walletReviewStatus,
    );
    const capital = calculateQualifyingCapital(
      input.project.fundingRounds,
      input.project.fundingReviewStatus,
    );
    warnings.push(...excluded.warnings, ...capital.warnings);

    if (excluded.excludedSupply !== null) {
      const supply = parseDecimal(
        input.project.circulatingSupply,
        "circulating supply",
        {
          minimum: "0",
        },
      );
      if (new Decimal(excluded.excludedSupply).gt(supply)) {
        warnings.push(
          warning(
            "EXCLUDED_SUPPLY_EXCEEDS_CIRCULATING",
            "blocking",
            "Excluded supply exceeds circulating supply.",
            [input.project.projectId],
          ),
        );
      }
    }

    if (input.project.providerMarketCapUsd !== undefined) {
      const price = parseDecimal(input.project.priceUsd, "price", {
        exclusiveMinimum: "0",
      });
      const supply = parseDecimal(
        input.project.circulatingSupply,
        "circulating supply",
        {
          minimum: "0",
        },
      );
      warnings.push(
        ...compareMarketProviders({
          derivedMarketCapUsd: formatDecimal(price.mul(supply)),
          providerMarketCapUsd: input.project.providerMarketCapUsd,
        }).warnings,
      );
    }
  }

  return deduplicateWarnings(warnings);
}

export function calculateProjectScore(
  input: ProjectCalculationInput,
): ProjectScoreResult {
  const price = parseDecimal(input.priceUsd, "price", {
    exclusiveMinimum: "0",
  });
  const circulatingSupply = parseDecimal(
    input.circulatingSupply,
    "circulating supply",
    {
      minimum: "0",
    },
  );
  const circulatingMarketValue = price.mul(circulatingSupply);
  const excluded = calculateExcludedSupply(
    input.wallets,
    input.walletReviewStatus,
  );
  const capital = calculateQualifyingCapital(
    input.fundingRounds,
    input.fundingReviewStatus,
  );
  const warnings = generateCalculationWarnings({ project: input });
  const hasBlockingWarning = warnings.some(
    (item) => item.severity === "blocking",
  );
  const providerComparison =
    input.providerMarketCapUsd === undefined
      ? null
      : compareMarketProviders({
          derivedMarketCapUsd: formatDecimal(circulatingMarketValue),
          providerMarketCapUsd: input.providerMarketCapUsd,
        });

  if (
    hasBlockingWarning ||
    excluded.excludedSupply === null ||
    capital.qualifyingCapitalUsd === null
  ) {
    return {
      projectId: input.projectId,
      assetId: input.assetId,
      status: "unavailable",
      circulatingMarketValueUsd: formatUsd(circulatingMarketValue),
      excludedSupply: excluded.excludedSupply,
      knownExcludedSupply: excluded.knownExcludedSupply,
      excludedValueUsd: null,
      qualifyingCapitalUsd: capital.qualifyingCapitalUsd,
      knownQualifyingCapitalUsd: capital.knownQualifyingCapitalUsd,
      outsideHolderSupply: null,
      outsideHolderValueUsd: null,
      scoreUsd: null,
      marketProviderComparison: providerComparison,
      warnings,
    };
  }

  const excludedSupply = new Decimal(excluded.excludedSupply);
  const qualifyingCapital = sumKnownQualifyingCapital(input.fundingRounds);
  const outsideHolderSupply = circulatingSupply.sub(excludedSupply);
  const excludedValue = price.mul(excludedSupply);
  const outsideHolderValue = price.mul(outsideHolderSupply);
  const score = Decimal.max(0, outsideHolderValue.sub(qualifyingCapital));

  return {
    projectId: input.projectId,
    assetId: input.assetId,
    status: "available",
    circulatingMarketValueUsd: formatUsd(circulatingMarketValue),
    excludedSupply: formatDecimal(excludedSupply),
    knownExcludedSupply: excluded.knownExcludedSupply,
    excludedValueUsd: formatUsd(excludedValue),
    qualifyingCapitalUsd: formatUsd(qualifyingCapital),
    knownQualifyingCapitalUsd: capital.knownQualifyingCapitalUsd,
    outsideHolderSupply: formatDecimal(outsideHolderSupply),
    outsideHolderValueUsd: formatUsd(outsideHolderValue),
    scoreUsd: formatUsd(score),
    marketProviderComparison: providerComparison,
    warnings,
  };
}

export function calculateFoundingUnitScore(input: {
  foundingUnitId: string;
  projects: FoundingUnitProjectScoreInput[];
}): FoundingUnitScoreResult {
  const seenProjectIds = new Set<string>();
  const unavailableProjectIds: string[] = [];
  let score = new Decimal(0);

  for (const project of input.projects) {
    if (seenProjectIds.has(project.projectId)) {
      throw new CalculationInputError(`duplicate project ${project.projectId}`);
    }
    seenProjectIds.add(project.projectId);
    const fraction = parseDecimal(
      project.attributionFraction ?? "1",
      `project ${project.projectId} attribution fraction`,
      { minimum: "0", maximum: "1" },
    );
    if (project.scoreUsd === null) {
      unavailableProjectIds.push(project.projectId);
      continue;
    }
    score = score.add(
      parseDecimal(project.scoreUsd, `project ${project.projectId} score`).mul(
        fraction,
      ),
    );
  }

  return unavailableProjectIds.length === 0
    ? {
        foundingUnitId: input.foundingUnitId,
        status: "available",
        scoreUsd: formatUsd(score),
        unavailableProjectIds,
      }
    : {
        foundingUnitId: input.foundingUnitId,
        status: "unavailable",
        scoreUsd: null,
        unavailableProjectIds,
      };
}

const CONFIDENCE_MAXIMUMS: Record<keyof ConfidenceComponents, string> = {
  founderIdentityEvidence: "10",
  founderWalletCoverage: "20",
  teamFoundationTreasuryCoverage: "20",
  circulationTreatment: "20",
  fundingCompleteness: "20",
  marketReliability: "10",
};

const confidenceLabel = (score: Decimal): ConfidenceLabel => {
  if (score.gte("85")) return "high";
  if (score.gte("65")) return "medium";
  if (score.gte("40")) return "low";
  return "insufficient";
};

export function calculateConfidence(
  components: ConfidenceComponents,
): ConfidenceResult {
  let score = new Decimal(0);
  const missingComponents: Array<keyof ConfidenceComponents> = [];
  for (const key of Object.keys(CONFIDENCE_MAXIMUMS) as Array<
    keyof ConfidenceComponents
  >) {
    const component = components[key];
    if (component === null || component === undefined || component === "") {
      missingComponents.push(key);
      continue;
    }
    score = score.add(
      parseDecimal(component, `confidence component ${key}`, {
        minimum: "0",
        maximum: CONFIDENCE_MAXIMUMS[key],
      }),
    );
  }

  return {
    score: score.toFixed(2),
    label:
      missingComponents.length === 0 ? confidenceLabel(score) : "insufficient",
    components,
    complete: missingComponents.length === 0,
    missingComponents,
  };
}

export function calculateRankings(inputs: RankingInput[]): RankingResult[] {
  const seenIds = new Set<string>();
  for (const input of inputs) {
    if (seenIds.has(input.foundingUnitId)) {
      throw new CalculationInputError(
        `duplicate founding unit ${input.foundingUnitId}`,
      );
    }
    seenIds.add(input.foundingUnitId);
  }

  const ineligibilityReasons = (input: RankingInput): string[] => {
    const reasons: string[] = [];
    if (input.scoreUsd === null) reasons.push("calculation unavailable");
    if (input.marketDataStatus !== "recent_sourced")
      reasons.push("recent sourced market data unavailable");
    if (input.fundingReviewStatus !== "approved_sufficient")
      reasons.push("funding review is not approved and sufficient");
    if (input.walletReviewStatus !== "approved_sufficient")
      reasons.push("wallet review is not approved and sufficient");
    if (!input.evidenceComplete)
      reasons.push("deduction or exclusion evidence is incomplete");
    if (input.calculatedConfidenceLabel === "insufficient")
      reasons.push("confidence is insufficient");
    return reasons;
  };

  const rankable = inputs
    .filter(
      (input): input is RankingInput & { scoreUsd: string } =>
        ineligibilityReasons(input).length === 0,
    )
    .map((input) => ({
      input,
      score: parseDecimal(input.scoreUsd, `${input.foundingUnitId} score`),
    }))
    .sort((left, right) => {
      const scoreOrder = right.score.comparedTo(left.score);
      return scoreOrder === 0
        ? left.input.foundingUnitId.localeCompare(right.input.foundingUnitId)
        : scoreOrder;
    });

  const ranked = new Map<string, RankingResult>();
  rankable.forEach(({ input }, index) => {
    const currentRank = index + 1;
    const previousRank = input.previousRank ?? null;
    ranked.set(input.foundingUnitId, {
      ...input,
      rank: currentRank,
      status: "ranked",
      eligibilityStatus: "eligible",
      ineligibilityReasons: [],
      movement: previousRank === null ? null : previousRank - currentRank,
    });
  });

  return inputs.map(
    (input) =>
      ranked.get(input.foundingUnitId) ?? {
        ...input,
        rank: null,
        status: "research",
        eligibilityStatus: "ineligible",
        ineligibilityReasons: ineligibilityReasons(input),
        movement: null,
      },
  );
}

const parseTimestamp = (value: string, field: string): number => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp))
    throw new CalculationInputError(`${field} must be an ISO timestamp`);
  return timestamp;
};

export function calculateDataFreshness(
  input: DataFreshnessInput,
): DataFreshnessResult {
  const asOfMs = parseTimestamp(input.asOf, "asOf");
  const data = {} as DataFreshnessResult["data"];

  for (const key of DATA_FRESHNESS_KEYS) {
    const datum = input.data[key];
    if (
      !Number.isSafeInteger(datum.staleAfterSeconds) ||
      datum.staleAfterSeconds < 0
    ) {
      throw new CalculationInputError(
        `${key} staleAfterSeconds must be a non-negative integer`,
      );
    }
    if (datum.observedAt === null) {
      data[key] = { observedAt: null, status: "missing", ageSeconds: null };
      continue;
    }
    const observedAtMs = parseTimestamp(datum.observedAt, `${key} observedAt`);
    const ageSeconds = Math.floor((asOfMs - observedAtMs) / 1000);
    const status: FreshnessDatumResult["status"] =
      ageSeconds < 0
        ? "future"
        : ageSeconds > datum.staleAfterSeconds
          ? "stale"
          : "fresh";
    data[key] = { observedAt: datum.observedAt, status, ageSeconds };
  }

  const marketKeys = ["price", "marketCap", "circulatingSupply"] as const;
  const marketDataMissing = marketKeys.some(
    (key) => data[key].status === "missing",
  );
  const marketDataStale = marketKeys.some(
    (key) => data[key].status === "stale",
  );
  const walletDataStale =
    data.wallet.status === "stale" || data.wallet.status === "missing";
  const researchReviewOverdue = [data.ownershipReview, data.fundingReview].some(
    (datum) => datum.status === "stale" || datum.status === "missing",
  );

  return {
    asOf: input.asOf,
    data,
    warnings: generateCalculationWarnings({
      marketDataMissing,
      marketDataStale,
      walletDataStale,
      researchReviewOverdue,
    }),
  };
}
