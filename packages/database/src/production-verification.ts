export const expectedMigrationVersions = [
  "202607270001",
  "202607280002",
  "202607280003",
  "202607280004",
  "202607280005",
  "202607280006",
  "202607280007",
  "202607280008",
  "202607280009",
  "202607280010",
  "202607280011",
  "202607280012",
] as const;

export const requiredCronJobs = [
  "sync-market-data",
  "sync-wallet-balances",
  "calculate-rankings",
  "provider-health",
] as const;

export const requiredPublicViews = [
  "public_leaderboard",
  "current_scores",
  "public_provider_status",
  "public_project_details",
] as const;

export interface ProductionDatabaseSnapshot {
  migrationVersions: string[];
  cronJobs: Array<{ name: string; active: boolean }>;
  recentCronJobs: string[];
  publicViews: string[];
}

export interface ProductionDatabaseCheck {
  name: string;
  passed: boolean;
  status: string;
}

function requiredItemsCheck(
  name: string,
  required: readonly string[],
  present: readonly string[],
): ProductionDatabaseCheck {
  const missing = required.filter((item) => !present.includes(item));
  return {
    name,
    passed: missing.length === 0,
    status:
      missing.length === 0
        ? `found all ${required.length}`
        : `missing ${missing.join(", ")}`,
  };
}

export function evaluateProductionDatabase(
  snapshot: ProductionDatabaseSnapshot,
): ProductionDatabaseCheck[] {
  const activeCronJobs = snapshot.cronJobs
    .filter(({ active }) => active)
    .map(({ name }) => name);

  return [
    requiredItemsCheck(
      "expected-migrations",
      expectedMigrationVersions,
      snapshot.migrationVersions,
    ),
    requiredItemsCheck("active-cron-jobs", requiredCronJobs, activeCronJobs),
    requiredItemsCheck(
      "recent-cron-executions",
      requiredCronJobs,
      snapshot.recentCronJobs,
    ),
    requiredItemsCheck(
      "required-public-views",
      requiredPublicViews,
      snapshot.publicViews,
    ),
  ];
}
