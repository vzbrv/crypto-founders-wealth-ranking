import { readFile } from "node:fs/promises";
import path from "node:path";

import Decimal from "decimal.js";

export const COMPLETENESS_STATUSES = [
  "Complete",
  "Partial",
  "Missing",
  "Refresh",
] as const;
export type CompletenessStatus = (typeof COMPLETENESS_STATUSES)[number];
export type PublicationStatus = "Ready" | "Research";
export type WalletSyncStatus =
  "excluded" | "supported_unresolved" | "unsupported_unresolved";

export interface ResearchSource {
  id: string;
  category: string;
  name: string;
  date: string | null;
  url: string;
  quality: string;
  notes: string;
}

export interface ResearchCandidate {
  snapshotDate: string;
  projectId: string;
  project: string;
  ticker: string;
  foundersTeam: string;
  valuationBasis: string;
  grossValueUsd: string | null;
  knownFounderTeamExcludedUsd: string | null;
  verifiedExternalCapitalUsd: string | null;
  otherDeductionsUsd: string | null;
  provisionalOutsideWealthUsd: string | null;
  canonicalOutsideWealthUsd: string | null;
  grossScreenRank: number | null;
  canonicalRank: number | null;
  publicationStatus: PublicationStatus;
  grossStatus: CompletenessStatus;
  founderHoldingsStatus: CompletenessStatus;
  capitalStatus: CompletenessStatus;
  grossSourceId: string | null;
  holdingsSourceId: string | null;
  capitalSourceId: string | null;
  eligibilityNote: string;
  nextAction: string;
  missingEvidence: string[];
}

export interface ResearchCapitalRecord {
  projectId: string;
  amountUsd: string | null;
  status: CompletenessStatus;
  sourceId: string;
}

export interface ResearchWalletEvidence {
  snapshotDate: string;
  projectId: string;
  ownerEntity: string;
  chain: string | null;
  addressOrEntity: string | null;
  evidenceType: string | null;
  attributionStatus: string;
  confidence: string;
  inclusionDecision: string;
  snapshotHoldingsUsd: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  notes: string;
  syncStatus: WalletSyncStatus;
  circulatingSupplyOverlapVerified: false;
  mayAffectPublishedScore: false;
}

export type FundingSourceClass = "Primary" | "Reliable secondary";
export type CapitalTreatment =
  "Outside capital" | "Reviewed $0 outside funding";
export type ExcludedEvidenceDisposition =
  "Scenario only" | "Disputed" | "Excluded" | "Unknown";
export const COINGECKO_SNAPSHOT_METHOD = "coingecko_coin_history_v3" as const;

export interface ResearchMarketObservation {
  projectId: string;
  coinGeckoCoinId: string;
  circulatingMarketValueUsd: string;
  observedAt: string;
  fetchedAt: string;
  snapshotMethod: typeof COINGECKO_SNAPSHOT_METHOD;
  directSourceUrl: string;
  sourceId: string;
}

export interface ResearchProvisionalCapitalEvent {
  eventId: string;
  projectId: string;
  amountUsd: string;
  sourceId: string;
  sourceClass: FundingSourceClass;
  amountSupport: "Direct";
  treatment: CapitalTreatment;
  supportingText: string;
  notes: string;
}

export interface ResearchProvisionalExcludedEvidence {
  recordId: string;
  projectId: string;
  disposition: ExcludedEvidenceDisposition;
  sourceId: string;
  reason: string;
}

export interface ProvisionalDeduction {
  label: string;
  amountUsd: string;
  sourceIds: string[];
  sourceClass: FundingSourceClass | null;
  qualification: string;
  notes: string;
}

export interface ProvisionalConfidenceComponent {
  label: string;
  score: number;
  maxScore: number;
  detail: string;
}

export interface ProvisionalConfidence {
  score: number;
  label: "Low" | "Moderate" | "High";
  components: ProvisionalConfidenceComponent[];
}

export interface ProvisionalCalculation {
  projectId: string;
  project: string;
  foundersTeam: string;
  canonicalRank: number | null;
  circulatingMarketValueUsd: string;
  marketDataTimestamp: string;
  marketFetchTimestamp: string;
  marketCoinGeckoCoinId: string;
  marketSnapshotMethod: typeof COINGECKO_SNAPSHOT_METHOD;
  marketDirectSourceUrl: string;
  marketSourceId: string;
  affiliatedCirculatingHoldingsUsd: string | null;
  reviewedDisclosedOutsideCapitalUsd: string | null;
  provisionalOutsideHolderValueUsd: string;
  deductions: ProvisionalDeduction[];
  excludedEvidence: ResearchProvisionalExcludedEvidence[];
  confidence: ProvisionalConfidence;
  evidenceGaps: string[];
  coverageWarning: string;
}

