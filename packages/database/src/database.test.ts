import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  loadCuratedData,
  loadProductionCuratedData,
} from "@crypto-founders/curated-data";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it } from "vitest";

import { createCuratedImportStatements } from "./curated-import.js";

const phaseThreeMigrationUrl = new URL(
  "../../../supabase/migrations/202607270001_phase_3_database.sql",
  import.meta.url,
);
const phaseFourMigrationUrl = new URL(
  "../../../supabase/migrations/202607280002_phase_4_market_sync.sql",
  import.meta.url,
);
const phaseFiveMigrationUrl = new URL(
  "../../../supabase/migrations/202607280004_phase_5_public_ranking.sql",
  import.meta.url,
);
const phaseSixMigrationUrl = new URL(
  "../../../supabase/migrations/202607280005_phase_6_transparency.sql",
  import.meta.url,
);
const phaseSevenMigrationUrl = new URL(
  "../../../supabase/migrations/202607280006_phase_7_evm_wallet_sync.sql",
  import.meta.url,
);
const phaseEightMigrationUrl = new URL(
  "../../../supabase/migrations/202607280008_phase_8_solana_wallet_sync.sql",
  import.meta.url,
);
const phaseTenMigrationUrl = new URL(
  "../../../supabase/migrations/202607280009_phase_10_production_hardening.sql",
  import.meta.url,
);
const productionReadContractMigrationUrl = new URL(
  "../../../supabase/migrations/202607280011_production_read_contract.sql",
  import.meta.url,
);
const serviceRoleReadsMigrationUrl = new URL(
  "../../../supabase/migrations/202607290013_service_role_edge_function_reads.sql",
  import.meta.url,
);
const methodologyIntegrityMigrationUrl = new URL(
  "../../../supabase/migrations/202607300014_methodology_integrity.sql",
  import.meta.url,
);
const scalarSafeReviewEvidenceMigrationUrl = new URL(
  "../../../supabase/migrations/202607300015_scalar_safe_review_evidence.sql",
  import.meta.url,
);
const rankingPublicEvidenceMigrationUrl = new URL(
  "../../../supabase/migrations/202607300016_ranking_public_evidence.sql",
  import.meta.url,
);
const fundingReviewEligibilityMigrationUrl = new URL(
  "../../../supabase/migrations/202607310017_funding_review_eligibility.sql",
  import.meta.url,
);
const marketObservationSourcesMigrationUrl = new URL(
  "../../../supabase/migrations/202607310018_market_observation_sources.sql",
  import.meta.url,
);
const sqlConfidenceEvidenceMigrationUrl = new URL(
  "../../../supabase/migrations/202607310019_sql_confidence_evidence.sql",
  import.meta.url,
);
const seedUrl = new URL(
  "../../../supabase/tests/seed.synthetic.sql",
  import.meta.url,
);
const migrationSql = [
  await readFile(phaseThreeMigrationUrl, "utf8"),
  await readFile(phaseFourMigrationUrl, "utf8"),
  await readFile(phaseFiveMigrationUrl, "utf8"),
  await readFile(phaseSixMigrationUrl, "utf8"),
  await readFile(phaseSevenMigrationUrl, "utf8"),
  await readFile(phaseEightMigrationUrl, "utf8"),
  await readFile(phaseTenMigrationUrl, "utf8"),
  await readFile(productionReadContractMigrationUrl, "utf8"),
  await readFile(serviceRoleReadsMigrationUrl, "utf8"),
  await readFile(methodologyIntegrityMigrationUrl, "utf8"),
  await readFile(scalarSafeReviewEvidenceMigrationUrl, "utf8"),
  await readFile(rankingPublicEvidenceMigrationUrl, "utf8"),
  await readFile(fundingReviewEligibilityMigrationUrl, "utf8"),
  await readFile(marketObservationSourcesMigrationUrl, "utf8"),
  await readFile(sqlConfidenceEvidenceMigrationUrl, "utf8"),
].join("\n");
const seedSql = await readFile(seedUrl, "utf8");
const productionDataDirectory = fileURLToPath(
  new URL("../../../data/production/", import.meta.url),
);

const expectedTables = [
  "assets",
  "calculation_runs",
  "founding_unit_members",
  "founding_unit_scores",
  "founding_units",
  "funding_rounds",
  "market_observations",
  "people",
  "project_confidence_evidence",
  "project_founding_units",
  "project_scores",
  "projects",
  "provider_health",
  "record_sources",
  "source_records",
  "tracked_wallets",
  "wallet_asset_mappings",
  "wallet_balance_observations",
];

const expectedViews = [
  "current_founding_unit_scores",
  "current_leaderboard",
  "current_project_scores",
  "current_scores",
  "public_data_freshness",
  "public_leaderboard",
  "public_project_details",
  "public_provider_status",
  "public_source_claims",
  "public_wallet_evidence",
];

const databases: PGlite[] = [];

async function createDatabase(
  seed = false,
  withServiceRole = false,
): Promise<PGlite> {
  const database = new PGlite();
  databases.push(database);
  if (withServiceRole) await database.exec("create role service_role");
  await database.exec(migrationSql);
  if (seed) await database.exec(seedSql);
  return database;
}

async function importCuratedData(database: PGlite): Promise<void> {
  const statements = createCuratedImportStatements(await loadCuratedData());
  for (const statement of statements) {
    await database.query(statement.text, [...statement.values]);
  }
}

