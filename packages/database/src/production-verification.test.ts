import { describe, expect, it } from "vitest";

import {
  evaluateProductionDatabase,
  expectedMigrationVersions,
  requiredCronJobs,
  requiredPublicViews,
} from "./production-verification.js";

describe("production database verification", () => {
  it("passes a fully configured production database", () => {
    const checks = evaluateProductionDatabase({
      migrationVersions: [...expectedMigrationVersions],
      cronJobs: requiredCronJobs.map((name) => ({ name, active: true })),
      recentCronJobs: [...requiredCronJobs],
      publicViews: [...requiredPublicViews],
      anonReadContract: { ok: true },
    });

    expect(checks.every(({ passed }) => passed)).toBe(true);
  });

  it("reports missing, inactive, and stale infrastructure", () => {
    const checks = evaluateProductionDatabase({
      migrationVersions: expectedMigrationVersions.slice(0, -1),
      cronJobs: requiredCronJobs.map((name, index) => ({
        name,
        active: index !== 0,
      })),
      recentCronJobs: requiredCronJobs.slice(0, -1),
      publicViews: requiredPublicViews.slice(0, -1),
      anonReadContract: { ok: true },
    });

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
    const checks = evaluateProductionDatabase({
      migrationVersions: [...expectedMigrationVersions],
      cronJobs: requiredCronJobs.map((name) => ({ name, active: true })),
      recentCronJobs: [...requiredCronJobs],
      publicViews: [...requiredPublicViews],
      anonReadContract: {
        ok: false,
        error: "anon can select wallet_balance_observations; ",
      },
    });

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "anon-read-contract",
          passed: false,
        }),
      ]),
    );
  });
});
