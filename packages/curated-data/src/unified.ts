import { readFile } from "node:fs/promises";
import path from "node:path";

import Decimal from "decimal.js";

export type UnifiedValueType = "Token/network" | "Public company";
export type UnifiedConfidenceLabel = "Low" | "Medium" | "High";

export type UnifiedEvidenceState =
  "resolved" | "not_publicly_verifiable" | "missing_research" | "disputed";

export interface UnifiedUncertaintyReview {
  evidenceState: UnifiedEvidenceState;
  lowerValueCreatedUsd: string;
  upperValueCreatedUsd: string;
  bestRank: number;
  worstRank: number;
  independentlyReviewed: boolean;
  contradictionFree: boolean;
  deduplicated: boolean;
  sourceIds: string[];
  notes: string;
}

export function hasRankInvariantUncertainty(
  review: UnifiedUncertaintyReview | undefined,
  storedRank: number,
): boolean {
  if (!review || review.evidenceState !== "not_publicly_verifiable")
    return false;
  try {
    const lower = new Decimal(review.lowerValueCreatedUsd);
    const upper = new Decimal(review.upperValueCreatedUsd);
    return (
      lower.isFinite() &&
      upper.isFinite() &&
      lower.gte(0) &&
      lower.lte(upper) &&
      Number.isInteger(review.bestRank) &&
      Number.isInteger(review.worstRank) &&
      review.bestRank === storedRank &&
      review.worstRank === storedRank &&
      review.independentlyReviewed &&
      review.contradictionFree &&
      review.deduplicated &&
      review.sourceIds.length > 0 &&
      review.notes.trim().length > 0
    );
  } catch {
    return false;
  }
}

export function classifyUnifiedConfidence(
  score: number,
  upperEstimate: boolean,
  uncertaintyReview?: UnifiedUncertaintyReview,
  storedRank = 0,
): UnifiedConfidenceLabel {
  if (
    score >= 85 &&
    (!upperEstimate ||
      hasRankInvariantUncertainty(uncertaintyReview, storedRank))
  )
    return "High";
  if (score >= 65) return "Medium";
  return "Low";
}

export interface UnifiedSource {
  id: string;
  category: string;
  name: string;
  date: string | null;
  url: string;
  quality: string;
  notes: string;
}

