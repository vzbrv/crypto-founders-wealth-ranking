export type V2ConfidenceStatus = "insufficient" | "low" | "medium" | "high";

export interface ConfidenceGateInput {
  eligible: boolean;
  materialOwnershipResolved: boolean;
  materialCapitalResolved: boolean;
  primaryEvidenceCoverage: number;
  independentReviewComplete: boolean;
  inputsFresh: boolean;
  reproducible: boolean;
}

export function deriveConfidenceStatus(
  gates: ConfidenceGateInput,
): V2ConfidenceStatus {
  if (!gates.eligible) return "insufficient";
  const foundationalGates =
    gates.materialOwnershipResolved &&
    gates.materialCapitalResolved &&
    gates.inputsFresh &&
    gates.reproducible;
  if (!foundationalGates) return "low";
  if (gates.primaryEvidenceCoverage === 1 && gates.independentReviewComplete) {
    return "high";
  }
  return "medium";
}
