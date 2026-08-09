import { describe, expect, it } from "vitest";

import {
  validatePublication,
  type PublicationProjectState,
} from "./publication.js";

const complete: PublicationProjectState = {
  projectId: "btc",
  eligible: true,
  hasPrice: true,
  priceFresh: true,
  hasSupply: true,
  supplyFresh: true,
  balancesFresh: true,
  materialOwnershipResolved: true,
  materialCapitalResolved: true,
  capitalAllocationComplete: true,
  constraintSetFeasible: true,
  assetsConsolidated: true,
  confidenceStatus: "high",
  independentReviewComplete: true,
};

describe("ranking v2 publication validation", () => {
  it("accepts a complete reproducible cohort", () => {
    expect(
      validatePublication({
        projects: [complete],
        expectedProjectIds: ["btc"],
        deterministic: true,
        inputHashesMatch: true,
      }),
    ).toEqual([]);
  });

  it("returns persisted-receipt-ready reasons in deterministic order", () => {
    const reasons = validatePublication({
      projects: [
        { ...complete, hasPrice: false, materialCapitalResolved: false },
      ],
      expectedProjectIds: ["btc", "eth"],
      deterministic: false,
      inputHashesMatch: false,
    });
    expect(reasons.map(({ reasonCode }) => reasonCode)).toEqual([
      "MISSING_PRICE",
      "UNRESOLVED_MATERIAL_CAPITAL",
      "NONDETERMINISTIC_RESULT",
      "COHORT_INCOMPLETE",
      "INPUT_HASH_MISMATCH",
    ]);
  });

  it.each(["medium", "low", "insufficient"] as const)(
    "rejects %s confidence from canonical publication",
    (confidenceStatus) => {
      expect(
        validatePublication({
          projects: [{ ...complete, confidenceStatus }],
          expectedProjectIds: ["btc"],
          deterministic: true,
          inputHashesMatch: true,
        }),
      ).toEqual([
        {
          reasonCode: "CONFIDENCE_GATE_FAILED",
          projectId: "btc",
          publicMessage: "An eligible project is not high confidence.",
        },
      ]);
    },
  );
});