async function importProductionData(database: PGlite): Promise<void> {
  const data = await loadProductionCuratedData(productionDataDirectory);
  const statements = createCuratedImportStatements(data);
  for (const statement of statements) {
    await database.query(statement.text, [...statement.values]);
  }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("Phase 3 database", () => {
  it("keeps serialized JSON parameters text-typed before JSONB casts", async () => {
    const statements = createCuratedImportStatements(await loadCuratedData());
    const sql = statements.map(({ text }) => text).join("\n");

    expect(sql.match(/\$\d+::text::jsonb/g)).toHaveLength(5);
    expect(sql).not.toMatch(/\$\d+::jsonb/);
  });

  it("migrates an empty database with every required table and view", async () => {
    const database = await createDatabase();
    const tables = await database.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    );
    const views = await database.query<{ table_name: string }>(
      `select table_name from information_schema.views
       where table_schema = 'public'
       order by table_name`,
    );

    expect(tables.rows.map(({ table_name }) => table_name)).toEqual(
      expectedTables,
    );
    expect(views.rows.map(({ table_name }) => table_name)).toEqual(
      expectedViews,
    );
  });

  it("applies the SQL seed idempotently", async () => {
    const database = await createDatabase();
    await database.exec(seedSql);
    await database.exec(seedSql);

    const result = await database.query<{ projects: number; links: number }>(
      `select
        (select count(*)::int from projects) as projects,
        (select count(*)::int from record_sources) as links`,
    );
    expect(result.rows[0]).toEqual({ projects: 1, links: 5 });
  });

  it("imports validated curated data idempotently", async () => {
    const database = await createDatabase();
    await importCuratedData(database);
    await importCuratedData(database);

    const result = await database.query<{
      projects: number;
      units: number;
      assets: number;
      wallets: number;
      rounds: number;
    }>(`select
      (select count(*)::int from projects) as projects,
      (select count(*)::int from founding_units) as units,
      (select count(*)::int from assets) as assets,
      (select count(*)::int from tracked_wallets) as wallets,
      (select count(*)::int from funding_rounds) as rounds`);

    expect(result.rows[0]).toEqual({
      projects: 1,
      units: 1,
      assets: 1,
      wallets: 1,
      rounds: 1,
    });
  });

  it("imports reviewed production data into a clean database idempotently", async () => {
    const database = await createDatabase();
    await importProductionData(database);
    await importProductionData(database);

    const result = await database.query<{
      projects: number;
      units: number;
      assets: number;
      wallets: number;
      rounds: number;
      sources: number;
      links: number;
    }>(`select
      (select count(*)::int from projects) as projects,
      (select count(*)::int from founding_units) as units,
      (select count(*)::int from assets) as assets,
      (select count(*)::int from tracked_wallets) as wallets,
      (select count(*)::int from funding_rounds) as rounds,
      (select count(*)::int from source_records) as sources,
      (select count(*)::int from record_sources) as links`);

    expect(result.rows[0]).toEqual({
      projects: 3,
      units: 3,
      assets: 3,
      wallets: 0,
      rounds: 4,
      sources: 17,
      links: 49,
    });

    const publicRows = await database.query<{
      display_name: string;
      rank: number | null;
      score_usd: string | null;
      research_status: string;
      eligibility_status: string;
      reviewed_confidence: string;
      wallet_review_status: string;
      funding_review_status: string;
    }>(`select display_name, rank, score_usd, research_status,
      eligibility_status, reviewed_confidence, wallet_review_status,
      funding_review_status
      from public_leaderboard order by display_name`);

    expect(publicRows.rows).toEqual([
      {
        display_name: "Ethereum Founding Team",
        rank: null,
        score_usd: null,
        research_status: "Research in progress",
        eligibility_status: "research_in_progress",
        reviewed_confidence: "insufficient",
        wallet_review_status: "reviewed_insufficient",
        funding_review_status: "reviewed_insufficient",
      },
      {
        display_name: "Hayden Adams",
        rank: null,
        score_usd: null,
        research_status: "Research in progress",
        eligibility_status: "research_in_progress",
        reviewed_confidence: "insufficient",
        wallet_review_status: "reviewed_insufficient",
        funding_review_status: "reviewed_insufficient",
      },
      {
        display_name: "Solana Founding Team",
        rank: null,
        score_usd: null,
        research_status: "Research in progress",
        eligibility_status: "research_in_progress",
        reviewed_confidence: "insufficient",
        wallet_review_status: "reviewed_insufficient",
        funding_review_status: "reviewed_insufficient",
      },
    ]);
  });

  it("treats scalar review evidence as incomplete during ranking", async () => {
    const database = await createDatabase(true);

    await database.exec(`
      update projects
      set wallet_review_status = 'not_reviewed',
          wallet_review_evidence_source_ids = '"legacy-wallet-evidence"'::jsonb,
          funding_review_status = 'not_reviewed',
          funding_review_evidence_source_ids = '42'::jsonb;

      update tracked_wallets
      set review_status = 'not_reviewed',
          evidence_source_ids = 'true'::jsonb;

      update funding_rounds
      set review_status = 'not_reviewed',
          evidence_source_ids = 'null'::jsonb;
    `);

    await database.query(`select recalculate_rankings($1)`, [
      "scalar-jsonb-regression",
    ]);

    const result = await database.query<{
      eligibility_status: string;
      score_usd: string | null;
    }>(`
      select eligibility_status, score_usd::text
      from current_project_scores
    `);

    expect(result.rows).toEqual([
      {
        eligibility_status: "research_in_progress",
        score_usd: null,
      },
    ]);
  });

  it("publishes only review evidence linked to its record", async () => {
    const database = await createDatabase(true);
    const unlinkedSourceId = "47777777-7777-4777-8777-777777777777";

    await database.exec(`
      insert into source_records (
        id, title, url, publisher, source_type, accessed_at, description, status
      ) values (
        '${unlinkedSourceId}', 'Unlinked source', 'https://example.com/unlinked',
        'Unlinked Publisher', 'official_documentation', now(),
        'Must not be exposed by public evidence views', 'active'
      );

      update projects
      set wallet_review_evidence_source_ids =
            wallet_review_evidence_source_ids || '["${unlinkedSourceId}"]'::jsonb,
          funding_review_evidence_source_ids =
            funding_review_evidence_source_ids || '["${unlinkedSourceId}"]'::jsonb;

      update tracked_wallets
      set evidence_source_ids =
        evidence_source_ids || '["${unlinkedSourceId}"]'::jsonb;
    `);

    type Evidence = {
      id: string;
      title: string;
      url: string;
      publisher: string;
      sourceType: string;
    };
    const projects = await database.query<{
      eligibility_status: string;
      wallet_review_evidence: Evidence[];
      funding_review_evidence: Evidence[];
    }>(`
      select eligibility_status, wallet_review_evidence, funding_review_evidence
      from public_project_details
    `);
    const wallets = await database.query<{ review_evidence: Evidence[] }>(`
      select review_evidence from public_wallet_evidence
    `);
    const expectedEvidence = expect.objectContaining({
      id: "44444444-4444-4444-8444-444444444444",
      title: "Synthetic Horizon fixture source",
      url: "https://example.com/research/synthetic-horizon",
      publisher: "Example Research",
      sourceType: "official_documentation",
    });

    expect(projects.rows[0]?.eligibility_status).toBe("research_in_progress");
    expect(projects.rows[0]?.wallet_review_evidence).toEqual([
      expectedEvidence,
    ]);
    expect(projects.rows[0]?.funding_review_evidence).toEqual([
      expectedEvidence,
    ]);
    expect(wallets.rows[0]?.review_evidence).toEqual([expectedEvidence]);
  });

  it("enforces provider health read and write privileges", async () => {
    const database = await createDatabase(true, true);
    await database.exec(`
      insert into projects (
        id, slug, name, description, project_type, calculation_category,
        status, confidence_level, methodology_notes, website_url, research_reviewed_at
      ) values
        ('91111111-1111-4111-8111-111111111111', 'hidden-project', 'Hidden', 'Hidden fixture', 'protocol', 'liquid_token', 'hidden', 'high', 'Test', 'https://example.com/hidden', now()),
        ('91111111-1111-4111-8111-111111111112', 'research-project', 'Research', 'Research fixture', 'protocol', 'liquid_token', 'research', 'high', 'Test', 'https://example.com/research', now());

      insert into provider_health (
        provider, checked_at, status, latency_ms, error_code, error_message
      ) values (
        'synthetic-provider', now(), 'failed', 950,
        'UPSTREAM_SECRET', 'Raw upstream diagnostic'
      );
    `);

    await database.exec("set role anon");
    try {
      const projects = await database.query<{ slug: string }>(
        "select slug from projects order by slug",
      );
      const publicDetails = await database.query<{ slug: string }>(
        "select slug from public_project_details order by slug",
      );
      expect(projects.rows).toEqual([{ slug: "synthetic-horizon" }]);
      expect(publicDetails.rows).toEqual([{ slug: "synthetic-horizon" }]);

      const providerStatus = await database.query<{
        provider: string;
        status: string;
        freshness: string;
        latency_ms: number;
      }>(
        "select provider, status, freshness, latency_ms from public_provider_status",
      );
      expect(providerStatus.rows).toEqual([
        {
          provider: "synthetic-provider",
          status: "failed",
          freshness: "current",
          latency_ms: 950,
        },
      ]);

      await expect(
        database.query("select error_code, error_message from provider_health"),
      ).rejects.toThrow();

      await expect(
        database.exec(
          `insert into provider_health (provider, status) values ('public', 'healthy')`,
        ),
      ).rejects.toThrow();

      await expect(
        database.exec(
          `insert into projects (
            id, slug, name, description, project_type, calculation_category,
            status, confidence_level, methodology_notes, website_url
          ) values (
            '91111111-1111-4111-8111-111111111113', 'public-write', 'Public write',
            'Rejected anonymous write', 'protocol', 'liquid_token', 'active',
            'insufficient', 'Rejected', 'https://example.com/public-write'
          )`,
        ),
      ).rejects.toThrow();
    } finally {
      await database.exec("reset role");
    }

    await database.exec("set role service_role");
    try {
      const providerStatus = await database.query<{
        provider: string;
        status: string;
      }>("select provider, status from public_provider_status");
      expect(providerStatus.rows).toEqual([
        { provider: "synthetic-provider", status: "failed" },
      ]);
    } finally {
      await database.exec("reset role");
    }
  });

  it("stores observations and calculations while excluding research scores", async () => {
    const database = await createDatabase(true);
    await database.exec(`
      insert into market_observations (
        asset_id, provider, observed_at, price_usd, circulating_supply, market_cap_usd
      ) values (
        '33333333-3333-4333-8333-333333333333', 'synthetic-provider',
        '2026-07-28T10:00:00Z', 2, 1000000, 2000000
      );

      insert into wallet_balance_observations (
        tracked_wallet_id, asset_id, provider, observed_at, raw_balance, normalized_balance
      ) values (
        '55555555-5555-4555-8555-555555555555',
        '33333333-3333-4333-8333-333333333333', 'synthetic-provider',
        '2026-07-28T10:00:00Z', 250000000000000000000, 250
      );

      insert into projects (
        id, slug, name, description, project_type, calculation_category,
        status, confidence_level, methodology_notes, website_url, research_reviewed_at
      ) values (
        '91111111-1111-4111-8111-111111111111', 'research-project', 'Research',
        'Research fixture', 'protocol', 'liquid_token', 'research', 'medium',
        'Test', 'https://example.com/research', now()
      );
      insert into founding_units (
        id, slug, display_name, description, entity_type, status, research_reviewed_at
      ) values (
        '92222222-2222-4222-8222-222222222222', 'research-team', 'Research Team',
        'Research fixture', 'team', 'research', now()
      );
      insert into assets (
        id, project_id, asset_type, symbol, name, decimals, is_primary
      ) values (
        '93333333-3333-4333-8333-333333333333',
        '91111111-1111-4111-8111-111111111111', 'token', 'RES', 'Research Token', 18, true
      );

      insert into calculation_runs (
        id, completed_at, trigger_type, methodology_version, status
      ) values (
        '88888888-8888-4888-8888-888888888888', now(), 'test', 'phase-3', 'completed'
      );

      insert into project_scores (
        calculation_run_id, project_id, asset_id, price_usd, circulating_supply,
        market_cap_usd, outside_holder_value_usd, score_usd, confidence_label,
        market_observation_id, data_freshness, calculation_breakdown
      )
      select
        '88888888-8888-4888-8888-888888888888',
        '11111111-1111-4111-8111-111111111111',
        '33333333-3333-4333-8333-333333333333', 2, 1000000,
        2000000, 1500000, 1250000, 'high', id, '{"market":"fresh"}', '{"formula":"synthetic"}'
      from market_observations where provider = 'synthetic-provider';

      insert into project_scores (
        calculation_run_id, project_id, asset_id, score_usd, confidence_label,
        data_freshness, calculation_breakdown
      ) values (
        '88888888-8888-4888-8888-888888888888',
        '91111111-1111-4111-8111-111111111111',
        '93333333-3333-4333-8333-333333333333', 9999999, 'medium', '{}', '{}'
      );

      insert into founding_unit_scores (
        calculation_run_id, founding_unit_id, score_usd, rank, project_breakdown, confidence_label
      ) values
        ('88888888-8888-4888-8888-888888888888', '22222222-2222-4222-8222-222222222222', 1250000, 1, '[]', 'high'),
        ('88888888-8888-4888-8888-888888888888', '92222222-2222-4222-8222-222222222222', 9999999, 2, '[]', 'medium');

      insert into provider_health (provider, status, error_code, error_message)
      values ('synthetic-provider', 'failed', 'UPSTREAM_TIMEOUT', 'Synthetic failure');
    `);

    const leaderboard = await database.query<{ slug: string }>(
      "select slug from current_leaderboard order by rank",
    );
    const stored = await database.query<{
      market_observations: number;
      wallet_observations: number;
      project_scores: number;
      founding_scores: number;
      failures: number;
    }>(`select
      (select count(*)::int from market_observations) as market_observations,
      (select count(*)::int from wallet_balance_observations) as wallet_observations,
      (select count(*)::int from project_scores) as project_scores,
      (select count(*)::int from founding_unit_scores) as founding_scores,
      (select count(*)::int from provider_health where status = 'failed') as failures`);

    expect(leaderboard.rows).toEqual([{ slug: "synthetic-horizon-team" }]);
    expect(stored.rows[0]).toEqual({
      market_observations: 1,
      wallet_observations: 1,
      project_scores: 2,
      founding_scores: 2,
      failures: 1,
    });
  });
});

