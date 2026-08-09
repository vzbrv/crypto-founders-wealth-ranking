import { createHash } from "node:crypto";

import {
  deriveConfidenceStatus,
  type ConfidenceGateInput,
  type V2ConfidenceStatus,
} from "./confidence.js";
import {
  calculateCirculatingMarketValue,
  selectLatestAsOf,
  type PriceObservation,
  type SnapshotCutoffs,
  type SupplyObservation,
} from "./inputs.js";
import {
  solveGlobalRankBounds,
  type CohortScenario,
  type ProjectRankBounds,
} from "./ranking.js";
import {
  calculateProjectScoreBounds,
  tightenConservedCapitalBounds,
  type ConservedCapitalBounds,
  type DecimalInterval,
  type ProjectScoreBoundsInput,
} from "./solver.js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError("Canonical JSON does not support undefined values");
  return serialized;
}

export const hashCanonicalJson = (value: unknown): string =>
  createHash("sha256").update(canonicalJson(value)).digest("hex");

export interface ReproductionHashes {
  metadataHash: string;
  balanceInputsHash: string;
  priceInputsHash: string;
  supplyInputsHash: string;
  capitalInputsHash: string;
  evidenceStateHash: string;
  constraintSetHash: string;
  outputHash: string;
}

export interface SnapshotReproductionBundle {
  metadata: SnapshotCutoffs & {
    snapshotId: string;
    methodologyVersionId: string;
    calculationEngineVersion: string;
    calculationSolverVersion: string;
  };
  rawInputs: {
    balances: Json[];
    prices: PriceObservation[];
    supplies: SupplyObservation[];
    capital: ConservedCapitalBounds[];
    evidence: Json[];
  };
  selectedPriceIds: Record<string, string>;
  selectedSupplyIds: Record<string, string>;
  marketValues: Record<string, string>;
  projectScoreInputs: Record<string, ProjectScoreBoundsInput>;
  projectScores: Record<string, DecimalInterval>;
  confidenceGates: Record<string, ConfidenceGateInput>;
  confidence: Record<string, V2ConfidenceStatus>;
  eligibleProjectIds: string[];
  ineligibleProjectIds: string[];
  feasibleScenarios: CohortScenario[];
  ranks: ProjectRankBounds[];
  hashes: ReproductionHashes;
}

export interface ReproductionResult {
  passed: boolean;
  step: number;
  message: string;
}

const fail = (step: number, message: string): ReproductionResult => ({
  passed: false,
  step,
  message,
});
const equal = (left: unknown, right: unknown): boolean =>
  canonicalJson(left) === canonicalJson(right);
const asJson = (value: unknown): Json => value as Json;
const selectedIds = <T extends { id: string }>(
  selected: Map<string, T>,
): Record<string, string> =>
  Object.fromEntries(
    [...selected]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([assetId, item]) => [assetId, item.id]),
  );

export function reproduceSnapshot(
  bundle: SnapshotReproductionBundle,
): ReproductionResult {
  const { metadata, rawInputs, hashes } = bundle;
  if (
    !metadata.snapshotId ||
    !metadata.methodologyVersionId ||
    hashCanonicalJson(asJson(metadata)) !== hashes.metadataHash
  ) {
    return fail(1, "snapshot metadata hash mismatch");
  }
  const inputHashChecks: Array<[string, Json, string]> = [
    ["balance", rawInputs.balances, hashes.balanceInputsHash],
    ["price", asJson(rawInputs.prices), hashes.priceInputsHash],
    ["supply", asJson(rawInputs.supplies), hashes.supplyInputsHash],
    ["capital", asJson(rawInputs.capital), hashes.capitalInputsHash],
    ["evidence", rawInputs.evidence, hashes.evidenceStateHash],
  ];
  for (const [name, value, expected] of inputHashChecks) {
    if (hashCanonicalJson(value) !== expected)
      return fail(2, `${name} input hash mismatch`);
  }

  const cutoffs = {
    economicAsOf: metadata.economicAsOf,
    knowledgeCutoff: metadata.knowledgeCutoff,
  };
  const prices = selectLatestAsOf(rawInputs.prices, cutoffs);
  const supplies = selectLatestAsOf(rawInputs.supplies, cutoffs);
  if (
    !equal(asJson(selectedIds(prices)), asJson(bundle.selectedPriceIds)) ||
    !equal(asJson(selectedIds(supplies)), asJson(bundle.selectedSupplyIds))
  ) {
    return fail(3, "cutoff-selected observations differ");
  }

  const markets: Record<string, string> = {};
  for (const [assetId, price] of prices) {
    const supply = supplies.get(assetId);
    if (supply)
      markets[assetId] = calculateCirculatingMarketValue(price, supply);
  }
  if (!equal(asJson(markets), asJson(bundle.marketValues)))
    return fail(4, "normalized market values differ");

  if (hashCanonicalJson(asJson(rawInputs.capital)) !== hashes.constraintSetHash)
    return fail(5, "constraint-set hash mismatch");
  try {
    rawInputs.capital.forEach(tightenConservedCapitalBounds);
  } catch (error) {
    return fail(
      5,
      error instanceof Error
        ? error.message
        : "constraint-set reconstruction failed",
    );
  }

  const scores = Object.fromEntries(
    Object.entries(bundle.projectScoreInputs).map(([id, input]) => [
      id,
      calculateProjectScoreBounds(input),
    ]),
  );
  if (!equal(asJson(scores), asJson(bundle.projectScores)))
    return fail(6, "project score bounds differ");

  const allProjects = [
    ...bundle.eligibleProjectIds,
    ...bundle.ineligibleProjectIds,
  ].sort();
  if (
    new Set(allProjects).size !== allProjects.length ||
    !equal(
      asJson(allProjects),
      asJson(Object.keys(bundle.projectScores).sort()),
    )
  ) {
    return fail(7, "project eligibility partition differs");
  }

  const confidence = Object.fromEntries(
    Object.entries(bundle.confidenceGates).map(([id, gates]) => [
      id,
      deriveConfidenceStatus(gates),
    ]),
  );
  if (!equal(asJson(confidence), asJson(bundle.confidence)))
    return fail(8, "confidence derivation differs");

  const ranks = solveGlobalRankBounds(
    bundle.eligibleProjectIds,
    bundle.ineligibleProjectIds,
    bundle.feasibleScenarios,
  );
  if (!equal(asJson(ranks), asJson(bundle.ranks)))
    return fail(9, "global cohort ranks differ");

  const output = {
    marketValues: markets,
    projectScores: scores,
    confidence,
    ranks,
  };
  if (hashCanonicalJson(asJson(output)) !== hashes.outputHash)
    return fail(10, "final output hash mismatch");
  return { passed: true, step: 10, message: "snapshot reproduced exactly" };
}
