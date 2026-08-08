import { describe, expect, it } from "vitest";

import { computeEntryValuation } from "./valuation.js";

describe("computeEntryValuation", () => {
  it("uses the provider market cap directly for a token entry", () => {
    const result = computeEntryValuation({
      entryId: "token-1",
      market: { type: "token", marketCap: 1_000_000 },
      affiliatedOwnership: { status: "Unknown" },
      outsideCapital: { status: "Unknown", events: [] },
    });

    expect(result).toEqual({
      grossValueUsd: "1000000",
      founderAffiliateDeductionUsd: null,
      outsideCapitalDeductionUsd: null,
      finalValueUsd: "1000000",
    });
  });

  it("reconstructs gross value from share classes for a public company", () => {
    const result = computeEntryValuation({
      entryId: "public-1",
      market: {
        type: "public",
        price: 10,
        shareClasses: [
          { sharesOutstanding: "100" },
          { sharesOutstanding: "50" },
        ],
      },
      affiliatedOwnership: { status: "Unknown" },
      outsideCapital: { status: "Unknown", events: [] },
    });

    // (100 + 50) shares * $10 = $1,500
    expect(result.grossValueUsd).toBe("1500");
    expect(result.finalValueUsd).toBe("1500");
  });

  it("deducts accepted founder/affiliate ownership at market price, public companies only", () => {
    const result = computeEntryValuation({
      entryId: "public-2",
      market: {
        type: "public",
        price: 10,
        shareClasses: [{ sharesOutstanding: "1000" }],
      },
      affiliatedOwnership: { status: "Accepted", totalShares: "200" },
      outsideCapital: { status: "Unknown", events: [] },
    });

    // gross = 1000 * 10 = 10,000; ownership deduction = 200 * 10 = 2,000
    expect(result.grossValueUsd).toBe("10000");
    expect(result.founderAffiliateDeductionUsd).toBe("2000");
    expect(result.finalValueUsd).toBe("8000");
  });

  it("rejects Accepted ownership for a token entry without a calculable model", () => {
    expect(() =>
      computeEntryValuation({
        entryId: "token-2",
        market: { type: "token", marketCap: 500_000 },
        affiliatedOwnership: { status: "Accepted", totalShares: "999" },
        outsideCapital: { status: "Unknown", events: [] },
      }),
    ).toThrow("accepted token ownership is unsupported for token-2");
  });

  it("sums only Accepted-disposition outside capital events", () => {
    const result = computeEntryValuation({
      entryId: "public-3",
      market: { type: "token", marketCap: 100_000 },
      affiliatedOwnership: { status: "Unknown" },
      outsideCapital: {
        status: "Accepted",
        events: [
          { amountUsd: "10000", disposition: "Accepted" },
          { amountUsd: "5000", disposition: "Excluded" },
          { amountUsd: "3000", disposition: "Disputed" },
          { amountUsd: "2000", disposition: "Scenario-only" },
          { amountUsd: "7000", disposition: "Accepted" },
        ],
      },
    });

    // Only the two Accepted events (10,000 + 7,000) count.
    expect(result.outsideCapitalDeductionUsd).toBe("17000");
    expect(result.finalValueUsd).toBe("83000");
  });

  it("treats outsideCapital status Unknown as no known deduction, regardless of event contents", () => {
    const result = computeEntryValuation({
      entryId: "public-4",
      market: { type: "token", marketCap: 100_000 },
      affiliatedOwnership: { status: "Unknown" },
      outsideCapital: {
        status: "Unknown",
        events: [{ amountUsd: "99999", disposition: "Accepted" }],
      },
    });

    expect(result.outsideCapitalDeductionUsd).toBeNull();
    expect(result.finalValueUsd).toBe("100000");
  });

  it("throws when gross value is negative", () => {
    expect(() =>
      computeEntryValuation({
        entryId: "bad-gross",
        market: { type: "token", marketCap: -1 },
        affiliatedOwnership: { status: "Unknown" },
        outsideCapital: { status: "Unknown", events: [] },
      }),
    ).toThrow("invalid gross value for bad-gross");
  });

  it("throws when gross value is not finite", () => {
    expect(() =>
      computeEntryValuation({
        entryId: "bad-gross-nan",
        market: { type: "token", marketCap: Number.NaN },
        affiliatedOwnership: { status: "Unknown" },
        outsideCapital: { status: "Unknown", events: [] },
      }),
    ).toThrow("invalid gross value for bad-gross-nan");
  });

  it("throws when deductions exceed gross value, producing a negative final value", () => {
    expect(() =>
      computeEntryValuation({
        entryId: "over-deducted",
        market: { type: "token", marketCap: 1_000 },
        affiliatedOwnership: { status: "Unknown" },
        outsideCapital: {
          status: "Accepted",
          events: [{ amountUsd: "5000", disposition: "Accepted" }],
        },
      }),
    ).toThrow("invalid final value for over-deducted");
  });

  it("applies both deductions together for a public company", () => {
    const result = computeEntryValuation({
      entryId: "public-both",
      market: {
        type: "public",
        price: 20,
        shareClasses: [{ sharesOutstanding: "1000" }],
      },
      affiliatedOwnership: { status: "Accepted", totalShares: "100" },
      outsideCapital: {
        status: "Accepted",
        events: [{ amountUsd: "3000", disposition: "Accepted" }],
      },
    });

    // gross = 1000*20 = 20,000; ownership = 100*20 = 2,000; capital = 3,000
    // final = 20,000 - 2,000 - 3,000 = 15,000
    expect(result.grossValueUsd).toBe("20000");
    expect(result.founderAffiliateDeductionUsd).toBe("2000");
    expect(result.outsideCapitalDeductionUsd).toBe("3000");
    expect(result.finalValueUsd).toBe("15000");
  });
});