describe("Funding review ranking eligibility", () => {
  async function prepareRankableInputs(database: PGlite): Promise<void> {
    await database.exec(`
      insert into market_observations (
        asset_id, provider, observed_at, price_usd, circulating_supply, market_cap_usd
      ) values (
        '33333333-3333-4333-8333-333333333333', 'funding-regression',
        now() - interval '1 minute', 3, 1000000, 3000000
      );

      insert into wallet_balance_observations (
        tracked_wallet_id, asset_id, provider, observed_at, raw_balance, normalized_balance
      ) values (
        '55555555-5555-4555-8555-555555555555',
        '33333333-3333-4333-8333-333333333333', 'funding-regression',
        now() - interval '1 minute', 250000000000000000000, 250
      );
    `);
  }

  async function recalculate(database: PGlite) {
    await database.exec("select recalculate_rankings('funding-regression')");
    const result = await database.query<{
      capital_raised_usd: string | null;
      eligibility_status: "ranked" | "research_in_progress";
      rank: number | null;
    }>(`
      select
        project.capital_raised_usd::text,
        project.eligibility_status,
        unit.rank
      from current_project_scores as project
      join current_founding_unit_scores as unit
        on unit.calculation_run_id = project.calculation_run_id
      where project.project_id = '11111111-1111-4111-8111-111111111111'
        and unit.founding_unit_id = '22222222-2222-4222-8222-222222222222'
    `);
    return result.rows[0];
  }

  it("blocks an unresolved excluded event despite approved project funding", async () => {
    const database = await createDatabase(true);
    await prepareRankableInputs(database);
    await database.exec(`
      update funding_rounds
      set include_in_capital_deduction = false,
          inclusion_reason = 'Excluded pending complete review.',
          review_status = 'not_reviewed',
          reviewer = null
      where id = '66666666-6666-4666-8666-666666666666'
    `);
    const project = await database.query<{ funding_review_status: string }>(`
      select funding_review_status
      from projects
      where id = '11111111-1111-4111-8111-111111111111'
    `);

    expect(project.rows[0]?.funding_review_status).toBe("approved_sufficient");
    expect(await recalculate(database)).toEqual({
      capital_raised_usd: null,
      eligibility_status: "research_in_progress",
      rank: null,
    });
  });

  it("does not deduct a properly reviewed excluded event", async () => {
    const database = await createDatabase(true);
    await prepareRankableInputs(database);
    await database.exec(`
      update funding_rounds
      set include_in_capital_deduction = false,
          inclusion_reason = 'Reviewed and excluded from capital deduction.',
          amount_usd_at_event = null,
          amount_status = 'unknown',
          usd_conversion_method = null,
          usd_conversion_date = null
      where id = '66666666-6666-4666-8666-666666666666'
    `);

    expect(await recalculate(database)).toEqual({
      capital_raised_usd: "0.00000000",
      eligibility_status: "ranked",
      rank: 1,
    });
  });

  it("deducts a properly reviewed included event exactly once", async () => {
    const database = await createDatabase(true);
    await prepareRankableInputs(database);

    expect(await recalculate(database)).toEqual({
      capital_raised_usd: "2500000.00000000",
      eligibility_status: "ranked",
      rank: 1,
    });
  });

  it("does not deduct a duplicate funding event twice", async () => {
    const database = await createDatabase(true);
    await prepareRankableInputs(database);
    await database.exec(`
      insert into funding_rounds (
        id, project_id, event_date, round_type, original_amount, original_currency,
        amount_usd_at_event, amount_status, usd_conversion_method,
        usd_conversion_date, include_in_capital_deduction, inclusion_reason,
        status, reviewed_at, notes, deduplication_key, review_status, reviewer,
        evidence_source_ids
      )
      select
        '67676767-6767-4767-8767-676767676767', project_id, event_date,
        round_type, original_amount, original_currency, amount_usd_at_event,
        amount_status, usd_conversion_method, usd_conversion_date,
        include_in_capital_deduction, inclusion_reason, status, reviewed_at,
        notes, deduplication_key, review_status, reviewer, evidence_source_ids
      from funding_rounds
      where id = '66666666-6666-4666-8666-666666666666'
      on conflict (project_id, deduplication_key) do nothing
    `);
    const count = await database.query<{ count: number }>(`
      select count(*)::int as count
      from funding_rounds
      where project_id = '11111111-1111-4111-8111-111111111111'
    `);

    expect(count.rows[0]?.count).toBe(1);
    expect(await recalculate(database)).toEqual({
      capital_raised_usd: "2500000.00000000",
      eligibility_status: "ranked",
      rank: 1,
    });
  });

  it("keeps rank null when funding review evidence is incomplete", async () => {
    const database = await createDatabase(true);
    await prepareRankableInputs(database);
    await database.exec(`
      delete from record_sources
      where id = '70000000-0000-4000-8000-000000000005'
    `);

    expect(await recalculate(database)).toEqual({
      capital_raised_usd: null,
      eligibility_status: "research_in_progress",
      rank: null,
    });
  });
});

