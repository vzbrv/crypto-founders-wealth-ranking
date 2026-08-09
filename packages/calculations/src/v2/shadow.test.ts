import { describe, expect, it } from "vitest";

import { classifyShadowDifference } from "./shadow.js";

describe("classifyShadowDifference", () => {
  it("accepts a legacy score inside the v2 interval", () => {
    expect(
      classifyShadowDifference({
        legacyScore: "70",
        v2Lower: "60",
        v2Upper: "80",
      }),
    ).toEqual({ category: null, blocksCutover: false });
  });

  it.each([
    ["UNRESOLVED_V2_CAPITAL", { unresolvedV2Capital: true }],
    ["MISSING_V2_RESEARCH", { missingV2Research: true }],
    ["INPUT_DIFFERENCE", { inputHashesMatch: false }],
    ["EXPECTED_METHODOLOGY_CHANGE", { methodologyChanged: true }],
    ["CALCULATION_DIFFERENCE", { calculationDifferenceExplained: true }],
  ] as const)("classifies %s without blocking cutover", (category, flags) => {
    expect(
      classifyShadowDifference({
        legacyScore: "100",
        v2Lower: "60",
        v2Upper: "80",
        ...flags,
      }),
    ).toEqual({ category, blocksCutover: false });
  });

  it("blocks only an unexplained difference", () => {
    expect(
      classifyShadowDifference({
        legacyScore: "100",
        v2Lower: "60",
        v2Upper: "80",
      }),
    ).toEqual({
      category: "UNEXPLAINED_DIFFERENCE",
      blocksCutover: true,
    });
  });

  it("rejects an inverted interval", () => {
    expect(() =>
      classifyShadowDifference({
        legacyScore: "70",
        v2Lower: "80",
        v2Upper: "60",
      }),
    ).toThrow("v2Lower must not exceed v2Upper");
  });
});
