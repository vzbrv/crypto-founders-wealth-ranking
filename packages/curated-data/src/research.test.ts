import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  COINGECKO_SNAPSHOT_METHOD,
  buildProvisionalRanking,
  calculateProvisionalOutsideWealth,
  calculatePublicEquityMarketCap,
  importResearchCsv,
  loadResearchData,
} from "./research.js";

const researchDirectory = fileURLToPath(
  new URL("../../../data/research/", import.meta.url),
);

let candidateCsv: string;
let walletCsv: string;
let sourceCsv: string;
let provisionalMarketCsv: string;
let provisionalCapitalCsv: string;
let provisionalExcludedEvidenceCsv: string;

beforeAll(async () => {
  [
    candidateCsv,
    walletCsv,
    sourceCsv,
    provisionalMarketCsv,
    provisionalCapitalCsv,
    provisionalExcludedEvidenceCsv,
  ] = await Promise.all([
    readFile(`${researchDirectory}candidate_universe.csv`, "utf8"),
    readFile(`${researchDirectory}wallet_evidence.csv`, "utf8"),
    readFile(`${researchDirectory}source_catalog.csv`, "utf8"),
    readFile(`${researchDirectory}provisional_market_data.csv`, "utf8"),
    readFile(`${researchDirectory}provisional_capital_events.csv`, "utf8"),
    readFile(`${researchDirectory}provisional_excluded_evidence.csv`, "utf8"),
  ]);
});

const importData = (
  overrides: Partial<Parameters<typeof importResearchCsv>[0]> = {},
) =>
  importResearchCsv({
    candidateCsv,
    walletCsv,
    sourceCsv,
    provisionalMarketCsv,
    provisionalCapitalCsv,
    provisionalExcludedEvidenceCsv,
    ...overrides,
  });

