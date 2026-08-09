import { describe, expect, it } from "vitest";

import {
  hashCanonicalJson,
  reproduceSnapshot,
  type SnapshotReproductionBundle,
} from "./reproduction.js";

const metadata = {
  snapshotId: "snapshot-1",
  methodologyVersionId: "v2",
  calculationEngineVersion: "2.0.0",
  calculationSolverVersion: "1",
  economicAsOf: "2026-01-01T00:00:00Z",
  knowledgeCutoff: "2026-01-01T01:00:00Z",
};
const rawInputs = {
  balances: [],
  prices: [
    {
      id: "p1",
      assetId: "btc",
      price: "2",
      quoteCurrency: "USD" as const,
      observedAt: metadata.economicAsOf,
      knownAt: metadata.knowledgeCutoff,
    },
  ],
  supplies: [
    {
      id: "s1",
      assetId: "btc",
      circulatingUnits: "100",
      observedAt: metadata.economicAsOf,
      knownAt: metadata.knowledgeCutoff,
    },
  ],
  capital: [
    {
      event: { min: "10", max: "10" },
      allocations: [{ id: "btc", min: "10", max: "10" }],
      remainder: { min: "0", max: "0" },
    },
  ],
  evidence: [],
};
const projectScoreInputs = {
  btc: {
    circulatingValue: { min: "200", max: "200" },
    affiliatedValue: { min: "20", max: "20" },
    qualifyingCapital: { min: "10", max: "10" },
  },
};
const projectScores = { btc: { min: "170", max: "170" } };
const confidenceGates = {
  btc: {
    eligible: true,
    materialOwnershipResolved: true,
    materialCapitalResolved: true,
    primaryEvidenceCoverage: 1,
    independentReviewComplete: true,
    inputsFresh: true,
    reproducible: true,
  },
};
const confidence = { btc: "high" as const };
const ranks = [
  {
    projectId: "btc",
    rankMin: 1,
    rankMax: 1,
    rankOrderStatus: "exact" as const,
  },
];
const output = {
  marketValues: { btc: "200" },
  projectScores,
  confidence,
  ranks,
};

const bundle: SnapshotReproductionBundle = {
  metadata,
  rawInputs,
  selectedPriceIds: { btc: "p1" },
  selectedSupplyIds: { btc: "s1" },
  marketValues: { btc: "200" },
  projectScoreInputs,
  projectScores,
  confidenceGates,
  confidence,
  eligibleProjectIds: ["btc"],
  ineligibleProjectIds: [],
  feasibleScenarios: [{ scores: { btc: "170" } }],
  ranks,
  hashes: {
    metadataHash: hashCanonicalJson(metadata),
    balanceInputsHash: hashCanonicalJson(rawInputs.balances),
    priceInputsHash: hashCanonicalJson(rawInputs.prices),
    supplyInputsHash: hashCanonicalJson(rawInputs.supplies),
    capitalInputsHash: hashCanonicalJson(rawInputs.capital),
    evidenceStateHash: hashCanonicalJson(rawInputs.evidence),
    constraintSetHash: hashCanonicalJson(rawInputs.capital),
    outputHash: hashCanonicalJson(output),
  },
};

describe("ranking v2 snapshot reproduction", () => {
  it("reproduces all ten stages exactly", () => {
    expect(reproduceSnapshot(bundle)).toEqual({
      passed: true,
      step: 10,
      message: "snapshot reproduced exactly",
    });
  });

  it("stops at the first divergence", () => {
    expect(
      reproduceSnapshot({ ...bundle, selectedPriceIds: { btc: "wrong" } }),
    ).toEqual({
      passed: false,
      step: 3,
      message: "cutoff-selected observations differ",
    });
  });
});