export interface ProvisionalRankingEntry extends ProvisionalCalculation {
  provisionalRank: number;
}

export interface ResearchDataset {
  candidates: ResearchCandidate[];
  wallets: ResearchWalletEvidence[];
  capitalRecords: ResearchCapitalRecord[];
  provisionalMarketObservations: ResearchMarketObservation[];
  provisionalCapitalEvents: ResearchProvisionalCapitalEvent[];
  provisionalExcludedEvidence: ResearchProvisionalExcludedEvidence[];
  sources: ResearchSource[];
}

type CsvRow = Record<string, string>;

const candidateHeaders = [
  "snapshot_date",
  "screen_rank_gross",
  "project_id",
  "project",
  "ticker",
  "founders_team",
  "valuation_basis",
  "gross_value_usd",
  "known_founder_team_excluded_usd",
  "verified_external_capital_usd",
  "other_deductions_usd",
  "provisional_outside_wealth_usd",
  "canonical_outside_wealth_usd",
  "gross_status",
  "founder_holdings_status",
  "capital_status",
  "gross_source_id",
  "holdings_source_id",
  "capital_source_id",
  "eligibility_note",
  "next_action",
] as const;

const walletHeaders = [
  "snapshot_date",
  "project_id",
  "owner_entity",
  "chain",
  "address_or_entity",
  "evidence_type",
  "attribution_status",
  "confidence",
  "include_in_founder_deduction",
  "snapshot_holdings_usd",
  "source_id",
  "source_url",
  "notes",
] as const;

const sourceHeaders = [
  "id",
  "category",
  "name",
  "date",
  "url",
  "quality",
  "notes",
] as const;

const provisionalMarketHeaders = [
  "project_id",
  "coingecko_coin_id",
  "circulating_market_value_usd",
  "observed_at",
  "fetched_at",
  "snapshot_method",
  "direct_source_url",
  "source_id",
] as const;

const provisionalCapitalHeaders = [
  "event_id",
  "project_id",
  "amount_usd",
  "source_id",
  "source_class",
  "amount_support",
  "treatment",
  "supporting_text",
  "notes",
] as const;

const provisionalExcludedEvidenceHeaders = [
  "record_id",
  "project_id",
  "disposition",
  "source_id",
  "reason",
] as const;
function requireValue(row: CsvRow, key: string, context: string): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`${context}: missing ${key}`);
  return value;
}

function nullable(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

function money(value: string | undefined, context: string): string | null {
  const parsed = nullable(value);
  if (parsed === null) return null;
  const amount = new Decimal(parsed);
  if (!amount.isFinite() || amount.isNegative())
    throw new Error(`${context}: invalid amount ${parsed}`);
  return parsed;
}

function completeness(value: string, context: string): CompletenessStatus {
  if (!COMPLETENESS_STATUSES.includes(value as CompletenessStatus)) {
    throw new Error(`${context}: invalid completeness status ${value}`);
  }
  return value as CompletenessStatus;
}

function parseCsv(
  text: string,
  expectedHeaders: readonly string[],
  label: string,
): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((entry) => entry !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error(`${label}: unterminated quoted field`);
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((entry) => entry !== "")) rows.push(row);
  }

  const headers = rows
    .shift()
    ?.map((entry, index) =>
      index === 0 ? entry.replace(/^\uFEFF/, "") : entry,
    );
  if (!headers || headers.join("\u0000") !== expectedHeaders.join("\u0000")) {
    throw new Error(`${label}: unexpected CSV headers`);
  }
  return rows.map((values, index) => {
    if (values.length !== headers.length)
      throw new Error(`${label} row ${index + 2}: unexpected column count`);
    return Object.fromEntries(
      headers.map((header, column) => [header, values[column] ?? ""]),
    );
  });
}

export function calculateProvisionalOutsideWealth(
  gross: string | null,
  deductions: Array<string | null>,
): string | null {
  if (gross === null) return null;
  const result = deductions.reduce<Decimal>(
    (total, deduction) => (deduction === null ? total : total.minus(deduction)),
    new Decimal(gross),
  );
  return Decimal.max(0, result).toFixed(0);
}

export function calculatePublicEquityMarketCap(
  sharePriceUsd: string,
  sharesOutstanding: string,
): string {
  return new Decimal(sharePriceUsd).times(sharesOutstanding).toFixed(0);
}

