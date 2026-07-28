import { readFile } from "node:fs/promises";

import { loadCuratedData } from "@crypto-founders/curated-data";
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
const seedUrl = new URL("../../../supabase/seed.sql", import.meta.url);
const migrationSql = [
  await readFile(phaseThreeMigrationUrl, "utf8"),
  await readFile(phaseFourMigrationUrl, "utf8"),
  await readFile(phaseFiveMigrationUrl, "utf8"),
].join("\n");
const seedSql = await readFile(seedUrl, "utf8");

const expectedTables = [
  "assets",
  "calculation_runs",
  "founding_unit_members",
  "founding_unit_scores",
  "founding_units",
  "funding_rounds",
  "market_observations",
  "people",
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
  "public_data_freshness",
  "public_project_details",
];

const databases: PGlite[] = [];

async function createDatabase(seed = false): Promise<PGlite> {
  const database = new PGlite();
  databases.push(database);
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

afterEach(async () => {
  await Promise.all(databases.splice(0).map((database) => database.close()));
});

describe("Phase 3 database", () => {
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

  it("allows anonymous reads of active data but blocks hidden data and writes", async () => {
    const database = await createDatabase(true);
    await database.exec(`
      insert into projects (
        id, slug, name, description, project_type, calculation_category,
        status, confidence_level, methodology_notes, website_url, research_reviewed_at
      ) values
        ('91111111-1111-4111-8111-111111111111', 'hidden-project', 'Hidden', 'Hidden fixture', 'protocol', 'liquid_token', 'hidden', 'high', 'Test', 'https://example.com/hidden', now()),
        ('91111111-1111-4111-8111-111111111112', 'research-project', 'Research', 'Research fixture', 'protocol', 'liquid_token', 'research', 'high', 'Test', 'https://example.com/research', now());
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

      await expect(
        database.exec(
          `insert into provider_health (provider, status) values ('public', 'healthy')`,
        ),
      ).rejects.toThrow();
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

  function observation(priceUsd: string, observedAt: Date) {
    return {
      assetId: "33333333-3333-4333-8333-333333333333",
      coingeckoId: "synthetic-horizon-token",
      provider: "coingecko",
      observedAt: observedAt.toISOString(),
      fetchedAt: new Date().toISOString(),
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
