import { readFile } from "node:fs/promises";
import path from "node:path";

import Decimal from "decimal.js";

export type UnifiedValueType = "Token/network" | "Public company";
export type UnifiedConfidenceLabel = "Low" | "Medium" | "High";

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

const defaultDirectory = path.resolve(process.cwd(), "data/research");

export async function loadUnifiedData(
  directory = defaultDirectory,
): Promise<UnifiedDataset> {
  const contents = await readFile(
    path.join(directory, "unified-ranking.json"),
    "utf8",
  );
  return JSON.parse(contents) as UnifiedDataset;
}

function acceptedCapital(entry: UnifiedEntry): Decimal | null {
  if (entry.outsideCapital.status !== "Accepted") return null;
  return entry.outsideCapital.events
    .filter((event) => event.disposition === "Accepted")
    .reduce((total, event) => total.plus(event.amountUsd), new Decimal(0));
}

export function calculateUnifiedEntry(entry: UnifiedEntry): UnifiedCalculation {
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
    publicMarket && entry.affiliatedOwnership.status === "Accepted"
      ? new Decimal(entry.affiliatedOwnership.totalShares ?? "0").times(
          publicMarket.priceUsd,
        )
      : null;
  const capital = acceptedCapital(entry);
  const result = gross.minus(ownership ?? 0).minus(capital ?? 0);
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
  return dataset.entries
    .map(calculateUnifiedEntry)
    .sort((left, right) =>
      new Decimal(right.provisionalValueCreatedUsd).cmp(
        left.provisionalValueCreatedUsd,
      ),
    );
}

export function validateUnifiedDataset(dataset: UnifiedDataset): string[] {
  const errors: string[] = [];
  const sourceIds = new Set(dataset.sources.map((source) => source.id));
  const ranking = buildUnifiedRanking(dataset);
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
    const calculation = calculateUnifiedEntry(entry);
    if (entry.valueType === "Public company" && entry.market.type !== "public")
      errors.push(`${entry.entryId} must use the public-company market model`);
    if (entry.valueType === "Token/network" && entry.market.type !== "token")
      errors.push(`${entry.entryId} must use the token market model`);
    if (
      entry.valueType === "Public company" &&
      entry.market.type === "public" &&
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
        const holderShares = (entry.affiliatedOwnership.holders ?? []).reduce(
          (sum, holder) => sum.plus(holder.shares),
          new Decimal(0),
        );
        if (
          holderShares.isZero() ||
          !holderShares.eq(entry.affiliatedOwnership.totalShares ?? "0")
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
    if (/USDC|stablecoin supply/i.test(entry.project))
      errors.push(
        `${entry.entryId} mixes stablecoin supply with company equity`,
      );
  }
  return errors;
}