function missingEvidence(
  gross: CompletenessStatus,
  holdings: CompletenessStatus,
  capital: CompletenessStatus,
  otherDeductions: string | null,
): string[] {
  const missing: string[] = [];
  if (gross !== "Complete") missing.push("complete gross-value observation");
  if (holdings !== "Complete")
    missing.push("complete founder/team circulating-holdings evidence");
  if (capital !== "Complete")
    missing.push("complete verified primary-capital history");
  if (otherDeductions === null)
    missing.push("resolved other documented deductions");
  return missing;
}

function assertUnique(values: string[], label: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0)
    throw new Error(
      `${label}: duplicate ${[...new Set(duplicates)].join(", ")}`,
    );
}

function parseSources(csv: string): ResearchSource[] {
  const sources = parseCsv(csv, sourceHeaders, "source_catalog.csv").map(
    (row, index) => {
      const context = `source_catalog.csv row ${index + 2}`;
      const url = requireValue(row, "url", context);
      new URL(url);
      return {
        id: requireValue(row, "id", context),
        category: requireValue(row, "category", context),
        name: requireValue(row, "name", context),
        date: nullable(row.date),
        url,
        quality: requireValue(row, "quality", context),
        notes: row.notes?.trim() ?? "",
      };
    },
  );
  assertUnique(
    sources.map((source) => source.id),
    "source_catalog.csv",
  );
  return sources;
}

function parseCandidates(
  csv: string,
  sourceIds: Set<string>,
): ResearchCandidate[] {
  const candidates: ResearchCandidate[] = parseCsv(
    csv,
    candidateHeaders,
    "candidate_universe.csv",
  ).map((row, index): ResearchCandidate => {
    const context = `candidate_universe.csv row ${index + 2}`;
    const projectId = requireValue(row, "project_id", context);
    const grossValueUsd = money(row.gross_value_usd, context);
    const knownFounderTeamExcludedUsd = money(
      row.known_founder_team_excluded_usd,
      context,
    );
    const verifiedExternalCapitalUsd = money(
      row.verified_external_capital_usd,
      context,
    );
    const otherDeductionsUsd = money(row.other_deductions_usd, context);
    const grossStatus = completeness(
      requireValue(row, "gross_status", context),
      context,
    );
    const founderHoldingsStatus = completeness(
      requireValue(row, "founder_holdings_status", context),
      context,
    );
    const capitalStatus = completeness(
      requireValue(row, "capital_status", context),
      context,
    );
    const grossSourceId = nullable(row.gross_source_id);
    const holdingsSourceId = nullable(row.holdings_source_id);
    const capitalSourceId = nullable(row.capital_source_id);
    const sourceRefs = [
      grossSourceId,
      holdingsSourceId,
      capitalSourceId,
    ].filter((sourceId): sourceId is string => sourceId !== null);
    for (const sourceId of sourceRefs) {
      if (!sourceIds.has(sourceId))
        throw new Error(`${context}: unknown source ${sourceId}`);
    }

    const provisionalOutsideWealthUsd = calculateProvisionalOutsideWealth(
      grossValueUsd,
      [
        knownFounderTeamExcludedUsd,
        verifiedExternalCapitalUsd,
        otherDeductionsUsd,
      ],
    );
    const importedProvisional = money(
      row.provisional_outside_wealth_usd,
      context,
    );
    if (provisionalOutsideWealthUsd !== importedProvisional) {
      throw new Error(`${context}: provisional formula mismatch`);
    }

    const ready =
      grossStatus === "Complete" &&
      founderHoldingsStatus === "Complete" &&
      capitalStatus === "Complete" &&
      grossValueUsd !== null &&
      knownFounderTeamExcludedUsd !== null &&
      verifiedExternalCapitalUsd !== null &&
      otherDeductionsUsd !== null;
    const canonicalOutsideWealthUsd = ready
      ? provisionalOutsideWealthUsd
      : null;
    const importedCanonical = money(row.canonical_outside_wealth_usd, context);
    if (canonicalOutsideWealthUsd !== importedCanonical) {
      throw new Error(`${context}: canonical publication gate mismatch`);
    }

    return {
      snapshotDate: requireValue(row, "snapshot_date", context),
      projectId,
      project: requireValue(row, "project", context),
      ticker: requireValue(row, "ticker", context),
      foundersTeam: requireValue(row, "founders_team", context),
      valuationBasis: requireValue(row, "valuation_basis", context),
      grossValueUsd,
      knownFounderTeamExcludedUsd,
      verifiedExternalCapitalUsd,
      otherDeductionsUsd,
      provisionalOutsideWealthUsd,
      canonicalOutsideWealthUsd,
      grossScreenRank: null,
      canonicalRank: null,
      publicationStatus: ready ? "Ready" : "Research",
      grossStatus,
      founderHoldingsStatus,
      capitalStatus,
      grossSourceId,
      holdingsSourceId,
      capitalSourceId,
      eligibilityNote: row.eligibility_note?.trim() ?? "",
      nextAction: row.next_action?.trim() ?? "",
      missingEvidence: missingEvidence(
        grossStatus,
        founderHoldingsStatus,
        capitalStatus,
        otherDeductionsUsd,
      ),
    };
  });
  assertUnique(
    candidates.map((candidate) => candidate.projectId),
    "candidate_universe.csv",
  );

  const grossOrder = [...candidates]
    .filter((candidate) => candidate.grossValueUsd !== null)
    .sort((left, right) => {
      if (left.grossValueUsd === null || right.grossValueUsd === null) return 0;
      const valueOrder = new Decimal(right.grossValueUsd).cmp(
        left.grossValueUsd,
      );
      return valueOrder === 0
        ? left.projectId.localeCompare(right.projectId)
        : valueOrder;
    });
  grossOrder.forEach((candidate, index) => {
    candidate.grossScreenRank = index + 1;
  });
  const canonicalOrder = [...candidates]
    .filter((candidate) => candidate.canonicalOutsideWealthUsd !== null)
    .sort((left, right) => {
      if (
        left.canonicalOutsideWealthUsd === null ||
        right.canonicalOutsideWealthUsd === null
      ) {
        return 0;
      }
      const valueOrder = new Decimal(right.canonicalOutsideWealthUsd).cmp(
        left.canonicalOutsideWealthUsd,
      );
      return valueOrder === 0
        ? left.projectId.localeCompare(right.projectId)
        : valueOrder;
    });
  canonicalOrder.forEach((candidate, index) => {
    candidate.canonicalRank = index + 1;
  });
  return candidates.sort(
    (left, right) =>
      (left.grossScreenRank ?? Infinity) - (right.grossScreenRank ?? Infinity),
  );
}

