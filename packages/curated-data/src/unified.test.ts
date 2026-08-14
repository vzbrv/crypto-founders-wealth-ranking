import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  buildUnifiedRanking,
  calculateUnifiedEntry,
  classifyUnifiedConfidence,
  isUnifiedRankProvisional,
  loadUnifiedData,
  loadProductionUnifiedData,
  validateUnifiedDataset,
  type UnifiedEntry,
  type UnifiedMarketToken,
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

  it("loads the same reviewed unified universe from the production data directory", async () => {
    const dataset = await loadProductionUnifiedData(
      path.join(repositoryRoot, "data/production"),
    );
    expect(dataset.entries).toHaveLength(20);
    expect(dataset.snapshotDate).toBe("2026-07-30");

    const hyperliquid = dataset.entries.find(
      (entry) => entry.entryId === "hyperliquid",
    );
    expect(hyperliquid?.market).toMatchObject({
      type: "token",
      coinGeckoCoinId: "hyperliquid",
      sourceId: "CG-HYPE",
    });
    expect(dataset.sources.find((source) => source.id === "CG-HYPE")?.url).toBe(
      "https://api.coingecko.com/api/v3/coins/hyperliquid/history?date=30-07-2026&localization=false",
    );
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
    expect(calculation.acceptedAffiliatedOwnershipUsd).toBe("5101090964.64");
    expect(calculation.acceptedOutsideCapitalUsd).toBe("578750000.00");
    expect(calculation.provisionalValueCreatedUsd).toBe("37504986592.00");
  });

  it("keeps missing accepted ownership inputs null instead of treating them as zero", async () => {
    const dataset = await loadUnifiedData(
      path.join(repositoryRoot, "data/research"),
    );
    const invalidDataset = structuredClone(dataset);
    const coinbase = invalidDataset.entries.find(
      (entry) => entry.entryId === "coinbase",
    );
    if (!coinbase || coinbase.market.type !== "public") {
      throw new Error("test fixture must include public-company Coinbase");
    }
    delete coinbase.affiliatedOwnership.totalShares;

    const calculation = calculateUnifiedEntry(coinbase);
    expect(calculation.acceptedAffiliatedOwnershipUsd).toBeNull();
    expect(calculation.formula).toContain("Unknown");
    expect(calculation.provisionalValueCreatedUsd).toBe("42606077556.64");
    expect(validateUnifiedDataset(invalidDataset)).toContain(
      "coinbase accepted ownership lacks total shares",
    );
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
      dataset.entries.some((entry) =>
        /USDC|stablecoin supply/i.test(entry.project),
      ),
    ).toBe(false);
  });

  it("rejects Accepted token ownership instead of silently ignoring it", async () => {
    const dataset = await loadUnifiedData(
      path.join(repositoryRoot, "data/research"),
    );
    const token = dataset.entries.find(
      (entry): entry is UnifiedEntry & { market: UnifiedMarketToken } =>
        entry.market.type === "token",
    );
    if (!token) {
      throw new Error("test fixture must include a token entry");
    }

    const invalidDataset = {
      ...dataset,
      entries: dataset.entries.map((entry) =>
        entry.entryId === token.entryId
          ? {
              ...entry,
              affiliatedOwnership: {
                ...entry.affiliatedOwnership,
                status: "Accepted" as const,
                totalShares: "1",
                sourceId: token.market.sourceId,
              },
            }
          : entry,
      ),
    };

    expect(validateUnifiedDataset(invalidDataset)).toContain(
      `${token.entryId} Accepted token ownership requires a calculable token supply/price model`,
    );
    expect(() =>
      calculateUnifiedEntry(
        invalidDataset.entries.find(
          (entry) => entry.entryId === token.entryId,
        )!,
      ),
    ).toThrow(
      "Accepted token ownership requires a calculable token supply/price model",
    );
  });

  it("requires rank-invariant reviewed bounds for an upper estimate to be High", async () => {
    const dataset = await loadUnifiedData(
      path.join(repositoryRoot, "data/research"),
    );
    const coinbase = dataset.entries.find(
      (entry) => entry.entryId === "coinbase",
    );
    if (!coinbase) throw new Error("test fixture must include Coinbase");

    expect(classifyUnifiedConfidence(95, true)).toBe("Medium");
    const invalidDataset = {
      ...dataset,
      entries: dataset.entries.map((entry) =>
        entry.entryId === "coinbase"
          ? { ...entry, upperEstimate: true }
          : entry,
      ),
    };
    expect(validateUnifiedDataset(invalidDataset)).toContain(
      "coinbase confidence label does not match score and upper-estimate state",
    );
    const invalidCoinbase = invalidDataset.entries.find(
      (entry) => entry.entryId === "coinbase",
    );
    if (!invalidCoinbase) throw new Error("test fixture must include Coinbase");
    expect(
      isUnifiedRankProvisional(calculateUnifiedEntry(invalidCoinbase)),
    ).toBe(true);

    const boundedDataset = {
      ...dataset,
      entries: dataset.entries.map((entry) =>
        entry.entryId === "coinbase"
          ? {
              ...entry,
              upperEstimate: true,
              uncertaintyReview: {
                evidenceState: "not_publicly_verifiable" as const,
                lowerValueCreatedUsd: "35000000000",
                upperValueCreatedUsd: "40000000000",
                bestRank: 6,
                worstRank: 6,
                independentlyReviewed: true,
                contradictionFree: true,
                deduplicated: true,
                sourceIds: ["COIN-PROXY-2026"],
                notes: "Test-only bounded review.",
              },
            }
          : entry,
      ),
    };
    const boundedCoinbase = boundedDataset.entries.find(
      (entry) => entry.entryId === "coinbase",
    )!;
    expect(
      classifyUnifiedConfidence(
        boundedCoinbase.confidence.score,
        true,
        boundedCoinbase.uncertaintyReview,
        boundedCoinbase.rank,
      ),
    ).toBe("High");
    expect(validateUnifiedDataset(boundedDataset)).not.toContain(
      "coinbase confidence label does not match score and upper-estimate state",
    );
    expect(
      isUnifiedRankProvisional(calculateUnifiedEntry(boundedCoinbase)),
    ).toBe(false);

    const overstatedDataset = structuredClone(boundedDataset);
    const overstatedCoinbase = overstatedDataset.entries.find(
      (entry) => entry.entryId === "coinbase",
    )!;
    overstatedCoinbase.uncertaintyReview!.upperValueCreatedUsd = "100000000000";
    expect(validateUnifiedDataset(overstatedDataset)).toContain(
      "coinbase uncertainty ranks do not reproduce from bounds",
    );
  });
});