describe("research dataset import", () => {
  it("imports the complete handoff with calculated publication gates and ranks", () => {
    const data = importData();

    expect(data.candidates).toHaveLength(30);
    expect(data.wallets).toHaveLength(32);
    expect(data.capitalRecords).toHaveLength(20);
    expect(data.provisionalMarketObservations).toHaveLength(25);
    expect(data.provisionalCapitalEvents).toHaveLength(19);
    expect(data.provisionalExcludedEvidence).toHaveLength(18);
    expect(data.sources).toHaveLength(150);
    expect(
      data.candidates
        .filter(({ publicationStatus }) => publicationStatus === "Ready")
        .map(({ projectId }) => projectId),
    ).toEqual([]);
    expect(
      data.candidates
        .filter(({ canonicalRank }) => canonicalRank !== null)
        .map(({ projectId, canonicalRank }) => ({ projectId, canonicalRank })),
    ).toEqual([]);
  });

  it("builds a sourced top 10 while preserving incomplete deductions", () => {
    const data = importData();
    const ranking = buildProvisionalRanking(data);

    expect(
      ranking.map(({ provisionalRank, projectId }) => ({
        provisionalRank,
        projectId,
      })),
    ).toEqual([
      { provisionalRank: 1, projectId: "bitcoin" },
      { provisionalRank: 2, projectId: "ethereum" },
      { provisionalRank: 3, projectId: "bnb" },
      { provisionalRank: 4, projectId: "xrp" },
      { provisionalRank: 5, projectId: "solana" },
      { provisionalRank: 6, projectId: "tron" },
      { provisionalRank: 7, projectId: "hyperliquid" },
      { provisionalRank: 8, projectId: "dogecoin" },
      { provisionalRank: 9, projectId: "chainlink" },
      { provisionalRank: 10, projectId: "cardano" },
    ]);
    expect(ranking[0]).toMatchObject({
      provisionalOutsideHolderValueUsd: "1282708329625",
      affiliatedCirculatingHoldingsUsd: null,
      reviewedDisclosedOutsideCapitalUsd: "0",
      marketSourceId: "CG-BTC",
    });
    expect(ranking.find(({ projectId }) => projectId === "xrp")).toMatchObject({
      reviewedDisclosedOutsideCapitalUsd: "787000000",
      coverageWarning: expect.stringContaining("Upper estimate"),
    });
    const referencedSourceIds = new Set(data.sources.map(({ id }) => id));
    expect(
      data.provisionalMarketObservations.every(({ sourceId }) =>
        referencedSourceIds.has(sourceId),
      ),
    ).toBe(true);
    expect(
      data.provisionalCapitalEvents.every(({ sourceId }) =>
        referencedSourceIds.has(sourceId),
      ),
    ).toBe(true);
  });

  it("uses one reproducible CoinGecko historical snapshot for all 25 observations", () => {
    const data = importData();
    const methods = new Set(
      data.provisionalMarketObservations.map(
        ({ snapshotMethod }) => snapshotMethod,
      ),
    );
    const observationTimes = new Set(
      data.provisionalMarketObservations.map(({ observedAt }) => observedAt),
    );

    expect(methods).toEqual(new Set([COINGECKO_SNAPSHOT_METHOD]));
    expect(observationTimes).toEqual(new Set(["2026-07-30T00:00:00Z"]));
    expect(data.provisionalMarketObservations).toHaveLength(25);

    for (const observation of data.provisionalMarketObservations) {
      const expectedUrl =
        `https://api.coingecko.com/api/v3/coins/` +
        `${observation.coinGeckoCoinId}/history?date=30-07-2026&localization=false`;
      const source = data.sources.find(({ id }) => id === observation.sourceId);

      expect(observation.directSourceUrl).toBe(expectedUrl);
      expect(Date.parse(observation.fetchedAt)).toBeGreaterThanOrEqual(
        Date.parse(observation.observedAt),
      );
      expect(source).toMatchObject({
        category: "Market value",
        url: expectedUrl,
      });
    }
  });

  it("deducts only directly supported funding and leaves unsupported amounts unknown", () => {
    const data = importData();
    const ranking = buildProvisionalRanking(data);

    expect(
      data.provisionalCapitalEvents.map(({ projectId, amountUsd }) => ({
        projectId,
        amountUsd,
      })),
    ).toEqual([
      { projectId: "bitcoin", amountUsd: "0" },
      { projectId: "dogecoin", amountUsd: "0" },
      { projectId: "hyperliquid", amountUsd: "0" },
      { projectId: "solana", amountUsd: "314159265" },
      { projectId: "xrp", amountUsd: "32000000" },
      { projectId: "xrp", amountUsd: "55000000" },
      { projectId: "xrp", amountUsd: "200000000" },
      { projectId: "xrp", amountUsd: "500000000" },
      { projectId: "chainlink", amountUsd: "32000000" },
      { projectId: "sui", amountUsd: "36000000" },
      { projectId: "sui", amountUsd: "300000000" },
      { projectId: "stellar", amountUsd: "3000000" },
      { projectId: "hedera", amountUsd: "124000000" },
      { projectId: "avalanche", amountUsd: "60390000" },
      { projectId: "avalanche", amountUsd: "230000000" },
      { projectId: "avalanche", amountUsd: "250000000" },
      { projectId: "uniswap", amountUsd: "165000000" },
      { projectId: "near", amountUsd: "150000000" },
      { projectId: "ondo", amountUsd: "20000000" },
    ]);

    for (const event of data.provisionalCapitalEvents) {
      const source = data.sources.find(({ id }) => id === event.sourceId);
      expect(event.amountSupport).toBe("Direct");
      expect(event.supportingText.length).toBeGreaterThan(0);
      expect(source).toMatchObject({
        category: "Capital",
        url: expect.stringMatching(/^https:\/\//),
      });
    }

    for (const projectId of ["ethereum", "bnb", "tron", "cardano"]) {
      const entry = ranking.find(
        (candidate) => candidate.projectId === projectId,
      );
      expect(entry).toMatchObject({
        reviewedDisclosedOutsideCapitalUsd: null,
        coverageWarning: expect.stringContaining("not a $0 deduction"),
      });
      expect(entry?.provisionalOutsideHolderValueUsd).toBe(
        calculateProvisionalOutsideWealth(entry!.circulatingMarketValueUsd, [
          null,
          null,
        ]),
      );
    }

    expect(
      ranking.find(({ projectId }) => projectId === "chainlink"),
    ).toMatchObject({
      reviewedDisclosedOutsideCapitalUsd: "32000000",
    });
  });

  it("matches the corrected sourced top-ten values and calculations", () => {
    const ranking = buildProvisionalRanking(importData());

    expect(
      ranking.map(({ projectId, provisionalOutsideHolderValueUsd }) => ({
        projectId,
        provisionalOutsideHolderValueUsd,
      })),
    ).toEqual([
      {
        projectId: "bitcoin",
        provisionalOutsideHolderValueUsd: "1282708329625",
      },
      {
        projectId: "ethereum",
        provisionalOutsideHolderValueUsd: "230235889489",
      },
      { projectId: "bnb", provisionalOutsideHolderValueUsd: "76083530883" },
      { projectId: "xrp", provisionalOutsideHolderValueUsd: "66272007915" },
      { projectId: "solana", provisionalOutsideHolderValueUsd: "42346654317" },
      { projectId: "tron", provisionalOutsideHolderValueUsd: "30883085142" },
      {
        projectId: "hyperliquid",
        provisionalOutsideHolderValueUsd: "11989302028",
      },
      {
        projectId: "dogecoin",
        provisionalOutsideHolderValueUsd: "10883153036",
      },
      {
        projectId: "chainlink",
        provisionalOutsideHolderValueUsd: "6194092965",
      },
      { projectId: "cardano", provisionalOutsideHolderValueUsd: "6045751226" },
    ]);
  });

  it("preserves unknown deductions as null and explicit researched zero as zero", () => {
    const data = importData();
    const ethereum = data.candidates.find(
      ({ projectId }) => projectId === "ethereum",
    );
    const dogecoin = data.candidates.find(
      ({ projectId }) => projectId === "dogecoin",
    );

    expect(ethereum).toMatchObject({
      knownFounderTeamExcludedUsd: null,
      canonicalOutsideWealthUsd: null,
      canonicalRank: null,
      publicationStatus: "Research",
    });
    expect(dogecoin).toMatchObject({
      knownFounderTeamExcludedUsd: null,
      verifiedExternalCapitalUsd: "0",
      otherDeductionsUsd: "0",
      canonicalOutsideWealthUsd: null,
      canonicalRank: null,
      publicationStatus: "Research",
    });
    expect(calculateProvisionalOutsideWealth("100", [null, "10", "0"])).toBe(
      "90",
    );
  });

  it("applies accepted deductions exactly once with a direct source and qualification", () => {
    const data = importData();
    const xrp = buildProvisionalRanking(data).find(
      ({ projectId }) => projectId === "xrp",
    );

    expect(xrp?.reviewedDisclosedOutsideCapitalUsd).toBe("787000000");
    expect(xrp?.deductions.map(({ sourceIds }) => sourceIds)).toEqual([
      ["XRP-SERIES-A"],
      ["XRP-SERIES-B"],
      ["XRP-SERIES-C"],
      ["XRP-STRATEGIC-2025"],
    ]);
    for (const deduction of xrp?.deductions ?? []) {
      expect(deduction.qualification.length).toBeGreaterThan(0);
      for (const sourceId of deduction.sourceIds) {
        expect(data.sources.find(({ id }) => id === sourceId)?.url).toMatch(
          /^https:\/\//,
        );
      }
    }

    const firstEvent = provisionalCapitalCsv.split(/\r?\n/)[1];
    expect(() =>
      importData({
        provisionalCapitalCsv: `${provisionalCapitalCsv.trimEnd()}\n${firstEvent}\n`,
      }),
    ).toThrow(
      "provisional_capital_events.csv: duplicate bitcoin-reviewed-zero",
    );
  });

  it("keeps disputed, excluded, scenario-only, and unknown records out of primary deductions", () => {
    const ranking = buildProvisionalRanking(importData());
    const deductionsByProject = new Map(
      ranking.map((entry) => [
        entry.projectId,
        entry.deductions.flatMap(({ sourceIds }) => sourceIds),
      ]),
    );

    for (const record of importData().provisionalExcludedEvidence) {
      if (record.sourceId === "SOL-2021-SALE") continue;
      expect(deductionsByProject.get(record.projectId) ?? []).not.toContain(
        record.sourceId,
      );
    }
    expect(deductionsByProject.get("xrp")).not.toContain("XRP-EARLY-ROUND");
    expect(deductionsByProject.get("bnb")).not.toContain("BNB-ICO");
    expect(deductionsByProject.get("tron")).not.toContain("ARK-JUSTIN");
  });

  it("allows a reviewed $0 only with qualifying direct evidence", () => {
    expect(() =>
      importData({
        provisionalCapitalCsv: provisionalCapitalCsv.replace(
          "Source directly describes Bitcoin as a fair launch with no venture backers.",
          "Unqualified research note.",
        ),
      }),
    ).toThrow("reviewed $0 treatment needs direct no-outside-funding evidence");
  });

  it("does not deduct locked or non-circulating holdings", () => {
    const data = importData();
    const ranking = buildProvisionalRanking(data);

    expect(
      data.wallets.every(
        ({ circulatingSupplyOverlapVerified }) =>
          circulatingSupplyOverlapVerified === false,
      ),
    ).toBe(true);
    expect(
      ranking
        .flatMap(({ deductions }) => deductions)
        .filter(
          ({ label }) => label === "Verified affiliated circulating holdings",
        ),
    ).toEqual([]);
  });

  it("keeps founder teams as subjects with contiguous provisional ranks and distinct canonical ranks", () => {
    const ranking = buildProvisionalRanking(importData());

    expect(ranking.map(({ provisionalRank }) => provisionalRank)).toEqual(
      Array.from({ length: ranking.length }, (_, index) => index + 1),
    );
    expect(
      ranking.every(({ foundersTeam, project }) => foundersTeam !== project),
    ).toBe(true);
    const dogecoin = ranking.find(({ projectId }) => projectId === "dogecoin");
    const bitcoin = ranking.find(({ projectId }) => projectId === "bitcoin");
    expect(dogecoin).toMatchObject({ canonicalRank: null, provisionalRank: 8 });
    expect(bitcoin?.canonicalRank).toBeNull();
  });

  it("provides a confidence score, calculation evidence, and visible gaps for every entry", () => {
    for (const entry of buildProvisionalRanking(importData())) {
      expect(entry.confidence.score).toBeGreaterThanOrEqual(0);
      expect(entry.confidence.score).toBeLessThanOrEqual(100);
      expect(entry.confidence.components).not.toHaveLength(0);
      expect(entry.evidenceGaps.length).toBeGreaterThan(0);
      expect(entry.coverageWarning).toContain("Upper estimate");
      expect(entry.marketDirectSourceUrl).toMatch(/^https:\/\//);
    }
  });

  it("recalculates ranking order instead of trusting imported screen ranks", () => {
    const changed = candidateCsv
      .replace(",1,bitcoin,Bitcoin,", ",30,bitcoin,Bitcoin,")
      .replace(",30,celestia,Celestia,", ",1,celestia,Celestia,");
    const data = importData({ candidateCsv: changed });

    expect(data.candidates[0]).toMatchObject({
      projectId: "bitcoin",
      grossScreenRank: 1,
    });
    expect(data.candidates.at(-1)).toMatchObject({
      projectId: "celestia",
      grossScreenRank: null,
    });
  });

  it("is repeatable and does not accumulate records", () => {
    expect(importData()).toEqual(importData());
  });

  it("loads required research files when provisional inputs are absent", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "research-data-"));
    try {
      await Promise.all([
        writeFile(path.join(directory, "candidate_universe.csv"), candidateCsv),
        writeFile(path.join(directory, "wallet_evidence.csv"), walletCsv),
        writeFile(path.join(directory, "source_catalog.csv"), sourceCsv),
      ]);

      const data = await loadResearchData(directory);

      expect(data.provisionalMarketObservations).toEqual([]);
      expect(data.provisionalCapitalEvents).toEqual([]);
      expect(data.provisionalExcludedEvidence).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects duplicate project IDs", () => {
    const duplicate = candidateCsv.replace(
      ",2,ethereum,Ethereum,",
      ",2,bitcoin,Ethereum,",
    );
    expect(() => importData({ candidateCsv: duplicate })).toThrow(
      "candidate_universe.csv: duplicate bitcoin",
    );
  });

  it("rejects duplicate wallet identities regardless of source", () => {
    const firstWallet = walletCsv.split(/\r?\n/)[1];
    expect(firstWallet).toBeDefined();
    expect(() =>
      importData({ walletCsv: `${walletCsv.trimEnd()}\n${firstWallet}\n` }),
    ).toThrow("wallet_evidence.csv: duplicate");
  });

  it("rejects broken source references and formula snapshots", () => {
    expect(() =>
      importData({
        candidateCsv: candidateCsv.replace(",CG-ETH,", ",UNKNOWN-SOURCE,"),
      }),
    ).toThrow("unknown source UNKNOWN-SOURCE");
    expect(() =>
      importData({
        candidateCsv: candidateCsv.replace(
          "1225487935147,,Complete",
          "1225487935148,,Complete",
        ),
      }),
    ).toThrow("provisional formula mismatch");
  });

  it("rejects non-reproducible market methods and inferred funding amounts", () => {
    expect(() =>
      importData({
        provisionalMarketCsv: provisionalMarketCsv.replace(
          COINGECKO_SNAPSHOT_METHOD,
          "coingecko_live_page",
        ),
      }),
    ).toThrow("invalid snapshot_method");
    expect(() =>
      importData({
        provisionalCapitalCsv: provisionalCapitalCsv.replace(
          ",Direct,",
          ",Inferred,",
        ),
      }),
    ).toThrow("amount_support must be Direct");
  });

  it("classifies only eligible exact supported-chain addresses for synchronization", () => {
    const data = importData();
    const vitalik = data.wallets.find(
      ({ addressOrEntity }) =>
        addressOrEntity === "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    );
    const satoshi = data.wallets.find(
      ({ projectId }) => projectId === "bitcoin",
    );
    const excluded = data.wallets.find(({ confidence }) =>
      confidence.toLowerCase().includes("low"),
    );

    expect(vitalik).toMatchObject({
      syncStatus: "supported_unresolved",
      mayAffectPublishedScore: false,
    });
    expect(satoshi).toMatchObject({
      syncStatus: "unsupported_unresolved",
      mayAffectPublishedScore: false,
    });
    expect(excluded).toMatchObject({
      syncStatus: "excluded",
      mayAffectPublishedScore: false,
    });
  });

  it("preserves Coinbase public-equity and BNB token-only methodologies", () => {
    const data = importData();
    const coinbase = data.candidates.find(
      ({ projectId }) => projectId === "coinbase",
    );
    const bnb = data.candidates.find(({ projectId }) => projectId === "bnb");

    expect(calculatePublicEquityMarketCap("321.50", "250000000")).toBe(
      "80375000000",
    );
    expect(coinbase?.valuationBasis).toBe(
      "Public-equity market capitalization",
    );
    expect(coinbase).toMatchObject({
      capitalStatus: "Partial",
      publicationStatus: "Research",
    });
    expect(bnb?.valuationBasis).toContain("Circulating BNB market cap");
    expect(bnb?.valuationBasis).toContain(
      "private Binance value is context only",
    );
    expect(bnb).toMatchObject({ publicationStatus: "Research" });
  });
});