export interface ConfidenceComponent {
  key: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface UnifiedConfidence {
  score: number;
  label: UnifiedConfidenceLabel;
  components: ConfidenceComponent[];
}

export interface UnifiedShareClass {
  className: string;
  sharesOutstanding: string;
  asOfDate: string;
  sourceId: string;
}

export interface UnifiedMarketToken {
  type: "token";
  sourceId: string;
  observationDate: string;
  coinGeckoCoinId: string;
}

export interface UnifiedMarketCompany {
  type: "public";
  ticker: string;
  exchange: string;
  priceUsd: string;
  priceDate: string;
  priceSourceId: string;
  shareClasses: UnifiedShareClass[];
}

export type UnifiedMarket = UnifiedMarketToken | UnifiedMarketCompany;

export interface UnifiedHolder {
  name: string;
  shares: string;
  sourceId: string;
}

export interface UnifiedAffiliatedOwnership {
  status: "Accepted" | "Unknown" | "Excluded";
  totalShares?: string;
  ownershipDate?: string;
  sourceId?: string;
  holders?: UnifiedHolder[];
  notes: string;
}

export interface UnifiedCapitalEvent {
  eventId: string;
  label: string;
  amountUsd: string;
  date: string;
  sourceId: string;
  disposition: "Accepted" | "Excluded" | "Disputed" | "Scenario-only";
  notes: string;
}

export interface UnifiedOutsideCapital {
  status: "Accepted" | "Unknown";
  events: UnifiedCapitalEvent[];
  notes: string;
}

export interface UnifiedEntry {
  entryId: string;
  founderTeamId: string;
  founderTeam: string;
  project: string;
  valueType: UnifiedValueType;
  rank: number;
  snapshotDate: string;
  observationDate: string;
  grossMarketValueUsd: string;
  market: UnifiedMarket;
  affiliatedOwnership: UnifiedAffiliatedOwnership;
  outsideCapital: UnifiedOutsideCapital;
  confidence: UnifiedConfidence;
  includedEvidence: string[];
  excludedEvidence: string[];
  disputedEvidence: string[];
  unknowns: string[];
  upperEstimate: boolean;
  uncertaintyReview?: UnifiedUncertaintyReview;
  comparability: string;
}

export interface UnifiedDataset {
  metric: string;
  snapshotDate: string;
  methodologyVersion: string;
  sources: UnifiedSource[];
  entries: UnifiedEntry[];
}

export interface UnifiedCalculation {
  entry: UnifiedEntry;
  grossMarketValueUsd: string;
  acceptedAffiliatedOwnershipUsd: string | null;
  acceptedOutsideCapitalUsd: string | null;
  provisionalValueCreatedUsd: string;
  upperEstimate: boolean;
  formula: string;
}

export function isUnifiedRankProvisional(
  calculation: UnifiedCalculation,
): boolean {
  return (
    calculation.upperEstimate &&
    !hasRankInvariantUncertainty(
      calculation.entry.uncertaintyReview,
      calculation.entry.rank,
    )
  );
}

const defaultDirectory = path.resolve(process.cwd(), "data/research");

const productionMarker = ".curated-data-production.json";

export async function loadUnifiedData(
  directory = defaultDirectory,
): Promise<UnifiedDataset> {
  const contents = await readFile(
    path.join(directory, "unified-ranking.json"),
    "utf8",
  );
  return JSON.parse(contents) as UnifiedDataset;
}

export async function loadProductionUnifiedData(
  directory: string,
): Promise<UnifiedDataset> {
  const resolvedDirectory = path.resolve(
    process.env.INIT_CWD ?? process.cwd(),
    directory,
  );
  const marker = JSON.parse(
    await readFile(path.join(resolvedDirectory, productionMarker), "utf8"),
  ) as { environment?: string; synthetic?: boolean };
  if (marker.environment !== "production" || marker.synthetic !== false) {
    throw new Error(
      `${productionMarker} must identify non-synthetic production data`,
    );
  }
  const dataset = await loadUnifiedData(resolvedDirectory);
  const problems = validateUnifiedDataset(dataset);
  if (problems.length > 0) {
    throw new Error(
      `Unified production data validation failed:\n${problems
        .map((problem) => `- ${problem}`)
        .join("\n")}`,
    );
  }
  return dataset;
}

function acceptedCapital(entry: UnifiedEntry): Decimal | null {
  if (entry.outsideCapital.status !== "Accepted") return null;
  return entry.outsideCapital.events
    .filter((event) => event.disposition === "Accepted")
    .reduce((total, event) => total.plus(event.amountUsd), new Decimal(0));
}

function unsupportedAcceptedTokenOwnership(entry: UnifiedEntry): string | null {
  if (
    entry.market.type === "token" &&
    entry.affiliatedOwnership.status === "Accepted"
  )
    return `${entry.entryId} Accepted token ownership requires a calculable token supply/price model`;
  return null;
}

export function calculateUnifiedEntry(entry: UnifiedEntry): UnifiedCalculation {
  const ownershipError = unsupportedAcceptedTokenOwnership(entry);
  if (ownershipError) throw new Error(ownershipError);

  const publicMarket =
    entry.market.type === "public" ? entry.market : undefined;
  const gross = publicMarket
    ? publicMarket.shareClasses.reduce(
        (total, shareClass) =>
          total.plus(
            new Decimal(shareClass.sharesOutstanding).times(
              publicMarket.priceUsd,
            ),
          ),
        new Decimal(0),
      )
    : new Decimal(entry.grossMarketValueUsd);
  const ownership =
    publicMarket &&
    entry.affiliatedOwnership.status === "Accepted" &&
    typeof entry.affiliatedOwnership.totalShares === "string"
      ? new Decimal(entry.affiliatedOwnership.totalShares).times(
          publicMarket.priceUsd,
        )
      : null;
  const capital = acceptedCapital(entry);
  let result = gross;
  if (ownership !== null) result = result.minus(ownership);
  if (capital !== null) result = result.minus(capital);
  const grossText = gross.toFixed(2);
  const ownershipText = ownership?.toFixed(2) ?? null;
  const capitalText = capital?.toFixed(2) ?? null;

  return {
    entry,
    grossMarketValueUsd: grossText,
    acceptedAffiliatedOwnershipUsd: ownershipText,
    acceptedOutsideCapitalUsd: capitalText,
    provisionalValueCreatedUsd: result.toFixed(2),
    upperEstimate:
      entry.upperEstimate || ownership === null || capital === null,
    formula: `${grossText} − ${ownershipText ?? "Unknown"} − ${capitalText ?? "Unknown"} = ${result.toFixed(2)}`,
  };
}

export function buildUnifiedRanking(
  dataset: UnifiedDataset,
): UnifiedCalculation[] {
  return dataset.entries.map(calculateUnifiedEntry).sort((left, right) => {
    const valueOrder = new Decimal(right.provisionalValueCreatedUsd).cmp(
      left.provisionalValueCreatedUsd,
    );
    return valueOrder === 0
      ? left.entry.entryId.localeCompare(right.entry.entryId)
      : valueOrder;
  });
}

function rankAtBound(
  ranking: UnifiedCalculation[],
  entryId: string,
  valueCreatedUsd: Decimal,
): number {
  return (
    ranking
      .map((calculation) => ({
        entryId: calculation.entry.entryId,
        valueCreatedUsd:
          calculation.entry.entryId === entryId
            ? valueCreatedUsd
            : new Decimal(calculation.provisionalValueCreatedUsd),
      }))
      .sort((left, right) => {
        const valueOrder = right.valueCreatedUsd.cmp(left.valueCreatedUsd);
        return valueOrder === 0
          ? left.entryId.localeCompare(right.entryId)
          : valueOrder;
      })
      .findIndex((candidate) => candidate.entryId === entryId) + 1
  );
}

export function validateUnifiedDataset(dataset: UnifiedDataset): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  const ranking = dataset.entries.some((entry) =>
    unsupportedAcceptedTokenOwnership(entry),
  )
    ? []
    : buildUnifiedRanking(dataset);
  const ranks = dataset.entries
    .map((entry) => entry.rank)
    .sort((a, b) => a - b);
  const expectedRanks = Array.from({ length: 20 }, (_, index) => index + 1);