describe("Phase 4 market sync", () => {
  async function prepareWalletObservation(database: PGlite): Promise<void> {
    await database.exec(`
      insert into wallet_balance_observations (
        tracked_wallet_id, asset_id, provider, observed_at, raw_balance, normalized_balance
      ) values (
        '55555555-5555-4555-8555-555555555555',
        '33333333-3333-4333-8333-333333333333', 'synthetic-provider',
        now() - interval '1 minute', 250000000000000000000, 250
      )
    `);
  }

  async function ingest(
    database: PGlite,
    observations: unknown[],
    status: "healthy" | "degraded" | "failed" = "healthy",
  ) {
    return database.query<{
      accepted_count: number;
      calculation_run_id: string | null;
    }>("select * from ingest_market_sync($1::jsonb, $2::jsonb)", [
      JSON.stringify(observations),
      JSON.stringify({
        provider: "coingecko",
        status,
        checkedAt: new Date().toISOString(),
      }),
    ]);
  }

  function observation(
    priceUsd: string,
    observedAt: Date,
    options: {
      fetchedAt?: Date;
      sourceUrl?: string | null;
      sourceDescription?: string | null;
    } = {},
  ) {
    return {
      assetId: "33333333-3333-4333-8333-333333333333",
      coingeckoId: "synthetic-horizon-token",
      provider: "coingecko",
      observedAt: observedAt.toISOString(),
      fetchedAt: (options.fetchedAt ?? new Date()).toISOString(),
      sourceUrl: options.sourceUrl,
      sourceDescription: options.sourceDescription,
      priceUsd,
      circulatingSupply: "1000000",
      marketCapUsd: String(Number(priceUsd) * 1_000_000),
      rawPayload: { fixture: true },
    };
  }

  it("persists a valid batch and recalculates the ranking", async () => {
    const database = await createDatabase(true);
    await prepareWalletObservation(database);

    const result = await ingest(database, [
      observation("3", new Date(Date.now() - 60_000)),
    ]);
    const score = await database.query<{
      score_usd: string;
      run_status: string;
    }>(`
      select ps.score_usd::text, cr.status as run_status
      from current_project_scores ps
      join calculation_runs cr on cr.id = ps.calculation_run_id
    `);

    expect(result.rows[0]?.accepted_count).toBe(1);
    expect(result.rows[0]?.calculation_run_id).not.toBeNull();
    expect(score.rows).toEqual([
      { score_usd: "499437.50000000", run_status: "completed" },
    ]);
  });

  it("derives confidence and eligibility from stored SQL evidence", async () => {
    const database = await createDatabase(true);
    await prepareWalletObservation(database);
    await database.exec(`
      update projects
      set confidence_level = 'insufficient'
      where id = '11111111-1111-4111-8111-111111111111'
    `);

    await ingest(database, [observation("3", new Date(Date.now() - 60_000))]);

    const score = await database.query<{
      eligibility_status: string;
      confidence_label: string;
      confidence_score: string;
      confidence_complete: boolean;
    }>(`
      select
        eligibility_status,
        confidence_label,
        (calculation_breakdown -> 'confidence' ->> 'score') as confidence_score,
        (calculation_breakdown -> 'confidence' ->> 'complete')::boolean
          as confidence_complete
      from current_project_scores
    `);
    const evidence = await database.query<{
      component: string;
      maximum_score: string;
      score: string;
      complete: boolean;
    }>(`
      select component, maximum_score::text, score::text, complete
      from project_confidence_evidence
      order by component
    `);

    expect(score.rows).toEqual([
      {
        eligibility_status: "ranked",
        confidence_label: "high",
        confidence_score: "100",
        confidence_complete: true,
      },
    ]);
    expect(evidence.rows).toEqual([
      {
        component: "circulation_treatment",
        maximum_score: "15.00",
        score: "15.00",
        complete: true,
      },
      {
        component: "founder_identity_evidence",
        maximum_score: "20.00",
        score: "20.00",
        complete: true,
      },
      {
        component: "founder_wallet_coverage",
        maximum_score: "20.00",
        score: "20.00",
        complete: true,
      },
      {
        component: "funding_completeness",
        maximum_score: "15.00",
        score: "15.00",
        complete: true,
      },
      {
        component: "market_reliability",
        maximum_score: "15.00",
        score: "15.00",
        complete: true,
      },
      {
        component: "team_foundation_treasury_coverage",
        maximum_score: "15.00",
        score: "15.00",
        complete: true,
      },
    ]);
  });

  it("retains and publicly exposes the linked market source and timestamps", async () => {
    const database = await createDatabase(true);
    await prepareWalletObservation(database);
    const observedAt = new Date(Date.now() - 60_000);
    const fetchedAt = new Date(observedAt.getTime() + 15_000);
    const sourceUrl =
      "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=synthetic-horizon-token&precision=full";
    const sourceDescription = "CoinGecko coins markets API observation";

    await ingest(database, [
      observation("3", observedAt, {
        fetchedAt,
        sourceUrl,
        sourceDescription,
      }),
    ]);

    const result = await database.query<{
      observation_id: string;
      project_observation_id: string;
      wallet_observation_id: string;
      source_url: string;
      source_description: string;
      observed_at_matches: boolean;
      fetched_at_matches: boolean;
      project_source_url: string;
      project_source_description: string;
      project_timestamps_match: boolean;
      wallet_source_url: string;
      wallet_source_description: string;
      wallet_timestamps_match: boolean;
    }>(`
      select
        observations.id::text as observation_id,
        details.market_observation_id::text as project_observation_id,
        wallet.market_observation_id::text as wallet_observation_id,
        observations.source_url,
        observations.source_description,
        observations.observed_at = '${observedAt.toISOString()}'::timestamptz as observed_at_matches,
        observations.fetched_at = '${fetchedAt.toISOString()}'::timestamptz as fetched_at_matches,
        details.market_source_url as project_source_url,
        details.market_source_description as project_source_description,
        details.market_observed_at = observations.observed_at
          and details.market_fetched_at = observations.fetched_at as project_timestamps_match,
        wallet.market_source_url as wallet_source_url,
        wallet.market_source_description as wallet_source_description,
        wallet.market_observed_at = observations.observed_at
          and wallet.market_fetched_at = observations.fetched_at as wallet_timestamps_match
      from market_observations observations
      join public_project_details details
        on details.market_observation_id = observations.id
      join public_wallet_evidence wallet
        on wallet.market_observation_id = observations.id
    `);

    expect(result.rows).toEqual([
      {
        observation_id: result.rows[0]?.observation_id,
        project_observation_id: result.rows[0]?.observation_id,
        wallet_observation_id: result.rows[0]?.observation_id,
        source_url: sourceUrl,
        source_description: sourceDescription,
        observed_at_matches: true,
        fetched_at_matches: true,
        project_source_url: sourceUrl,
        project_source_description: sourceDescription,
        project_timestamps_match: true,
        wallet_source_url: sourceUrl,
        wallet_source_description: sourceDescription,
        wallet_timestamps_match: true,
      },
    ]);
  });

  it("preserves an explicit null market source state", async () => {
    const database = await createDatabase(true);
    await prepareWalletObservation(database);

    await ingest(database, [
      observation("3", new Date(Date.now() - 60_000), {
        sourceUrl: null,
        sourceDescription: null,
      }),
    ]);

    const result = await database.query<{
      source_url: string | null;
      source_description: string | null;
      project_source_url: string | null;
      project_source_description: string | null;
      wallet_source_url: string | null;
      wallet_source_description: string | null;
    }>(`
      select
        observations.source_url,
        observations.source_description,
        details.market_source_url as project_source_url,
        details.market_source_description as project_source_description,
        wallet.market_source_url as wallet_source_url,
        wallet.market_source_description as wallet_source_description
      from market_observations observations
      join public_project_details details
        on details.market_observation_id = observations.id
      join public_wallet_evidence wallet
        on wallet.market_observation_id = observations.id
    `);

    expect(result.rows).toEqual([
      {
        source_url: null,
        source_description: null,
        project_source_url: null,
        project_source_description: null,
        wallet_source_url: null,
        wallet_source_description: null,
      },
    ]);
  });

  it("does not overwrite valid data with invalid or stale observations", async () => {
    const database = await createDatabase(true);
    await prepareWalletObservation(database);
    const firstObservedAt = new Date(Date.now() - 60_000);
    await ingest(database, [observation("3", firstObservedAt)]);

    const invalid = observation("-1", new Date());
    invalid.marketCapUsd = "0";
    const invalidResult = await ingest(database, [invalid], "degraded");
    const staleResult = await ingest(
      database,
      [observation("4", new Date(firstObservedAt.getTime() - 1_000))],
      "degraded",
    );
    const state = await database.query<{
      observations: number;
      runs: number;
      price_usd: string;
    }>(`
      select
        (select count(*)::int from market_observations) as observations,
        (select count(*)::int from calculation_runs) as runs,
        (select price_usd::text from current_project_scores) as price_usd
    `);

    expect(invalidResult.rows[0]).toEqual({
      accepted_count: 0,
      calculation_run_id: null,
    });
    expect(staleResult.rows[0]).toEqual({
      accepted_count: 0,
      calculation_run_id: null,
    });
    expect(state.rows[0]).toEqual({
      observations: 1,
      runs: 1,
      price_usd: "3.000000000000000000",
    });
  });

  it("records provider failure while retaining the last valid score", async () => {
    const database = await createDatabase(true);
    await prepareWalletObservation(database);
    await ingest(database, [observation("3", new Date(Date.now() - 60_000))]);

    const failure = await ingest(database, [], "failed");
    const state = await database.query<{ score_usd: string; status: string }>(`
      select
        (select score_usd::text from current_project_scores) as score_usd,
        (select status from provider_health order by checked_at desc, id desc limit 1) as status
    `);

    expect(failure.rows[0]).toEqual({
      accepted_count: 0,
      calculation_run_id: null,
    });
    expect(state.rows[0]).toEqual({
      score_usd: "499437.50000000",
      status: "failed",
    });
  });
});

