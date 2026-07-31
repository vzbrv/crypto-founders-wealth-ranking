import {
  bigint,
  bigserial,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const projects = pgTable("projects", {
  id: uuid().primaryKey(),
  slug: text().notNull().unique(),
  name: text().notNull(),
  symbol: text(),
  description: text().notNull(),
  projectType: text("project_type").notNull(),
  calculationCategory: text("calculation_category").notNull(),
  status: text().notNull(),
  confidenceLevel: text("confidence_level").notNull(),
  walletReviewStatus: text("wallet_review_status").notNull(),
  walletReviewReviewer: text("wallet_review_reviewer"),
  walletReviewReviewedAt: timestamp("wallet_review_reviewed_at", {
    withTimezone: true,
  }),
  walletReviewNotes: text("wallet_review_notes"),
  walletReviewEvidenceSourceIds: jsonb("wallet_review_evidence_source_ids")
    .notNull()
    .default([]),
  fundingReviewStatus: text("funding_review_status").notNull(),
  fundingReviewReviewer: text("funding_review_reviewer"),
  fundingReviewReviewedAt: timestamp("funding_review_reviewed_at", {
    withTimezone: true,
  }),
  fundingReviewNotes: text("funding_review_notes"),
  fundingReviewEvidenceSourceIds: jsonb("funding_review_evidence_source_ids")
    .notNull()
    .default([]),
  methodologyNotes: text("methodology_notes").notNull(),
  iqWikiSlug: text("iq_wiki_slug"),
  websiteUrl: text("website_url").notNull(),
  launchedAt: date("launched_at"),
  researchReviewedAt: timestamp("research_reviewed_at", {
    withTimezone: true,
  }).notNull(),
  ...timestamps,
});

export const foundingUnits = pgTable("founding_units", {
  id: uuid().primaryKey(),
  slug: text().notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text().notNull(),
  imageUrl: text("image_url"),
  iqWikiSlug: text("iq_wiki_slug"),
  entityType: text("entity_type").notNull(),
  status: text().notNull(),
  researchReviewedAt: timestamp("research_reviewed_at", {
    withTimezone: true,
  }).notNull(),
  ...timestamps,
});

export const people = pgTable("people", {
  id: uuid().primaryKey(),
  slug: text().notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text(),
  imageUrl: text("image_url"),
  iqWikiSlug: text("iq_wiki_slug"),
  status: text().notNull(),
  ...timestamps,
});

export const foundingUnitMembers = pgTable(
  "founding_unit_members",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    foundingUnitId: uuid("founding_unit_id")
      .notNull()
      .references(() => foundingUnits.id),
    personId: uuid("person_id")
      .notNull()
      .references(() => people.id),
    role: text(),
    attributionFraction: numeric("attribution_fraction", {
      precision: 20,
      scale: 18,
    }),
  },
  (table) => [unique().on(table.foundingUnitId, table.personId)],
);

export const projectFoundingUnits = pgTable(
  "project_founding_units",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    foundingUnitId: uuid("founding_unit_id")
      .notNull()
      .references(() => foundingUnits.id),
    attributionFraction: numeric("attribution_fraction", {
      precision: 20,
      scale: 18,
    }).notNull(),
    attributionMethod: text("attribution_method").notNull(),
    isCanonical: boolean("is_canonical").notNull().default(false),
    allocationMethodology: text("allocation_methodology"),
  },
  (table) => [unique().on(table.projectId, table.foundingUnitId)],
);