function isSupportedExactAddress(chain: string, address: string): boolean {
  if (chain === "ethereum") return /^0x[a-fA-F0-9]{40}$/.test(address);
  if (chain === "solana") return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  return false;
}

function walletSyncStatus(row: CsvRow): WalletSyncStatus {
  const inclusion =
    row.include_in_founder_deduction?.trim().toLowerCase() ?? "";
  const attribution = row.attribution_status?.trim().toLowerCase() ?? "";
  const confidence = row.confidence?.trim().toLowerCase() ?? "";
  const chain = row.chain?.trim().toLowerCase() ?? "";
  const address = row.address_or_entity?.trim() ?? "";
  const ineligible =
    inclusion.startsWith("no") ||
    confidence.includes("low") ||
    attribution.includes("unconfirmed") ||
    attribution.includes("not identified");
  if (ineligible) return "excluded";
  return isSupportedExactAddress(chain, address)
    ? "supported_unresolved"
    : "unsupported_unresolved";
}

function parseWallets(
  csv: string,
  projectIds: Set<string>,
  sourceIds: Set<string>,
): ResearchWalletEvidence[] {
  const wallets = parseCsv(csv, walletHeaders, "wallet_evidence.csv").map(
    (row, index) => {
      const context = `wallet_evidence.csv row ${index + 2}`;
      const projectId = requireValue(row, "project_id", context);
      if (!projectIds.has(projectId))
        throw new Error(`${context}: unknown project ${projectId}`);
      const sourceId = nullable(row.source_id);
      if (sourceId !== null && !sourceIds.has(sourceId))
        throw new Error(`${context}: unknown source ${sourceId}`);
      const sourceUrl = nullable(row.source_url);
      if (sourceUrl !== null) new URL(sourceUrl);
      return {
        snapshotDate: requireValue(row, "snapshot_date", context),
        projectId,
        ownerEntity: requireValue(row, "owner_entity", context),
        chain: nullable(row.chain),
        addressOrEntity: nullable(row.address_or_entity),
        evidenceType: nullable(row.evidence_type),
        attributionStatus: requireValue(row, "attribution_status", context),
        confidence: requireValue(row, "confidence", context),
        inclusionDecision: requireValue(
          row,
          "include_in_founder_deduction",
          context,
        ),
        snapshotHoldingsUsd: money(row.snapshot_holdings_usd, context),
        sourceId,
        sourceUrl,
        notes: row.notes?.trim() ?? "",
        syncStatus: walletSyncStatus(row),
        circulatingSupplyOverlapVerified: false,
        mayAffectPublishedScore: false,
      } satisfies ResearchWalletEvidence;
    },
  );
  assertUnique(
    wallets.map((wallet) => {
      const identity = wallet.addressOrEntity ?? wallet.ownerEntity;
      return [wallet.projectId, wallet.chain, identity]
        .map((part) => part?.trim().toLowerCase() ?? "")
        .join("|");
    }),
    "wallet_evidence.csv",
  );
  return wallets;
}

