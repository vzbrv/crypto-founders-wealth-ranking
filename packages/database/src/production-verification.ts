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
  "202607290013",
  "202607300014",
  "202607300015",
  "202607300016",
  "202607310017",
  "202607310018",
  "202607310019",
  "202607310020",
  "202608010021",
  "202608010022",
  "202608010023",
  "202608010024",
  "202608020001",
  "202608020002",
  "202608020025",
  "202608030026",
  "202608030027",
  "202608040001",
  "202608070001",
  "202608070002",
  "202608080001",
  "202608080003",
  "202608090001",
  "202608090002",
  "202608090003",
  "202608090004",
  "202608090005",
] as const;

export const requiredCronJobs = [
  "sync-market-data",
  "sync-wallet-balances",
  "hourly-ranking-snapshot",
  "provider-health",
] as const;

export const requiredPublicViews = [
  "public_leaderboard",
  "current_scores",
  "public_provider_status",
  "public_project_details",
  "public_latest_snapshot_status",
] as const;

export const latestSnapshotFreshnessMs = 2 * 60 * 60 * 1_000;

export interface LatestSnapshotStatus {
  status: string;
  publicationAt: string | null;
  isImmutable: boolean;
  failureReason: string | null;
}

export interface ProductionDatabaseSnapshot {
  migrationVersions: string[];
  cronJobs: Array<{ name: string; active: boolean }>;
  recentCronJobs: string[];
  publicViews: string[];
  latestSnapshot: LatestSnapshotStatus | null;
  /**
   * Result of `select assert_anon_read_contract()` against the target
   * database: `{ ok: true }` if anon/authenticated select grants match the
   * intended allowlist, or `{ ok: false, error: <message> }` if the function
   * raised (naming the offending grant) or could not be called at all.
   */
  anonReadContract: { ok: true } | { ok: false; error: string };
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
  now = new Date(),
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
    {
      name: "anon-read-contract",
      passed: snapshot.anonReadContract.ok,
      status: snapshot.anonReadContract.ok
        ? "anon/authenticated select grants match the intended allowlist"
        : `regression detected: ${snapshot.anonReadContract.error}`,
    },
    latestSnapshotCheck(snapshot.latestSnapshot, now),
  ];
}

function latestSnapshotCheck(
  snapshot: LatestSnapshotStatus | null,
  now: Date,
): ProductionDatabaseCheck {
  if (!snapshot) {
    return {
      name: "latest-snapshot-publication",
      passed: false,
      status: "no snapshot status was returned",
    };
  }

  if (snapshot.status !== "published") {
    return {
      name: "latest-snapshot-publication",
      passed: false,
      status: `latest attempt is ${snapshot.status}: ${snapshot.failureReason ?? "no failure reason recorded"}`,
    };
  }

  if (!snapshot.isImmutable) {
    return {
      name: "latest-snapshot-publication",
      passed: false,
      status: "latest published snapshot is not immutable",
    };
  }

  const publicationTime = snapshot.publicationAt
    ? Date.parse(snapshot.publicationAt)
    : Number.NaN;
  const ageMs = now.getTime() - publicationTime;
  if (
    !Number.isFinite(publicationTime) ||
    ageMs < 0 ||
    ageMs > latestSnapshotFreshnessMs
  ) {
    return {
      name: "latest-snapshot-publication",
      passed: false,
      status:
        "latest published snapshot is missing a valid publication time or is more than two hours old",
    };
  }

  return {
    name: "latest-snapshot-publication",
    passed: true,
    status:
      "latest snapshot is published, immutable, and no more than two hours old",
  };
}