describe("Phase 5 public ranking", () => {
  it("publishes insufficient-confidence entries without assigning a rank", async () => {
    const database = await createDatabase(true);
    await database.exec(`
      insert into calculation_runs (
        id, completed_at, trigger_type, methodology_version, status
      ) values (
        '77777777-7777-4777-8777-777777777777', now(), 'test', 'phase-5', 'completed'
      );

      insert into founding_unit_scores (
        calculation_run_id, founding_unit_id, score_usd, rank,
        project_breakdown, confidence_label, warnings
      ) values (
        '77777777-7777-4777-8777-777777777777',
        '22222222-2222-4222-8222-222222222222', null, null,
        '[{"projectId":"11111111-1111-4111-8111-111111111111","attributionFraction":1}]',
        'insufficient', '["Required inputs are incomplete."]'
      );
    `);

    const result = await database.query<{
      confidence_label: string;
      rank: number | null;
      score_usd: string | null;
    }>(`
      select rank, score_usd::text, confidence_label
      from current_leaderboard
      where founding_unit_id = '22222222-2222-4222-8222-222222222222'
    `);

    expect(result.rows).toEqual([
      {
        confidence_label: "insufficient",
        rank: null,
        score_usd: null,
      },
    ]);
  });
});

describe("Phase 7 EVM wallet sync", () => {
  async function ingest(
    database: PGlite,
    observations: unknown[],
    status: "healthy" | "degraded" | "failed" = "healthy",
  ) {
    return database.query<{
      accepted_count: number;
      calculation_run_id: string | null;
    }>("select * from ingest_wallet_sync($1::jsonb, $2::jsonb)", [
      JSON.stringify(observations),
      JSON.stringify({
        provider: "ethereum-rpc",
        status,
        checkedAt: new Date().toISOString(),
      }),
    ]);
  }

  function observation(overrides: Record<string, unknown> = {}) {
    const observedAt = new Date(Date.now() - 60_000).toISOString();
    return {
      trackedWalletId: "55555555-5555-4555-8555-555555555555",
      assetId: "33333333-3333-4333-8333-333333333333",
      provider: "ethereum-rpc",
      blockNumber: "24000000",
      blockHash: `0x${"a".repeat(64)}`,
      observedAt,
      fetchedAt: new Date().toISOString(),
      rawBalance: "250000000000000000000",
      decimals: 18,
      normalizedBalance: "250",
      rawPayload: { balanceQueryType: "erc20" },
      ...overrides,
    };
  }

  it("stores raw units, decimals, and block identity before recalculating", async () => {
    const database = await createDatabase(true);
    await database.exec(`
      insert into market_observations (
        asset_id, provider, observed_at, price_usd, circulating_supply, market_cap_usd
      ) values (
        '33333333-3333-4333-8333-333333333333', 'synthetic-provider',
        now() - interval '1 minute', 2, 1000000, 2000000
      )
    `);

    const result = await ingest(database, [observation()]);
    const stored = await database.query<{
      raw_balance: string;
      decimals: number;
      normalized_balance: string;
      block_hash: string;
    }>(`
      select raw_balance::text, decimals, normalized_balance::text, block_hash
      from wallet_balance_observations
    `);

    expect(result.rows[0]?.accepted_count).toBe(1);
    expect(result.rows[0]?.calculation_run_id).not.toBeNull();
    expect(stored.rows).toEqual([
      {
        raw_balance: "250000000000000000000",
        decimals: 18,
        normalized_balance: "250.000000000000000000",
        block_hash: `0x${"a".repeat(64)}`,
      },
    ]);
  });

  it("records provider failure without erasing the prior valid balance", async () => {
    const database = await createDatabase(true);
    await ingest(database, [observation()]);

    const failure = await ingest(database, [], "failed");
    const state = await database.query<{
      observations: number;
      normalized_balance: string;
      status: string;
    }>(`
      select
        (select count(*)::int from wallet_balance_observations) as observations,
        (select normalized_balance::text from wallet_balance_observations) as normalized_balance,
        (select status from provider_health order by checked_at desc, id desc limit 1) as status
    `);

    expect(failure.rows[0]).toEqual({
      accepted_count: 0,
      calculation_run_id: null,
    });
    expect(state.rows[0]).toEqual({
      observations: 1,
      normalized_balance: "250.000000000000000000",
      status: "failed",
    });
  });

  it("rejects a decimals mismatch without changing stored balances", async () => {
    const database = await createDatabase(true);
    const result = await ingest(database, [
      observation({ decimals: 6, normalizedBalance: "250000000000000" }),
    ]);
    const count = await database.query<{ observations: number }>(
      "select count(*)::int as observations from wallet_balance_observations",
    );

    expect(result.rows[0]).toEqual({
      accepted_count: 0,
      calculation_run_id: null,
    });
    expect(count.rows[0]?.observations).toBe(0);
  });
});

