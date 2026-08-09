import Decimal from "decimal.js";

export const SHADOW_DIFFERENCE_CATEGORIES = [
  "EXPECTED_METHODOLOGY_CHANGE",
  "MISSING_V2_RESEARCH",
  "UNRESOLVED_V2_CAPITAL",
  "INPUT_DIFFERENCE",
  "CALCULATION_DIFFERENCE",
  "UNEXPLAINED_DIFFERENCE",
] as const;

export type ShadowDifferenceCategory =
  (typeof SHADOW_DIFFERENCE_CATEGORIES)[number];

export interface ShadowDifferenceInput {
  legacyScore: string | null;
  v2Lower: string | null;
  v2Upper: string | null;
  missingV2Research?: boolean;
  unresolvedV2Capital?: boolean;
  inputHashesMatch?: boolean;
  methodologyChanged?: boolean;
  calculationDifferenceExplained?: boolean;
}

export interface ShadowDifferenceResult {
  category: ShadowDifferenceCategory | null;
  blocksCutover: boolean;
}

export function classifyShadowDifference(
  input: ShadowDifferenceInput,
): ShadowDifferenceResult {
  if (input.unresolvedV2Capital) {
    return { category: "UNRESOLVED_V2_CAPITAL", blocksCutover: false };
  }
  if (
    input.missingV2Research ||
    input.legacyScore === null ||
    input.v2Lower === null ||
    input.v2Upper === null
  ) {
    return { category: "MISSING_V2_RESEARCH", blocksCutover: false };
  }

  const legacy = new Decimal(input.legacyScore);
  const lower = new Decimal(input.v2Lower);
  const upper = new Decimal(input.v2Upper);
  if (lower.greaterThan(upper)) {
    throw new Error("v2Lower must not exceed v2Upper");
  }
  if (legacy.greaterThanOrEqualTo(lower) && legacy.lessThanOrEqualTo(upper)) {
    return { category: null, blocksCutover: false };
  }
  if (input.inputHashesMatch === false) {
    return { category: "INPUT_DIFFERENCE", blocksCutover: false };
  }
  if (input.methodologyChanged) {
    return { category: "EXPECTED_METHODOLOGY_CHANGE", blocksCutover: false };
  }
  if (input.calculationDifferenceExplained) {
    return { category: "CALCULATION_DIFFERENCE", blocksCutover: false };
  }
  return { category: "UNEXPLAINED_DIFFERENCE", blocksCutover: true };
}