export const assets = pgTable("assets", {
  id: uuid().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  assetType: text("asset_type").notNull(),
  symbol: text().notNull(),
  name: text().notNull(),
  decimals: integer(),
  chainCode: text("chain_code"),
  contractAddress: text("contract_address"),
  coingeckoId: text("coingecko_id"),
  coinbaseProductId: text("coinbase_product_id"),
  binanceSymbol: text("binance_symbol"),
  dexScreenerPair: text("dex_screener_pair"),
  providerIds: jsonb("provider_ids").notNull().default({}),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const marketObservations = pgTable("market_observations", {
  id: bigserial({ mode: "number" }).primaryKey(),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  provider: text().notNull(),
  sourceUrl: text("source_url"),
  sourceDescription: text("source_description"),
  observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  priceUsd: numeric("price_usd", { precision: 38, scale: 18 }),
  circulatingSupply: numeric("circulating_supply", {
    precision: 78,
    scale: 18,
  }),
  marketCapUsd: numeric("market_cap_usd", { precision: 38, scale: 8 }),
  rawPayload: jsonb("raw_payload").notNull().default({}),
  isValid: boolean("is_valid").notNull().default(true),
  validationErrors: jsonb("validation_errors").notNull().default([]),
});

export const trackedWallets = pgTable("tracked_wallets", {
  id: uuid().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  foundingUnitId: uuid("founding_unit_id").references(() => foundingUnits.id),
  chainCode: text("chain_code").notNull(),
  address: text().notNull(),
  normalizedAddress: text("normalized_address").notNull(),
  label: text().notNull(),
  ownerName: text("owner_name"),
  classification: text().notNull(),
  ownershipConfidence: text("ownership_confidence").notNull(),
  circulatingInclusionFraction: numeric("circulating_inclusion_fraction", {
    precision: 20,
    scale: 18,
  }),
  balanceIncludedInCirculatingSupply: boolean(
    "balance_included_in_circulating_supply",
  ),
  circulatingInclusionExplanation: text("circulating_inclusion_explanation"),
  affectsScore: boolean("affects_score").notNull().default(true),
  deduplicationKey: text("deduplication_key").notNull(),
  reviewStatus: text("review_status").notNull(),
  reviewer: text(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  evidenceSourceIds: jsonb("evidence_source_ids").notNull().default([]),
  status: text().notNull(),
  researchReviewedAt: timestamp("research_reviewed_at", {
    withTimezone: true,
  }).notNull(),
  notes: text(),
  ...timestamps,
});

export const walletAssetMappings = pgTable(
  "wallet_asset_mappings",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    trackedWalletId: uuid("tracked_wallet_id")
      .notNull()
      .references(() => trackedWallets.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    balanceQueryType: text("balance_query_type").notNull(),
    tokenIdentifier: text("token_identifier"),
  },
  (table) => [unique().on(table.trackedWalletId, table.assetId)],
);

export const walletBalanceObservations = pgTable(
  "wallet_balance_observations",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    trackedWalletId: uuid("tracked_wallet_id")
      .notNull()
      .references(() => trackedWallets.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    provider: text().notNull(),
    blockNumber: bigint("block_number", { mode: "number" }),
    blockHash: text("block_hash"),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    rawBalance: numeric("raw_balance", { precision: 78, scale: 0 }).notNull(),
    decimals: integer(),
    normalizedBalance: numeric("normalized_balance", {
      precision: 78,
      scale: 18,
    }).notNull(),
    rawPayload: jsonb("raw_payload").notNull().default({}),
    isValid: boolean("is_valid").notNull().default(true),
    validationErrors: jsonb("validation_errors").notNull().default([]),
  },
);

export const fundingRounds = pgTable("funding_rounds", {
  id: uuid().primaryKey(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id),
  eventDate: date("event_date").notNull(),
  roundType: text("round_type").notNull(),
  originalAmount: numeric("original_amount", { precision: 38, scale: 18 }),
  originalCurrency: text("original_currency"),
  amountUsdAtEvent: numeric("amount_usd_at_event", { precision: 38, scale: 8 }),
  amountStatus: text("amount_status").notNull(),
  usdConversionMethod: text("usd_conversion_method"),
  usdConversionDate: date("usd_conversion_date"),
  includeInCapitalDeduction: boolean("include_in_capital_deduction")
    .notNull()
    .default(true),
  inclusionReason: text("inclusion_reason").notNull(),
  deduplicationKey: text("deduplication_key").notNull(),
  reviewStatus: text("review_status").notNull(),
  reviewer: text(),
  evidenceSourceIds: jsonb("evidence_source_ids").notNull().default([]),
  status: text().notNull(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
  notes: text(),
  ...timestamps,
});

export const sourceRecords = pgTable("source_records", {
  id: uuid().primaryKey(),
  title: text().notNull(),
  url: text().notNull(),
  publisher: text(),
  sourceType: text("source_type").notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull(),
  description: text().notNull(),
  status: text().notNull(),
  ...timestamps,
});

export const recordSources = pgTable("record_sources", {
  id: uuid().primaryKey(),
  recordType: text("record_type").notNull(),
  recordId: uuid("record_id").notNull(),
  field: text().notNull(),
  sourceRecordId: uuid("source_record_id")
    .notNull()
    .references(() => sourceRecords.id),
  supportType: text("support_type").notNull(),
  notes: text(),
});

export const calculationRuns = pgTable("calculation_runs", {
  id: uuid().defaultRandom().primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  triggerType: text("trigger_type").notNull(),
  methodologyVersion: text("methodology_version").notNull(),
  status: text().notNull(),
  errorSummary: text("error_summary"),
  metadata: jsonb().notNull().default({}),
});

export const projectScores = pgTable(
  "project_scores",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    calculationRunId: uuid("calculation_run_id")
      .notNull()
      .references(() => calculationRuns.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    assetId: uuid("asset_id")
      .notNull()
      .references(() => assets.id),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    priceUsd: numeric("price_usd", { precision: 38, scale: 18 }),
    circulatingSupply: numeric("circulating_supply", {
      precision: 78,
      scale: 18,
    }),
    marketCapUsd: numeric("market_cap_usd", { precision: 38, scale: 8 }),
    excludedSupply: numeric("excluded_supply", { precision: 78, scale: 18 }),
    excludedValueUsd: numeric("excluded_value_usd", {
      precision: 38,
      scale: 8,
    }),
    capitalRaisedUsd: numeric("capital_raised_usd", {
      precision: 38,
      scale: 8,
    }),
    outsideHolderSupply: numeric("outside_holder_supply", {
      precision: 78,
      scale: 18,
    }),
    outsideHolderValueUsd: numeric("outside_holder_value_usd", {
      precision: 38,
      scale: 8,
    }),
    scoreUsd: numeric("score_usd", { precision: 38, scale: 8 }),
    confidenceLabel: text("confidence_label").notNull(),
    marketObservationId: bigint("market_observation_id", {
      mode: "number",
    }).references(() => marketObservations.id),
    dataFreshness: jsonb("data_freshness").notNull(),
    calculationBreakdown: jsonb("calculation_breakdown").notNull(),
    warnings: jsonb().notNull().default([]),
    eligibilityStatus: text("eligibility_status").notNull().default("research"),
    ineligibilityReasons: jsonb("ineligibility_reasons").notNull().default([]),
  },
  (table) => [
    unique().on(table.calculationRunId, table.projectId, table.assetId),
  ],
);

export const foundingUnitScores = pgTable(
  "founding_unit_scores",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    calculationRunId: uuid("calculation_run_id")
      .notNull()
      .references(() => calculationRuns.id),
    foundingUnitId: uuid("founding_unit_id")
      .notNull()
      .references(() => foundingUnits.id),
    calculatedAt: timestamp("calculated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    scoreUsd: numeric("score_usd", { precision: 38, scale: 8 }),
    rank: integer(),
    previousRank: integer("previous_rank"),
    rankChange: integer("rank_change"),
    projectBreakdown: jsonb("project_breakdown").notNull(),
    confidenceLabel: text("confidence_label").notNull(),
    warnings: jsonb().notNull().default([]),
    eligibilityStatus: text("eligibility_status").notNull().default("research"),
    ineligibilityReasons: jsonb("ineligibility_reasons").notNull().default([]),
  },
  (table) => [unique().on(table.calculationRunId, table.foundingUnitId)],
);

export const providerHealth = pgTable("provider_health", {
  id: bigserial({ mode: "number" }).primaryKey(),
  provider: text().notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  status: text().notNull(),
  latencyMs: integer("latency_ms"),
  httpStatus: integer("http_status"),
  errorCode: text("error_code"),
  errorMessage: text("error_message"),
  metadata: jsonb().notNull().default({}),
});
