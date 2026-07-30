import { beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

import type { CuratedDataBundle } from "@crypto-founders/schemas";

import {
  defaultDataDirectory,
  loadCuratedData,
  loadProductionCuratedData,
  validateCuratedData,
} from "./index.js";

let validData: CuratedDataBundle;

beforeAll(async () => {
  validData = await loadCuratedData();
});

const expectInvalid = (data: CuratedDataBundle, message: string): void => {
  expect(() => validateCuratedData(data)).toThrow(message);
};

describe("curated data validation", () => {
  it("accepts the synthetic fixtures", () => {
    expect(() => validateCuratedData(validData)).not.toThrow();
  });

  it("rejects missing required fields", () => {
    const data = structuredClone(validData);
    delete (data.projects[0]! as Partial<(typeof data.projects)[number]>).name;
    expectInvalid(data, "projects.0.name");
  });

  it("rejects duplicate UUIDs across files", () => {
    const data = structuredClone(validData);
    data.sources[0]!.id = data.projects[0]!.id;
    expectInvalid(data, "Duplicate UUID");
  });

  it("rejects missing references", () => {
    const data = structuredClone(validData);
    data.wallets[0]!.assetIds[0] = "99999999-9999-4999-8999-999999999999";
    expectInvalid(data, "Missing asset");
  });

  it("rejects missing and unresolvable sources", () => {
    const missing = structuredClone(validData);
    missing.recordSources = missing.recordSources.filter(
      ({ recordType }) => recordType !== "tracked_wallet",
    );
    expectInvalid(missing, "Missing source for tracked_wallet");

    const broken = structuredClone(validData);
    broken.recordSources[0]!.sourceId = "99999999-9999-4999-8999-999999999999";
    expectInvalid(broken, "Missing source");

    const missingClaim = structuredClone(validData);
    missingClaim.recordSources = missingClaim.recordSources.filter(
      ({ recordType, field }) =>
        !(recordType === "tracked_wallet" && field === "classification"),
    );
    expectInvalid(missingClaim, "field classification");
  });

  it("rejects malformed URLs and dates", () => {
    const badUrl = structuredClone(validData);
    badUrl.projects[0]!.websiteUrl = "not-a-url";
    expectInvalid(badUrl, "Invalid URL");

    const badDate = structuredClone(validData);
    badDate.projects[0]!.launchedAt = "2025-02-30";
    expectInvalid(badDate, "Expected an ISO date");
  });

  it("rejects invalid fractions and attribution totals", () => {
    const badFraction = structuredClone(validData);
    badFraction.wallets[0]!.circulatingInclusionFraction = "1.1";
    expectInvalid(badFraction, "Expected a decimal fraction");

    const badTotal = structuredClone(validData);
    badTotal.foundingUnits.push({
      ...structuredClone(badTotal.foundingUnits[0]!),
      id: "88888888-8888-4888-8888-888888888888",
      slug: "second-synthetic-team",
      projectLinks: [
        {
          ...badTotal.foundingUnits[0]!.projectLinks[0]!,
          attributionFraction: "0.5",
        },
      ],
    });
    badTotal.recordSources.push({
      id: "70000000-0000-4000-8000-000000000006",
      sourceId: badTotal.sources[0]!.id,
      recordType: "founding_unit",
      recordId: "88888888-8888-4888-8888-888888888888",
      field: "projectLinks[0]",
      supportType: "primary",
    });
    expectInvalid(badTotal, "Attribution fractions exceed one");
  });

  it("rejects active projects without one active primary asset", () => {
    const data = structuredClone(validData);
    data.assets[0]!.isPrimary = false;
    expectInvalid(data, "must have exactly one active primary asset");
  });

  it("rejects score wallets without a circulation fraction", () => {
    const data = structuredClone(validData);
    data.wallets[0]!.circulatingInclusionFraction = null;
    expectInvalid(data, "requires a circulation fraction");
  });

  it("rejects unsupported wallet chains and invalid chain addresses", () => {
    const unsupported = structuredClone(validData);
    (unsupported.wallets[0]! as { chainCode: string }).chainCode = "dogecoin";
    expectInvalid(unsupported, "Invalid option");

    const data = structuredClone(validData);
    data.wallets[0]!.address = "0xinvalid";
    data.wallets[0]!.normalizedAddress = "0xinvalid";
    expectInvalid(data, "Invalid ethereum wallet address");
  });

  it("rejects included funding without USD-at-event", () => {
    const data = structuredClone(validData);
    delete data.fundingRounds[0]!.amountUsdAtEvent;
    expectInvalid(data, "Included funding requires amountUsdAtEvent");
  });
});

describe("production curated data", () => {
  it("requires an explicit production directory", async () => {
    await expect(loadProductionCuratedData()).rejects.toThrow(
      "CURATED_DATA_DIR must explicitly identify reviewed production data",
    );
    await expect(
      loadProductionCuratedData(defaultDataDirectory),
    ).rejects.toThrow("contains synthetic fixtures");
  });

  it("accepts the marked reviewed production directory", async () => {
    const directory = fileURLToPath(
      new URL("../../../data/production/", import.meta.url),
    );
    const data = await loadProductionCuratedData(directory);

    expect({
      projects: data.projects.length,
      foundingUnits: data.foundingUnits.length,
      assets: data.assets.length,
      wallets: data.wallets.length,
      fundingRounds: data.fundingRounds.length,
      sources: data.sources.length,
      recordSources: data.recordSources.length,
    }).toEqual({
      projects: 3,
      foundingUnits: 3,
      assets: 3,
      wallets: 0,
      fundingRounds: 4,
      sources: 17,
      recordSources: 49,
    });

    expect(JSON.stringify(data)).not.toContain("synthetic");
  });
});