  if (dataset.entries.length !== 20)
    errors.push("primary ranking must contain exactly 20 entries");
  if (ranks.join(",") !== expectedRanks.join(","))
    errors.push("ranks must be unique and contiguous");
  if (
    ranking.some((calculation, index) => calculation.entry.rank !== index + 1)
  )
    errors.push("stored ranks must match calculated order");
  if (
    dataset.entries.filter((entry) => entry.entryId === "coinbase").length !== 1
  )
    errors.push("Coinbase must appear exactly once");

  for (const entry of dataset.entries) {
    const ownershipError = unsupportedAcceptedTokenOwnership(entry);
    if (ownershipError) errors.push(ownershipError);
    const calculation = ownershipError ? null : calculateUnifiedEntry(entry);
    if (entry.valueType === "Public company" && entry.market.type !== "public")
      errors.push(`${entry.entryId} must use the public-company market model`);
    if (entry.valueType === "Token/network" && entry.market.type !== "token")
      errors.push(`${entry.entryId} must use the token market model`);
    if (
      entry.valueType === "Public company" &&
      entry.market.type === "public" &&
      calculation &&
      !new Decimal(entry.grossMarketValueUsd).eq(
        calculation.grossMarketValueUsd,
      )
    )
      errors.push(`${entry.entryId} gross value does not reproduce`);
    if (entry.affiliatedOwnership.status === "Accepted") {
      if (
        !entry.affiliatedOwnership.sourceId ||
        !sourceIds.has(entry.affiliatedOwnership.sourceId)
      )
        errors.push(`${entry.entryId} accepted ownership lacks a source`);
      for (const holder of entry.affiliatedOwnership.holders ?? [])
        if (!sourceIds.has(holder.sourceId))
          errors.push(`${entry.entryId} holder ${holder.name} lacks a source`);
      if (
        entry.valueType === "Public company" &&
        entry.market.type === "public"
      ) {
        if (typeof entry.affiliatedOwnership.totalShares !== "string")
          errors.push(`${entry.entryId} accepted ownership lacks total shares`);
        const holderShares = (entry.affiliatedOwnership.holders ?? []).reduce(
          (sum, holder) => sum.plus(holder.shares),
          new Decimal(0),
        );
        if (
          holderShares.isZero() ||
          (typeof entry.affiliatedOwnership.totalShares === "string" &&
            !holderShares.eq(entry.affiliatedOwnership.totalShares))
        )
          errors.push(
            `${entry.entryId} founder/affiliate shares do not reproduce`,
          );
      }
    }
    for (const event of entry.outsideCapital.events.filter(
      (event) => event.disposition === "Accepted",
    ))
      if (!sourceIds.has(event.sourceId))
        errors.push(
          `${entry.entryId} accepted capital ${event.eventId} lacks a source`,
        );
    if (entry.market.type === "token" && !sourceIds.has(entry.market.sourceId))
      errors.push(`${entry.entryId} market observation lacks a source`);
    if (entry.market.type === "public") {
      if (!sourceIds.has(entry.market.priceSourceId))
        errors.push(`${entry.entryId} price lacks a source`);
      if (entry.market.shareClasses.length === 0)
        errors.push(`${entry.entryId} has no share classes`);
      for (const shareClass of entry.market.shareClasses)
        if (!sourceIds.has(shareClass.sourceId))
          errors.push(
            `${entry.entryId} ${shareClass.className} share count lacks a source`,
          );
    }
    const componentTotal = entry.confidence.components.reduce(
      (sum, component) => sum + component.score,
      0,
    );
    const componentMax = entry.confidence.components.reduce(
      (sum, component) => sum + component.maxScore,
      0,
    );
    if (
      componentTotal !== entry.confidence.score ||
      componentMax !== 100 ||
      entry.confidence.score < 0 ||
      entry.confidence.score > 100 ||
      entry.confidence.components.some(
        (component) =>
          component.score < 0 || component.score > component.maxScore,
      )
    )
      errors.push(`${entry.entryId} confidence does not reproduce`);
    if (
      calculation &&
      entry.confidence.label !==
        classifyUnifiedConfidence(
          entry.confidence.score,
          calculation.upperEstimate,
          entry.uncertaintyReview,
          entry.rank,
        )
    )
      errors.push(
        `${entry.entryId} confidence label does not match score and upper-estimate state`,
      );
    if (entry.uncertaintyReview) {
      const review = entry.uncertaintyReview;
      if (
        ![
          "resolved",
          "not_publicly_verifiable",
          "missing_research",
          "disputed",
        ].includes(review.evidenceState)
      )
        errors.push(`${entry.entryId} uncertainty evidence state is invalid`);
      let lower: Decimal | null = null;
      let upper: Decimal | null = null;
      try {
        lower = new Decimal(review.lowerValueCreatedUsd);
        upper = new Decimal(review.upperValueCreatedUsd);
      } catch {
        errors.push(`${entry.entryId} uncertainty bounds are invalid`);
      }
      if (
        lower &&
        upper &&
        (!lower.isFinite() ||
          !upper.isFinite() ||
          lower.lt(0) ||
          lower.gt(upper))
      )
        errors.push(`${entry.entryId} uncertainty bounds are invalid`);
      if (
        calculation &&
        lower &&
        upper &&
        (new Decimal(calculation.provisionalValueCreatedUsd).lt(lower) ||
          new Decimal(calculation.provisionalValueCreatedUsd).gt(upper))
      )
        errors.push(
          `${entry.entryId} provisional value falls outside uncertainty bounds`,
        );
      if (
        !Number.isInteger(review.bestRank) ||
        !Number.isInteger(review.worstRank) ||
        review.bestRank < 1 ||
        review.worstRank < review.bestRank ||
        review.worstRank > dataset.entries.length
      )
        errors.push(`${entry.entryId} uncertainty rank range is invalid`);
      if (
        ranking.length > 0 &&
        lower &&
        upper &&
        (review.bestRank !== rankAtBound(ranking, entry.entryId, upper) ||
          review.worstRank !== rankAtBound(ranking, entry.entryId, lower))
      )
        errors.push(
          `${entry.entryId} uncertainty ranks do not reproduce from bounds`,
        );
      if (review.sourceIds.length === 0 || review.notes.trim().length === 0)
        errors.push(`${entry.entryId} uncertainty review evidence is missing`);
      for (const sourceId of review.sourceIds)
        if (!sourceIds.has(sourceId))
          errors.push(
            `${entry.entryId} uncertainty review source ${sourceId} is missing`,
          );
    }
    if (/USDC|stablecoin supply/i.test(entry.project))
      errors.push(
        `${entry.entryId} mixes stablecoin supply with company equity`,
      );
  }
  return errors;
}