function parseMarketObservations(
  csv: string,
  projectIds: Set<string>,
  sources: Map<string, ResearchSource>,
): ResearchMarketObservation[] {
  const observations = parseCsv(
    csv,
    provisionalMarketHeaders,
    "provisional_market_data.csv",
  ).map((row, index) => {
    const context = `provisional_market_data.csv row ${index + 2}`;
    const projectId = requireValue(row, "project_id", context);
    if (!projectIds.has(projectId))
      throw new Error(`${context}: unknown project ${projectId}`);
    const sourceId = requireValue(row, "source_id", context);
    const source = sources.get(sourceId);
    if (!source) throw new Error(`${context}: unknown source ${sourceId}`);
    const observedAt = requireValue(row, "observed_at", context);
    if (Number.isNaN(Date.parse(observedAt)))
      throw new Error(`${context}: invalid observed_at ${observedAt}`);
    const fetchedAt = requireValue(row, "fetched_at", context);
    if (Number.isNaN(Date.parse(fetchedAt)))
      throw new Error(`${context}: invalid fetched_at ${fetchedAt}`);
    if (Date.parse(fetchedAt) < Date.parse(observedAt))
      throw new Error(`${context}: fetched_at precedes observed_at`);
    const coinGeckoCoinId = requireValue(row, "coingecko_coin_id", context);
    if (!/^[a-z0-9-]+$/.test(coinGeckoCoinId))
      throw new Error(`${context}: invalid CoinGecko coin ID`);
    const snapshotMethod = requireValue(row, "snapshot_method", context);
    if (snapshotMethod !== COINGECKO_SNAPSHOT_METHOD)
      throw new Error(`${context}: invalid snapshot_method ${snapshotMethod}`);
    const date = new Date(observedAt);
    const historyDate = [
      String(date.getUTCDate()).padStart(2, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      date.getUTCFullYear(),
    ].join("-");
    const expectedSourceUrl = `https://api.coingecko.com/api/v3/coins/${coinGeckoCoinId}/history?date=${historyDate}&localization=false`;
    const directSourceUrl = requireValue(row, "direct_source_url", context);
    if (directSourceUrl !== expectedSourceUrl)
      throw new Error(`${context}: direct_source_url is not reproducible`);
    if (source.category !== "Market value" || source.url !== directSourceUrl)
      throw new Error(`${context}: source catalog does not match observation`);
    return {
      projectId,
      coinGeckoCoinId,
      circulatingMarketValueUsd: requireValue(
        { value: money(row.circulating_market_value_usd, context) ?? "" },
        "value",
        context,
      ),
      observedAt,
      fetchedAt,
      snapshotMethod,
      directSourceUrl,
      sourceId,
    } satisfies ResearchMarketObservation;
  });
  assertUnique(
    observations.map((observation) => observation.projectId),
    "provisional_market_data.csv",
  );
  if (new Set(observations.map((item) => item.snapshotMethod)).size !== 1)
    throw new Error("provisional_market_data.csv: snapshot method mismatch");
  if (new Set(observations.map((item) => item.observedAt)).size !== 1)
    throw new Error(
      "provisional_market_data.csv: observation timestamp mismatch",
    );
  return observations;
}

function fundingSourceClass(
  value: string,
  context: string,
): FundingSourceClass {
  if (value === "Primary" || value === "Reliable secondary") return value;
  throw new Error(`${context}: invalid source_class ${value}`);
}

function capitalTreatment(value: string, context: string): CapitalTreatment {
  if (value === "Outside capital" || value === "Reviewed $0 outside funding")
    return value;
  throw new Error(`${context}: invalid treatment ${value}`);
}

function excludedEvidenceDisposition(
  value: string,
  context: string,
): ExcludedEvidenceDisposition {
  if (
    value === "Scenario only" ||
    value === "Disputed" ||
    value === "Excluded" ||
    value === "Unknown"
  )
    return value;
  throw new Error(`${context}: invalid disposition ${value}`);
}

function parseProvisionalCapitalEvents(
  csv: string,
  projectIds: Set<string>,
  sources: Map<string, ResearchSource>,
): ResearchProvisionalCapitalEvent[] {
  const events = parseCsv(
    csv,
    provisionalCapitalHeaders,
    "provisional_capital_events.csv",
  ).map((row, index) => {
    const context = `provisional_capital_events.csv row ${index + 2}`;
    const projectId = requireValue(row, "project_id", context);
    if (!projectIds.has(projectId))
      throw new Error(`${context}: unknown project ${projectId}`);
    const sourceId = requireValue(row, "source_id", context);
    const source = sources.get(sourceId);
    if (!source) throw new Error(`${context}: unknown source ${sourceId}`);
    if (source.category !== "Capital")
      throw new Error(`${context}: source ${sourceId} is not a capital source`);
    const amountSupport = requireValue(row, "amount_support", context);
    if (amountSupport !== "Direct")
      throw new Error(`${context}: amount_support must be Direct`);
    const amountUsd = requireValue(
      { value: money(row.amount_usd, context) ?? "" },
      "value",
      context,
    );
    const treatment = capitalTreatment(
      requireValue(row, "treatment", context),
      context,
    );
    if (
      new Decimal(amountUsd).isZero() !==
      (treatment === "Reviewed $0 outside funding")
    )
      throw new Error(
        `${context}: $0 is only valid for reviewed $0 outside funding`,
      );
    const supportingText = requireValue(row, "supporting_text", context);
    if (
      treatment === "Reviewed $0 outside funding" &&
      !/(fair launch|self-funded|no (?:VCs?|venture|outside|external) (?:capital|funding|backers?|investors?))/i.test(
        supportingText,
      )
    )
      throw new Error(
        `${context}: reviewed $0 treatment needs direct no-outside-funding evidence`,
      );
    return {
      eventId: requireValue(row, "event_id", context),
      projectId,
      amountUsd,
      sourceId,
      sourceClass: fundingSourceClass(
        requireValue(row, "source_class", context),
        context,
      ),
      amountSupport,
      treatment,
      supportingText,
      notes: row.notes?.trim() ?? "",
    } satisfies ResearchProvisionalCapitalEvent;
  });
  assertUnique(
    events.map((event) => event.eventId),
    "provisional_capital_events.csv",
  );
  assertUnique(
    events.map((event) => event.sourceId),
    "provisional_capital_events.csv accepted source",
  );
  return events;
}

function parseProvisionalExcludedEvidence(
  csv: string,
  projectIds: Set<string>,
  sources: Map<string, ResearchSource>,
): ResearchProvisionalExcludedEvidence[] {
  const records = parseCsv(
    csv,
    provisionalExcludedEvidenceHeaders,
    "provisional_excluded_evidence.csv",
  ).map((row, index) => {
    const context = `provisional_excluded_evidence.csv row ${index + 2}`;
    const projectId = requireValue(row, "project_id", context);
    if (!projectIds.has(projectId))
      throw new Error(`${context}: unknown project ${projectId}`);
    const sourceId = requireValue(row, "source_id", context);
    if (!sources.has(sourceId))
      throw new Error(`${context}: unknown source ${sourceId}`);
    return {
      recordId: requireValue(row, "record_id", context),
      projectId,
      disposition: excludedEvidenceDisposition(
        requireValue(row, "disposition", context),
        context,
      ),
      sourceId,
      reason: requireValue(row, "reason", context),
    } satisfies ResearchProvisionalExcludedEvidence;
  });
  assertUnique(
    records.map((record) => record.recordId),
    "provisional_excluded_evidence.csv",
  );
  return records;
}

function sumAmounts(amounts: string[]): string {
  return amounts
    .reduce((total, amount) => total.plus(amount), new Decimal(0))
    .toFixed(0);
}

function buildConfidence(
  market: ResearchMarketObservation,
  affiliatedCirculatingHoldingsUsd: string | null,
  reviewedDisclosedOutsideCapitalUsd: string | null,
  candidate: ResearchCandidate,
): ProvisionalConfidence {
  const components: ProvisionalConfidenceComponent[] = [
    {
      label: "Reproducible circulating market snapshot",
      score: market.directSourceUrl ? 30 : 0,
      maxScore: 30,
      detail:
        "July 30, 2026 CoinGecko observation has a reproducible source record.",
    },
    {
      label: "Verified affiliated circulating holdings",
      score: affiliatedCirculatingHoldingsUsd === null ? 0 : 25,
      maxScore: 25,
      detail:
        affiliatedCirculatingHoldingsUsd === null
          ? "Unknown: no complete attributed, circulating-supply wallet evidence."
          : "All displayed affiliated holdings are attributed and verified as circulating.",
    },
    {
      label: "Direct outside-capital evidence",
      score: reviewedDisclosedOutsideCapitalUsd === null ? 0 : 25,
      maxScore: 25,
      detail:
        reviewedDisclosedOutsideCapitalUsd === null
          ? "Unknown: no accepted direct funding or reviewed $0 evidence."
          : "Every accepted capital deduction has a direct supporting source.",
    },
    {
      label: "Coverage completeness",
      score:
        candidate.capitalStatus === "Complete" &&
        candidate.founderHoldingsStatus === "Complete"
          ? 20
          : 0,
      maxScore: 20,
      detail:
        candidate.capitalStatus === "Complete" &&
        candidate.founderHoldingsStatus === "Complete"
          ? "Funding and affiliated-holdings coverage are complete."
          : "Funding and/or affiliated-holdings coverage remains incomplete.",
    },
  ];
  const score = components.reduce(
    (total, component) => total + component.score,
    0,
  );
  return {
    score,
    label: score >= 75 ? "High" : score >= 50 ? "Moderate" : "Low",
    components,
  };
}

export function buildProvisionalCalculations(
  dataset: ResearchDataset,
): ProvisionalCalculation[] {
  const candidates = new Map(
    dataset.candidates.map((candidate) => [candidate.projectId, candidate]),
  );
  return dataset.provisionalMarketObservations.flatMap((market) => {
    const candidate = candidates.get(market.projectId);
    if (!candidate) return [];
    const wallets = dataset.wallets.filter(
      (wallet) => wallet.projectId === candidate.projectId,
    );
    const verifiedWallets = wallets.filter(
      (wallet) =>
        wallet.circulatingSupplyOverlapVerified &&
        wallet.snapshotHoldingsUsd !== null &&
        wallet.sourceId !== null,
    );
    const affiliatedCirculatingHoldingsUsd =
      wallets.length > 0 && verifiedWallets.length === wallets.length
        ? sumAmounts(
            verifiedWallets.map((wallet) => wallet.snapshotHoldingsUsd!),
          )
        : null;
    const capitalEvents = dataset.provisionalCapitalEvents.filter(
      (event) => event.projectId === candidate.projectId,
    );
    const reviewedDisclosedOutsideCapitalUsd =
      capitalEvents.length > 0
        ? sumAmounts(capitalEvents.map((event) => event.amountUsd))
        : null;
    const deductions: ProvisionalDeduction[] = [
      ...(affiliatedCirculatingHoldingsUsd === null
        ? []
        : [
            {
              label: "Verified affiliated circulating holdings",
              amountUsd: affiliatedCirculatingHoldingsUsd,
              sourceIds: verifiedWallets.flatMap((wallet) =>
                wallet.sourceId ? [wallet.sourceId] : [],
              ),
              sourceClass: null,
              qualification:
                "Included only after wallet attribution and circulating-supply overlap verification.",
              notes:
                "Wallet attribution and circulating-supply overlap were verified.",
            },
          ]),
      ...capitalEvents.map((event) => ({
        label: "Reviewed disclosed outside capital",
        amountUsd: event.amountUsd,
        sourceIds: [event.sourceId],
        sourceClass: event.sourceClass,
        qualification:
          event.treatment === "Reviewed $0 outside funding"
            ? "Included as $0 only because the linked source directly supports the reviewed fair-launch or self-funded/no-external-capital treatment."
            : "Included because the linked source directly states the funding amount and event.",
        notes: event.notes,
      })),
    ];
    const excludedEvidence = dataset.provisionalExcludedEvidence.filter(
      (record) => record.projectId === candidate.projectId,
    );
    const evidenceGaps = [
      ...(affiliatedCirculatingHoldingsUsd === null
        ? [
            "Affiliated circulating holdings: Unknown — no wallet attribution and circulating-supply overlap is verified.",
          ]
        : []),
      ...(reviewedDisclosedOutsideCapitalUsd === null
        ? [
            "Reviewed disclosed outside capital: Unknown — no reviewed funding event is supported; this is not a $0 deduction.",
          ]
        : candidate.capitalStatus !== "Complete"
          ? [
              "Reviewed disclosed outside capital coverage is incomplete; only known reviewed events were deducted.",
            ]
          : []),
    ];
    const provisionalOutsideHolderValueUsd = calculateProvisionalOutsideWealth(
      market.circulatingMarketValueUsd,
      [affiliatedCirculatingHoldingsUsd, reviewedDisclosedOutsideCapitalUsd],
    );
    if (provisionalOutsideHolderValueUsd === null)
      throw new Error(
        `provisional calculation missing market value ${market.projectId}`,
      );
    return [
      {
        projectId: candidate.projectId,
        project: candidate.project,
        foundersTeam: candidate.foundersTeam,
        canonicalRank: candidate.canonicalRank,
        circulatingMarketValueUsd: market.circulatingMarketValueUsd,
        marketDataTimestamp: market.observedAt,
        marketFetchTimestamp: market.fetchedAt,
        marketCoinGeckoCoinId: market.coinGeckoCoinId,
        marketSnapshotMethod: market.snapshotMethod,
        marketDirectSourceUrl: market.directSourceUrl,
        marketSourceId: market.sourceId,
        affiliatedCirculatingHoldingsUsd,
        reviewedDisclosedOutsideCapitalUsd,
        provisionalOutsideHolderValueUsd,
        deductions,
        excludedEvidence,
        confidence: buildConfidence(
          market,
          affiliatedCirculatingHoldingsUsd,
          reviewedDisclosedOutsideCapitalUsd,
          candidate,
        ),
        evidenceGaps,
        coverageWarning:
          evidenceGaps.length > 0
            ? `Upper estimate — may be overstated. ${evidenceGaps.join(" ")}`
            : "Coverage complete for the documented deduction categories.",
      } satisfies ProvisionalCalculation,
    ];
  });
}

export function buildProvisionalRanking(
  dataset: ResearchDataset,
): ProvisionalRankingEntry[] {
  const teams = new Set<string>();
  return buildProvisionalCalculations(dataset)
    .sort((left, right) => {
      const order = new Decimal(right.provisionalOutsideHolderValueUsd).cmp(
        left.provisionalOutsideHolderValueUsd,
      );
      return order === 0
        ? left.projectId.localeCompare(right.projectId)
        : order;
    })
    .filter((entry) => {
      const team = entry.foundersTeam.trim().toLocaleLowerCase();
      if (teams.has(team)) return false;
      teams.add(team);
      return true;
    })
    .slice(0, 10)
    .map((entry, index) => ({ ...entry, provisionalRank: index + 1 }));
}

export function importResearchCsv(input: {
  candidateCsv: string;
  walletCsv: string;
  sourceCsv: string;
  provisionalMarketCsv?: string;
  provisionalCapitalCsv?: string;
  provisionalExcludedEvidenceCsv?: string;
}): ResearchDataset {
  const sources = parseSources(input.sourceCsv);
  const sourceIds = new Set(sources.map((source) => source.id));
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const candidates = parseCandidates(input.candidateCsv, sourceIds);
  const projectIds = new Set(
    candidates.map((candidate) => candidate.projectId),
  );
  const wallets = parseWallets(input.walletCsv, projectIds, sourceIds);
  const provisionalMarketObservations = input.provisionalMarketCsv
    ? parseMarketObservations(
        input.provisionalMarketCsv,
        projectIds,
        sourcesById,
      )
    : [];
  const provisionalCapitalEvents = input.provisionalCapitalCsv
    ? parseProvisionalCapitalEvents(
        input.provisionalCapitalCsv,
        projectIds,
        sourcesById,
      )
    : [];
  const provisionalExcludedEvidence = input.provisionalExcludedEvidenceCsv
    ? parseProvisionalExcludedEvidence(
        input.provisionalExcludedEvidenceCsv,
        projectIds,
        sourcesById,
      )
    : [];
  const capitalRecords = candidates.flatMap((candidate) =>
    candidate.capitalSourceId === null
      ? []
      : [
          {
            projectId: candidate.projectId,
            amountUsd: candidate.verifiedExternalCapitalUsd,
            status: candidate.capitalStatus,
            sourceId: candidate.capitalSourceId,
          } satisfies ResearchCapitalRecord,
        ],
  );
  return {
    candidates,
    wallets,
    capitalRecords,
    provisionalMarketObservations,
    provisionalCapitalEvents,
    provisionalExcludedEvidence,
    sources,
  };
}

export async function loadResearchData(
  directory = path.resolve(
    process.env.INIT_CWD ?? process.cwd(),
    "data/research",
  ),
): Promise<ResearchDataset> {
  const readOptionalCsv = async (
    filename: string,
  ): Promise<string | undefined> => {
    try {
      return await readFile(path.join(directory, filename), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  };
  const [
    candidateCsv,
    walletCsv,
    sourceCsv,
    provisionalMarketCsv,
    provisionalCapitalCsv,
    provisionalExcludedEvidenceCsv,
  ] = await Promise.all([
    readFile(path.join(directory, "candidate_universe.csv"), "utf8"),
    readFile(path.join(directory, "wallet_evidence.csv"), "utf8"),
    readFile(path.join(directory, "source_catalog.csv"), "utf8"),
    readOptionalCsv("provisional_market_data.csv"),
    readOptionalCsv("provisional_capital_events.csv"),
    readOptionalCsv("provisional_excluded_evidence.csv"),
  ]);
  return importResearchCsv({
    candidateCsv,
    walletCsv,
    sourceCsv,
    ...(provisionalMarketCsv === undefined ? {} : { provisionalMarketCsv }),
    ...(provisionalCapitalCsv === undefined ? {} : { provisionalCapitalCsv }),
    ...(provisionalExcludedEvidenceCsv === undefined
      ? {}
      : { provisionalExcludedEvidenceCsv }),
  });
}
