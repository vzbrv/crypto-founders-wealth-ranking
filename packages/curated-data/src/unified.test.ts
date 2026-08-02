import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildUnifiedRanking,
  calculateUnifiedEntry,
  loadUnifiedData,
  validateUnifiedDataset,
} from "./unified.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../",
);

describe("unified ranking dataset", () => {
  it("validates exactly twenty supported, ordered entries", async () => {
    const dataset = await loadUnifiedData(
      path.join(repositoryRoot, "data/research"),
    );
    expect(validateUnifiedDataset(dataset)).toEqual([]);
    expect(dataset.entries).toHaveLength(20);
    expect(dataset.entries.map((entry) => entry.rank)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    );
    expect(
      dataset.entries.filter((entry) => entry.entryId === "coinbase"),
    ).toHaveLength(1);
    expect(
      buildUnifiedRanking(dataset).map((calculation) => calculation.entry.rank),
    ).toEqual(Array.from({ length: 20 }, (_, index) => index + 1));
  });

  it("reproduces Coinbase from stored share classes, ownership, and capital", async () => {
    const dataset = await loadUnifiedData(
      path.join(repositoryRoot, "data/research"),
    );
    const coinbase = dataset.entries.find(
      (entry) => entry.entryId === "coinbase",
    );
    expect(coinbase).toBeDefined();
    const calculation = calculateUnifiedEntry(coinbase!);
    expect(calculation.grossMarketValueUsd).toBe("43184827556.64");
    expect(calculation.acceptedAffiliatedOwnershipUsd).toBe("6437750293.92");
    expect(calculation.acceptedOutsideCapitalUsd).toBe("578750000.00");
    expect(calculation.provisionalValueCreatedUsd).toBe("36168327262.72");
  });

  it("keeps the two calculation tracks and unknown deductions distinct", async () => {
    const dataset = await loadUnifiedData(
      path.join(repositoryRoot, "data/research"),
    );
    for (const entry of dataset.entries) {
      expect(entry.founderTeam.trim()).not.toBe("");
      if (entry.valueType === "Public company") {
        const market = entry.market;
        expect(market.type).toBe("public");
        if (market.type !== "public") throw new Error("Expected public market");
        expect(market.shareClasses.length).toBeGreaterThan(1);
        expect(
          new Set(market.shareClasses.map((shareClass) => shareClass.className))
            .size,
        ).toBe(market.shareClasses.length);
      } else {
        expect(entry.market.type).toBe("token");
      }
      const calculation = calculateUnifiedEntry(entry);
      if (entry.outsideCapital.status === "Unknown") {
        expect(calculation.acceptedOutsideCapitalUsd).toBeNull();
        expect(calculation.formula).toContain("Unknown");
      }
    }
    expect(
      dataset.privateCandidates.every(
        (candidate) =>
          !dataset.entries.some(
            (entry) => entry.entryId === candidate.candidateId,
          ),
      ),
    ).toBe(true);
    expect(
      dataset.entries.some((entry) =>
        /USDC|stablecoin supply/i.test(entry.project),
      ),
    ).toBe(false);
  });
});
