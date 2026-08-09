import type { V2ConfidenceStatus } from "./confidence.js";

export const PUBLICATION_REASON_CODES = [
  "MISSING_PRICE",
  "STALE_PRICE",
  "MISSING_SUPPLY",
  "STALE_SUPPLY",
  "STALE_BALANCE",
  "UNRESOLVED_MATERIAL_OWNERSHIP",
  "UNRESOLVED_MATERIAL_CAPITAL",
  "INCOMPLETE_CAPITAL_ALLOCATION",
  "INFEASIBLE_CONSTRAINT_SET",
  "ASSET_DOUBLE_COUNT",
  "CONFIDENCE_GATE_FAILED",
  "INDEPENDENT_REVIEW_REQUIRED",
  "NONDETERMINISTIC_RESULT",
  "COHORT_INCOMPLETE",
  "INPUT_HASH_MISMATCH",
] as const;

export type PublicationReasonCode = (typeof PUBLICATION_REASON_CODES)[number];

export interface PublicationProjectState {
  projectId: string;
  eligible: boolean;
  hasPrice: boolean;
  priceFresh: boolean;
  hasSupply: boolean;
  supplyFresh: boolean;
  balancesFresh: boolean;
  materialOwnershipResolved: boolean;
  materialCapitalResolved: boolean;
  capitalAllocationComplete: boolean;
  constraintSetFeasible: boolean;
  assetsConsolidated: boolean;
  confidenceStatus: V2ConfidenceStatus;
  independentReviewComplete: boolean;
}

export interface PublicationValidationInput {
  projects: readonly PublicationProjectState[];
  expectedProjectIds: readonly string[];
  deterministic: boolean;
  inputHashesMatch: boolean;
}

export interface PublicationRejectionReason {
  reasonCode: PublicationReasonCode;
  projectId: string | null;
  publicMessage: string;
}

const projectChecks: ReadonlyArray<{
  code: PublicationReasonCode;
  failed: (project: PublicationProjectState) => boolean;
  message: string;
}> = [
  {
    code: "MISSING_PRICE",
    failed: (p) => p.eligible && !p.hasPrice,
    message: "Price is missing.",
  },
  {
    code: "STALE_PRICE",
    failed: (p) => p.eligible && p.hasPrice && !p.priceFresh,
    message: "Price is stale.",
  },
  {
    code: "MISSING_SUPPLY",
    failed: (p) => p.eligible && !p.hasSupply,
    message: "Circulating supply is missing.",
  },
  {
    code: "STALE_SUPPLY",
    failed: (p) => p.eligible && p.hasSupply && !p.supplyFresh,
    message: "Circulating supply is stale.",
  },
  {
    code: "STALE_BALANCE",
    failed: (p) => p.eligible && !p.balancesFresh,
    message: "A material balance is stale.",
  },
  {
    code: "UNRESOLVED_MATERIAL_OWNERSHIP",
    failed: (p) => p.eligible && !p.materialOwnershipResolved,
    message: "Material ownership is unresolved.",
  },
  {
    code: "UNRESOLVED_MATERIAL_CAPITAL",
    failed: (p) => p.eligible && !p.materialCapitalResolved,
    message: "Material qualifying capital is unresolved.",
  },
  {
    code: "INCOMPLETE_CAPITAL_ALLOCATION",
    failed: (p) => p.eligible && !p.capitalAllocationComplete,
    message: "A capital allocation is incomplete.",
  },
  {
    code: "INFEASIBLE_CONSTRAINT_SET",
    failed: (p) => p.eligible && !p.constraintSetFeasible,
    message: "The constraint set is infeasible.",
  },
  {
    code: "ASSET_DOUBLE_COUNT",
    failed: (p) => p.eligible && !p.assetsConsolidated,
    message: "An asset representation may be double counted.",
  },
  {
    code: "CONFIDENCE_GATE_FAILED",
    failed: (p) => p.eligible && p.confidenceStatus === "insufficient",
    message: "An eligible project failed its confidence gate.",
  },
  {
    code: "INDEPENDENT_REVIEW_REQUIRED",
    failed: (p) => p.eligible && !p.independentReviewComplete,
    message: "Independent review is required.",
  },
];

export function validatePublication(
  input: PublicationValidationInput,
): PublicationRejectionReason[] {
  const reasons: PublicationRejectionReason[] = [];
  const expected = [...new Set(input.expectedProjectIds)].sort();
  const actual = [
    ...new Set(input.projects.map(({ projectId }) => projectId)),
  ].sort();

  for (const project of [...input.projects].sort((a, b) =>
    a.projectId.localeCompare(b.projectId),
  )) {
    for (const check of projectChecks) {
      if (check.failed(project)) {
        reasons.push({
          reasonCode: check.code,
          projectId: project.projectId,
          publicMessage: check.message,
        });
      }
    }
  }
  if (!input.deterministic) {
    reasons.push({
      reasonCode: "NONDETERMINISTIC_RESULT",
      projectId: null,
      publicMessage: "The snapshot could not be reproduced deterministically.",
    });
  }
  if (expected.join("\0") !== actual.join("\0")) {
    reasons.push({
      reasonCode: "COHORT_INCOMPLETE",
      projectId: null,
      publicMessage: "The snapshot does not contain the complete cohort.",
    });
  }
  if (!input.inputHashesMatch) {
    reasons.push({
      reasonCode: "INPUT_HASH_MISMATCH",
      projectId: null,
      publicMessage: "Snapshot input hashes do not match the selected inputs.",
    });
  }
  return reasons;
}
