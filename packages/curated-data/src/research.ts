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

export interface ResearchMarketObservation {
  projectId: string;
  circulatingMarketValueUsd: string;
  observedAt: string;
  sourceId: string;
}

export interface ResearchProvisionalCapitalEvent {
  eventId: string;
  projectId: string;
  amountUsd: string;
  sourceId: string;
  sourceClass: FundingSourceClass;
  notes: string;
}

export interface ProvisionalDeduction {
  label: string;
  amountUsd: string;
  sourceIds: string[];
  sourceClass: FundingSourceClass | null;
  notes: string;
}

export interface ProvisionalCalculation {
  projectId: string;
  project: string;
  foundersTeam: string;
  canonicalRank: number | null;
  circulatingMarketValueUsd: string;
  marketDataTimestamp: string;
  marketSourceId: string;
  affiliatedCirculatingHoldingsUsd: string | null;
  reviewedDisclosedOutsideCapitalUsd: string | null;
  provisionalOutsideHolderValueUsd: string;
  deductions: ProvisionalDeduction[];
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
  "circulating_market_value_usd",
  "observed_at",
  "source_id",
] as const;

const provisionalCapitalHeaders = [
  "event_id",
  "project_id",
  "amount_usd",
  "source_id",
  "source_class",
  "notes",
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
      const valueOrder = new Decimal(right.grossValueUsd ?? 0).cmp(
        left.grossValueUsd ?? 0,
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
      const valueOrder = new Decimal(right.canonicalOutsideWealthUsd ?? 0).cmp(
        left.canonicalOutsideWealthUsd ?? 0,
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
  sourceIds: Set<string>,
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
    if (!sourceIds.has(sourceId))
      throw new Error(`${context}: unknown source ${sourceId}`);
    const observedAt = requireValue(row, "observed_at", context);
    if (Number.isNaN(Date.parse(observedAt)))
      throw new Error(`${context}: invalid observed_at ${observedAt}`);
    return {
      projectId,
      circulatingMarketValueUsd: requireValue(
        { value: money(row.circulating_market_value_usd, context) ?? "" },
        "value",
        context,
      ),
      observedAt,
      sourceId,
    } satisfies ResearchMarketObservation;
  });
  assertUnique(
    observations.map((observation) => observation.projectId),
    "provisional_market_data.csv",
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

function parseProvisionalCapitalEvents(
  csv: string,
  projectIds: Set<string>,
  sourceIds: Set<string>,
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
    if (!sourceIds.has(sourceId))
      throw new Error(`${context}: unknown source ${sourceId}`);
    return {
      eventId: requireValue(row, "event_id", context),
      projectId,
      amountUsd: requireValue(
        { value: money(row.amount_usd, context) ?? "" },
        "value",
        context,
      ),
      sourceId,
      sourceClass: fundingSourceClass(
        requireValue(row, "source_class", context),
        context,
      ),
      notes: row.notes?.trim() ?? "",
    } satisfies ResearchProvisionalCapitalEvent;
  });
  assertUnique(
    events.map((event) => event.eventId),
    "provisional_capital_events.csv",
  );
  return events;
}

function sumAmounts(amounts: string[]): string {
  return amounts
    .reduce((total, amount) => total.plus(amount), new Decimal(0))
    .toFixed(0);
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
              notes:
                "Wallet attribution and circulating-supply overlap were verified.",
            },
          ]),
      ...capitalEvents.map((event) => ({
        label: "Reviewed disclosed outside capital",
        amountUsd: event.amountUsd,
        sourceIds: [event.sourceId],
        sourceClass: event.sourceClass,
        notes: event.notes,
      })),
    ];
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
        marketSourceId: market.sourceId,
        affiliatedCirculatingHoldingsUsd,
        reviewedDisclosedOutsideCapitalUsd,
        provisionalOutsideHolderValueUsd,
        deductions,
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
}): ResearchDataset {
  const sources = parseSources(input.sourceCsv);
  const sourceIds = new Set(sources.map((source) => source.id));
  const candidates = parseCandidates(input.candidateCsv, sourceIds);
  const projectIds = new Set(
    candidates.map((candidate) => candidate.projectId),
  );
  const wallets = parseWallets(input.walletCsv, projectIds, sourceIds);
  const provisionalMarketObservations = input.provisionalMarketCsv
    ? parseMarketObservations(input.provisionalMarketCsv, projectIds, sourceIds)
    : [];
  const provisionalCapitalEvents = input.provisionalCapitalCsv
    ? parseProvisionalCapitalEvents(
        input.provisionalCapitalCsv,
        projectIds,
        sourceIds,
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
  ] = await Promise.all([
    readFile(path.join(directory, "candidate_universe.csv"), "utf8"),
    readFile(path.join(directory, "wallet_evidence.csv"), "utf8"),
    readFile(path.join(directory, "source_catalog.csv"), "utf8"),
    readOptionalCsv("provisional_market_data.csv"),
    readOptionalCsv("provisional_capital_events.csv"),
  ]);
  return importResearchCsv({
    candidateCsv,
    walletCsv,
    sourceCsv,
    ...(provisionalMarketCsv === undefined ? {} : { provisionalMarketCsv }),
    ...(provisionalCapitalCsv === undefined ? {} : { provisionalCapitalCsv }),
  });
}
