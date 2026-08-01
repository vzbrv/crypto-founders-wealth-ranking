import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
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

beforeAll(async () => {
  [candidateCsv, walletCsv, sourceCsv] = await Promise.all([
    readFile(`${researchDirectory}candidate_universe.csv`, "utf8"),
    readFile(`${researchDirectory}wallet_evidence.csv`, "utf8"),
    readFile(`${researchDirectory}source_catalog.csv`, "utf8"),
  ]);
});

const importData = (
  overrides: Partial<Parameters<typeof importResearchCsv>[0]> = {},
) => importResearchCsv({ candidateCsv, walletCsv, sourceCsv, ...overrides });

describe("research dataset import", () => {
  it("imports the complete handoff with calculated publication gates and ranks", () => {
    const data = importData();

    expect(data).toMatchObject({
      candidates: { length: 30 },
      wallets: { length: 32 },
      capitalRecords: { length: 20 },
      sources: { length: 64 },
    });
    expect(
      data.candidates
        .filter(({ publicationStatus }) => publicationStatus === "Ready")
        .map(({ projectId }) => projectId),
    ).toEqual(["dogecoin", "litecoin"]);
    expect(
      data.candidates
        .filter(({ canonicalRank }) => canonicalRank !== null)
        .map(({ projectId, canonicalRank }) => ({ projectId, canonicalRank })),
    ).toEqual([
      { projectId: "dogecoin", canonicalRank: 1 },
      { projectId: "litecoin", canonicalRank: 2 },
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
      knownFounderTeamExcludedUsd: "0",
      verifiedExternalCapitalUsd: "0",
      otherDeductionsUsd: "0",
      publicationStatus: "Ready",
    });
    expect(calculateProvisionalOutsideWealth("100", [null, "10", "0"])).toBe(
      "90",
    );
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
