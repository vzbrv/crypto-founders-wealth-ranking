import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  evaluateProductionDatabase,
  expectedMigrationVersions,
  requiredCronJobs,
  requiredPublicViews,
} from "./production-verification.js";

const migrationsDir = fileURLToPath(
  new URL("../../../supabase/migrations", import.meta.url),
);

describe("production database verification", () => {
  const now = new Date("2026-08-09T12:00:00.000Z");
  const healthyLatestSnapshot = {
    status: "published",
    publicationAt: "2026-08-09T11:00:00.000Z",
    isImmutable: true,
    failureReason: null,
  };

  it("passes a fully configured production database", () => {
    const checks = evaluateProductionDatabase(
      {
        migrationVersions: [...expectedMigrationVersions],
        cronJobs: requiredCronJobs.map((name) => ({ name, active: true })),
        recentCronJobs: [...requiredCronJobs],
        publicViews: [...requiredPublicViews],
        latestSnapshot: healthyLatestSnapshot,
        anonReadContract: { ok: true },
      },
      now,
    );

    expect(checks.every(({ passed }) => passed)).toBe(true);
  });

  it("reports missing, inactive, and stale infrastructure", () => {
    const checks = evaluateProductionDatabase(
      {
        migrationVersions: expectedMigrationVersions.slice(0, -1),
        cronJobs: requiredCronJobs.map((name, index) => ({
          name,
          active: index !== 0,
        })),
        recentCronJobs: requiredCronJobs.slice(0, -1),
        publicViews: requiredPublicViews.slice(0, -1),
        latestSnapshot: healthyLatestSnapshot,
        anonReadContract: { ok: true },
      },
      now,
    );

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "expected-migrations", passed: false }),
        expect.objectContaining({ name: "active-cron-jobs", passed: false }),
        expect.objectContaining({
          name: "recent-cron-executions",
          passed: false,
        }),
        expect.objectContaining({
          name: "required-public-views",
          passed: false,
        }),
      ]),
    );
  });

  it("fails when anon/authenticated regain unexpected table access", () => {
    const checks = evaluateProductionDatabase(
      {
        migrationVersions: [...expectedMigrationVersions],
        cronJobs: requiredCronJobs.map((name) => ({ name, active: true })),
        recentCronJobs: [...requiredCronJobs],
        publicViews: [...requiredPublicViews],
        latestSnapshot: healthyLatestSnapshot,
        anonReadContract: {
          ok: false,
          error: "anon can select wallet_balance_observations; ",
        },
      },
      now,
    );

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "anon-read-contract",
          passed: false,
        }),
      ]),
    );
  });

  it.each([
    {
      name: "latest attempt failed",
      latestSnapshot: {
        ...healthyLatestSnapshot,
        status: "failed",
        failureReason: "missing market input",
      },
    },
    {
      name: "latest snapshot is mutable",
      latestSnapshot: { ...healthyLatestSnapshot, isImmutable: false },
    },
    {
      name: "latest snapshot is stale",
      latestSnapshot: {
        ...healthyLatestSnapshot,
        publicationAt: "2026-08-09T09:59:59.999Z",
      },
    },
    { name: "latest snapshot is missing", latestSnapshot: null },
  ])("fails when $name", ({ latestSnapshot }) => {
    const checks = evaluateProductionDatabase(
      {
        migrationVersions: [...expectedMigrationVersions],
        cronJobs: requiredCronJobs.map((name) => ({ name, active: true })),
        recentCronJobs: [...requiredCronJobs],
        publicViews: [...requiredPublicViews],
        latestSnapshot,
        anonReadContract: { ok: true },
      },
      now,
    );

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "latest-snapshot-publication",
          passed: false,
        }),
      ]),
    );
  });

  it("expectedMigrationVersions matches every migration file on disk", () => {
    // This is the guardrail against the exact drift that happened before:
    // expectedMigrationVersions was hand-maintained and silently fell 16
    // migrations behind supabase/migrations, so production verification
    // never checked whether those migrations had actually been applied.
    // Any new migration file added without updating the list above now
    // fails this test instead of failing silently in production.
    const versionsOnDisk = readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.match(/^(\d+)_/)?.[1])
      .filter((version): version is string => version !== undefined)
      .sort();

    expect([...expectedMigrationVersions].sort()).toEqual(versionsOnDisk);
  });

  it("keeps migration SQL files directly under the canonical directory", () => {
    const nestedDirectories = readdirSync(migrationsDir, {
      withFileTypes: true,
    }).filter((entry) => entry.isDirectory());

    expect(nestedDirectories).toEqual([]);
  });

  it("expects the current hourly snapshot scheduler", () => {
    expect(requiredCronJobs).toContain("hourly-ranking-snapshot");
    expect(requiredCronJobs).not.toContain("calculate-rankings");
  });
});