describe("Phase 8 Solana wallet sync", () => {
  const foundingUnitId = "88888888-8888-4888-8888-888888888881";
  const projectId = "88888888-8888-4888-8888-888888888882";
  const assetId = "88888888-8888-4888-8888-888888888883";
  const walletId = "88888888-8888-4888-8888-888888888884";

  async function seedSolanaFixture(database: PGlite) {
    await database.exec(`
      insert into founding_units (
        id, slug, display_name, description, entity_type, status, research_reviewed_at
      ) values (
        '${foundingUnitId}', 'solana-team', 'Solana Team', 'Phase 8 fixture',
        'team', 'active', now()
      );

      insert into projects (
        id, slug, name, description, project_type, calculation_category, status,
        confidence_level, methodology_notes, website_url, research_reviewed_at,
        wallet_review_status, wallet_review_reviewer, wallet_review_reviewed_at,
        wallet_review_notes, wallet_review_evidence_source_ids,
        funding_review_status, funding_review_reviewer, funding_review_reviewed_at,
        funding_review_notes, funding_review_evidence_source_ids
      ) values (
        '${projectId}', 'solana-project', 'Solana Project', 'Phase 8 fixture',
        'blockchain', 'liquid_token', 'active', 'high', 'Phase 8 fixture',
        'https://example.com/solana-project', now(), 'approved_sufficient',
        'Synthetic reviewer', now(), 'Synthetic wallet review', '["synthetic-source"]',
        'approved_sufficient', 'Synthetic reviewer', now(),
        'Synthetic zero-funding review', '["synthetic-source"]'
      );

      insert into project_founding_units (
        project_id, founding_unit_id, attribution_fraction, attribution_method
      ) values ('${projectId}', '${foundingUnitId}', 1, 'team_collective');

      insert into assets (
        id, project_id, asset_type, symbol, name, decimals, chain_code,
        contract_address, is_primary, is_active
      ) values (
        '${assetId}', '${projectId}', 'native', 'SOLX', 'Solana Fixture', 9,
        'solana', null, true, true
      );

      insert into market_observations (
        asset_id, provider, observed_at, price_usd, circulating_supply, market_cap_usd
      ) values (
        '${assetId}', 'synthetic-provider', now() - interval '3 minutes',
        2, 1000000, 2000000
      );

      insert into tracked_wallets (
        id, project_id, founding_unit_id, chain_code, address, normalized_address,
        label, classification, ownership_confidence, circulating_inclusion_fraction,
        affects_score, status, research_reviewed_at,
        balance_included_in_circulating_supply, deduplication_key, review_status,
        reviewer, reviewed_at, evidence_source_ids
      ) values (
        '${walletId}', '${projectId}', '${foundingUnitId}', 'solana',
        '11111111111111111111111111111111', '11111111111111111111111111111111',
        'Solana team wallet', 'team', 'high', 1, true, 'active', now(), true,
        'solana-team-wallet', 'approved_sufficient', 'Synthetic reviewer', now(),
        '["synthetic-source"]'
      );

      insert into wallet_asset_mappings (
        tracked_wallet_id, asset_id, balance_query_type, token_identifier
      ) values ('${walletId}', '${assetId}', 'native', null);
    `);
  }

  async function ingest(
    database: PGlite,
    rawBalance: string,
    blockNumber: string,
    blockHash: string,
    observedAt: Date,
  ) {
    return database.query<{
      accepted_count: number;
      calculation_run_id: string | null;
    }>("select * from ingest_wallet_sync($1::jsonb, $2::jsonb)", [
      JSON.stringify([
        {
          trackedWalletId: walletId,
          assetId,
          provider: "solana-rpc",
          blockNumber,
          blockHash,
          observedAt: observedAt.toISOString(),
          fetchedAt: new Date(observedAt.getTime() + 10_000).toISOString(),
          rawBalance,
          decimals: 9,
          normalizedBalance: (BigInt(rawBalance) / 1_000_000_000n).toString(),
          rawPayload: { balanceQueryType: "native", commitment: "finalized" },
        },
      ]),
      JSON.stringify({
        provider: "solana-rpc",
        status: "healthy",
        checkedAt: new Date().toISOString(),
      }),
    ]);
  }

  it("stores finalized ledger identity and recalculates after balance changes", async () => {
    const database = await createDatabase();
    await seedSolanaFixture(database);
    const now = Date.now();

    const first = await ingest(
      database,
      "10000000000",
      "333000000",
      "5".repeat(44),
      new Date(now - 120_000),
    );
    const firstScore = await database.query<{ score_usd: string }>(`
      select score_usd::text
      from current_project_scores
      where project_id = '${projectId}'
    `);

    const second = await ingest(
      database,
      "20000000000",
      "333000001",
      "6".repeat(44),
      new Date(now - 60_000),
    );
    const state = await database.query<{
      provider: string;
      block_number: string;
      block_hash: string;
      raw_balance: string;
      normalized_balance: string;
    }>(`
      select provider, block_number::text, block_hash, raw_balance::text,
        normalized_balance::text
      from wallet_balance_observations
      where tracked_wallet_id = '${walletId}'
      order by block_number
    `);
    const secondScore = await database.query<{ score_usd: string }>(`
      select score_usd::text
      from current_project_scores
      where project_id = '${projectId}'
    `);

    expect(first.rows[0]?.accepted_count).toBe(1);
    expect(first.rows[0]?.calculation_run_id).not.toBeNull();
    expect(firstScore.rows[0]?.score_usd).toBe("1999980.00000000");
    expect(second.rows[0]?.accepted_count).toBe(1);
    expect(second.rows[0]?.calculation_run_id).not.toBeNull();
    expect(secondScore.rows[0]?.score_usd).toBe("1999960.00000000");
    expect(state.rows).toEqual([
      {
        provider: "solana-rpc",
        block_number: "333000000",
        block_hash: "5".repeat(44),
        raw_balance: "10000000000",
        normalized_balance: "10.000000000000000000",
      },
      {
        provider: "solana-rpc",
        block_number: "333000001",
        block_hash: "6".repeat(44),
        raw_balance: "20000000000",
        normalized_balance: "20.000000000000000000",
      },
    ]);
  });
});

