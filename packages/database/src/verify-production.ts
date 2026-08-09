import { appendFile } from "node:fs/promises";

import postgres from "postgres";

import {
  evaluateProductionDatabase,
  requiredCronJobs,
  requiredPublicViews,
  type ProductionDatabaseCheck,
} from "./production-verification.js";

const checks: ProductionDatabaseCheck[] = [];

function record(check: ProductionDatabaseCheck): void {
  checks.push(check);
  console.log(
    `${check.passed ? "PASS" : "FAIL"} ${check.name}: ${check.status}`,
  );
}

async function writeSummary(): Promise<void> {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const rows = checks
    .map(
      ({ name, passed, status }) =>
        `| ${passed ? "Pass" : "Fail"} | ${name} | ${status} |`,
    )
    .join("\n");
  await appendFile(
    summaryPath,
    `\n## Production database verification\n\n| Result | Check | Detail |\n| --- | --- | --- |\n${rows}\n`,
  );
}

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  record({
    name: "configuration-DATABASE_URL",
    passed: false,
    status:
      "Manual configuration missing: add DATABASE_URL to the protected production environment.",
  });
  await writeSummary();
  process.exit(1);
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  idle_timeout: 5,
});

try {
  const migrations = await sql<{ version: string }[]>`
    select version
    from supabase_migrations.schema_migrations
  `;
  const cronJobs = await sql<{ name: string; active: boolean }[]>`
    select jobname as name, active
    from cron.job
    where jobname in ${sql(requiredCronJobs)}
  `;
  const recentCronJobs = await sql<{ name: string }[]>`
    select distinct job.jobname as name
    from cron.job_run_details as execution
    join cron.job as job on job.jobid = execution.jobid
    where job.jobname in ${sql(requiredCronJobs)}
      and coalesce(execution.end_time, execution.start_time) >= now() - interval '24 hours'
  `;
  const publicViews = await sql<{ name: string }[]>`
    select table_name as name
    from information_schema.views
    where table_schema = 'public'
      and table_name in ${sql(requiredPublicViews)}
  `;
  const latestSnapshots = await sql<
    {
      status: string;
      publication_at: Date | null;
      is_immutable: boolean;
      failure_reason: string | null;
    }[]
  >`
    select status, publication_at, is_immutable, failure_reason
    from public.public_latest_snapshot_status
    limit 1
  `;
  const latestSnapshotRow = latestSnapshots[0];

  let anonReadContract: { ok: true } | { ok: false; error: string };
  try {
    await sql`select assert_anon_read_contract()`;
    anonReadContract = { ok: true };
  } catch (error) {
    anonReadContract = {
      ok: false,
      error: error instanceof Error ? error.message : "unknown error",
    };
  }

  for (const check of evaluateProductionDatabase({
    migrationVersions: migrations.map(({ version }) => version),
    cronJobs,
    recentCronJobs: recentCronJobs.map(({ name }) => name),
    publicViews: publicViews.map(({ name }) => name),
    latestSnapshot: latestSnapshotRow
      ? {
          status: latestSnapshotRow.status,
          publicationAt:
            latestSnapshotRow.publication_at?.toISOString() ?? null,
          isImmutable: latestSnapshotRow.is_immutable,
          failureReason: latestSnapshotRow.failure_reason,
        }
      : null,
    anonReadContract,
  })) {
    record(check);
  }
} catch {
  record({
    name: "database-connection-and-query",
    passed: false,
    status:
      "Verification could not complete. Confirm DATABASE_URL allows direct PostgreSQL access and the production migrations are applied.",
  });
} finally {
  await sql.end({ timeout: 5 });
}

await writeSummary();
if (checks.some(({ passed }) => !passed)) process.exit(1);
