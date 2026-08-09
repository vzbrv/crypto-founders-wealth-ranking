import { describe, expect, it } from "vitest";

import { deriveConfidenceStatus } from "./confidence.js";
import { solveGlobalRankBounds } from "./ranking.js";
import {
  calculateAffiliatedCirculatingUnits,
  calculateProjectScoreBounds,
  isConservedCapitalScenario,
  tightenConservedCapitalBounds,
  type ConservedCapitalBounds,
} from "./solver.js";

const sharedRound: ConservedCapitalBounds = {
  event: { min: "100", max: "100" },
  allocations: [
    { id: "a", min: "40", max: "80" },
    { id: "b", min: "20", max: "60" },
  ],
  remainder: { min: "0", max: "20" },
};

describe("ranking v2 constrained solver", () => {
  it("enforces conservation across shared capital allocations", () => {
    expect(
      isConservedCapitalScenario("100", { a: "80", b: "60" }, "0", sharedRound),
    ).toBe(false);
    expect(
      isConservedCapitalScenario(
        "100",
        { a: "60", b: "30" },
        "10",
        sharedRound,
      ),
    ).toBe(true);
    expect(tightenConservedCapitalBounds(sharedRound)).toEqual(sharedRound);
  });

  it("caps uncertain affiliated units at circulating supply", () => {
    expect(
      calculateAffiliatedCirculatingUnits({
        walletBalance: { min: "80", max: "80" },
        affiliatedFraction: { min: "0.5", max: "1" },
        circulatingInclusionFraction: { min: "0.5", max: "1" },
        circulatingUnits: "60",
      }),
    ).toEqual({ min: "20", max: "60" });
  });

  it("calculates the bounded value-created formula", () => {
    expect(
      calculateProjectScoreBounds({
        circulatingValue: { min: "900", max: "1000" },
        affiliatedValue: { min: "100", max: "200" },
        qualifyingCapital: { min: "50", max: "75" },
      }),
    ).toEqual({ min: "625", max: "850" });
  });
});

describe("ranking v2 derived states", () => {
  it("cannot derive high confidence until every high gate passes", () => {
    const complete = {
      eligible: true,
      materialOwnershipResolved: true,
      materialCapitalResolved: true,
      primaryEvidenceCoverage: 1,
      independentReviewComplete: true,
      inputsFresh: true,
      reproducible: true,
    };
    expect(deriveConfidenceStatus(complete)).toBe("high");
    expect(
      deriveConfidenceStatus({ ...complete, independentReviewComplete: false }),
    ).toBe("medium");
    expect(
      deriveConfidenceStatus({ ...complete, materialCapitalResolved: false }),
    ).toBe("low");
  });

  it("derives ranks from globally feasible cohort states", () => {
    expect(
      solveGlobalRankBounds(
        ["a", "b", "c"],
        ["eth"],
        [
          { scores: { a: "100", b: "90", c: "80" } },
          { scores: { a: "85", b: "90", c: "80" } },
        ],
      ),
    ).toEqual([
      {
        projectId: "a",
        rankMin: 1,
        rankMax: 2,
        rankOrderStatus: "overlapping",
      },
      {
        projectId: "b",
        rankMin: 1,
        rankMax: 2,
        rankOrderStatus: "overlapping",
      },
      { projectId: "c", rankMin: 3, rankMax: 3, rankOrderStatus: "exact" },
      {
        projectId: "eth",
        rankMin: null,
        rankMax: null,
        rankOrderStatus: "not_eligible",
      },
    ]);
  });
});