describe("Phase 10 production hardening", () => {
  it("removes expired telemetry while preserving each latest observation", async () => {
    const database = await createDatabase(true);
    await database.exec(`
      insert into market_observations (
        asset_id, provider, observed_at, price_usd
      ) values
        ('33333333-3333-4333-8333-333333333333', 'retention-provider', '2026-05-01T00:00:00Z', 1),
        ('33333333-3333-4333-8333-333333333333', 'retention-provider', '2026-07-28T11:00:00Z', 2);

      insert into wallet_balance_observations (
        tracked_wallet_id, asset_id, provider, observed_at, raw_balance, normalized_balance
      ) values
        ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333',
          'retention-provider', '2026-05-01T00:00:00Z', 1000000000000000000, 1),
        ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333',
          'retention-provider', '2026-07-28T11:00:00Z', 2000000000000000000, 2);

      insert into provider_health (provider, checked_at, status) values
        ('retention-provider', '2026-05-01T00:00:00Z', 'failed'),
        ('retention-provider', '2026-07-28T11:00:00Z', 'healthy'),
        ('old-only-provider', '2026-05-01T00:00:00Z', 'degraded');
    `);

    const deleted = await database.query<{
      market: number;
      providers: number;
      wallets: number;
    }>(`
      select
        (result->>'marketObservations')::int as market,
        (result->>'walletObservations')::int as wallets,
        (result->>'providerHealth')::int as providers
      from (select run_observation_retention('2026-07-28T12:00:00Z') as result)
    `);
    const remaining = await database.query<{
      market: number;
      providers: number;
      wallets: number;
    }>(`
      select
        (select count(*)::int from market_observations where provider = 'retention-provider') as market,
        (select count(*)::int from wallet_balance_observations where provider = 'retention-provider') as wallets,
        (select count(*)::int from provider_health where provider in ('retention-provider', 'old-only-provider')) as providers
    `);

    expect(deleted.rows[0]).toEqual({ market: 1, providers: 1, wallets: 1 });
    expect(remaining.rows[0]).toEqual({ market: 1, providers: 2, wallets: 1 });
  });
});
