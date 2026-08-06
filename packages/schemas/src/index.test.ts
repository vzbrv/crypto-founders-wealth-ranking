import { describe, expect, it } from "vitest";

import {
  dateSchema,
  dateTimeSchema,
  decimalSchema,
  fractionSchema,
  fundingRoundSchema,
  reviewStatusSchema,
  walletSchema,
} from "./index.js";

// A tiny, dependency-free UUID-v4-shaped generator so these tests don't need
// @types/node (this package has no other Node dependency) or the DOM lib's
// ambient `crypto` typings. The schemas only care about RFC 4122 shape, not
// real randomness, so a counter is fine.
let uuidCounter = 0;
function fakeUuid(): string {
  uuidCounter += 1;
  const suffix = uuidCounter.toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

describe("dateSchema", () => {
  it("accepts a valid ISO calendar date", () => {
    expect(dateSchema.safeParse("2026-07-30").success).toBe(true);
  });

  it("rejects an impossible calendar date", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
  });

  it("rejects a date with a time component", () => {
    expect(dateSchema.safeParse("2026-07-30T00:00:00Z").success).toBe(false);
  });

  it("rejects non-ISO formats", () => {
    expect(dateSchema.safeParse("07/30/2026").success).toBe(false);
  });
});

describe("dateTimeSchema", () => {
  it("accepts a UTC timestamp with Z", () => {
    expect(dateTimeSchema.safeParse("2026-07-30T12:00:00.000Z").success).toBe(
      true,
    );
  });

  it("accepts a timestamp with an explicit offset", () => {
    expect(dateTimeSchema.safeParse("2026-07-30T12:00:00+02:00").success).toBe(
      true,
    );
  });

  it("rejects a timestamp with no timezone", () => {
    expect(dateTimeSchema.safeParse("2026-07-30T12:00:00").success).toBe(false);
  });

  it("rejects a bare date with no time component", () => {
    expect(dateTimeSchema.safeParse("2026-07-30").success).toBe(false);
  });
});

describe("decimalSchema", () => {
  it.each(["0", "1", "100", "1.5", "0.000001", "999999999999.99"])(
    "accepts %s",
    (value) => {
      expect(decimalSchema.safeParse(value).success).toBe(true);
    },
  );

  it.each(["-1", "1e10", "1,000", "", "abc", "1."])("rejects %s", (value) => {
    expect(decimalSchema.safeParse(value).success).toBe(false);
  });
});

describe("fractionSchema", () => {
  it.each(["0", "1", "1.0", "0.5", "0.999999"])("accepts %s", (value) => {
    expect(fractionSchema.safeParse(value).success).toBe(true);
  });

  it.each(["1.1", "-0.1", "2", "abc", ""])("rejects %s", (value) => {
    expect(fractionSchema.safeParse(value).success).toBe(false);
  });
});

describe("reviewStatusSchema", () => {
  it("accepts every documented status", () => {
    for (const status of [
      "not_reviewed",
      "in_progress",
      "approved_sufficient",
      "reviewed_insufficient",
    ]) {
      expect(reviewStatusSchema.safeParse(status).success).toBe(true);
    }
  });

  it("rejects an undocumented status", () => {
    expect(reviewStatusSchema.safeParse("approved").success).toBe(false);
  });
});

function baseWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUuid(),
    projectId: fakeUuid(),
    assetIds: [fakeUuid()],
    chainCode: "ethereum",
    address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    normalizedAddress: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
    label: "Founder wallet",
    classification: "founder",
    ownershipConfidence: "high",
    circulatingInclusionFraction: "1",
    balanceIncludedInCirculatingSupply: true,
    circulatingInclusionExplanation: "Included per tokenomics doc",
    affectsScore: true,
    deduplicationKey: "founder-wallet-1",
    reviewStatus: "approved_sufficient",
    reviewer: "researcher@example.com",
    reviewedAt: "2026-07-30T00:00:00.000Z",
    evidenceSourceIds: [fakeUuid()],
    status: "active",
    researchReviewedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("walletSchema address validation", () => {
  it("accepts a well-formed, correctly normalized Ethereum address", () => {
    expect(walletSchema.safeParse(baseWallet()).success).toBe(true);
  });

  it("rejects an Ethereum address failing the hex pattern", () => {
    const result = walletSchema.safeParse(
      baseWallet({
        address: "not-an-address",
        normalizedAddress: "not-an-address",
      }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an Ethereum address whose normalizedAddress isn't lowercased", () => {
    const result = walletSchema.safeParse(
      baseWallet({
        normalizedAddress: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a well-formed Solana address left case-sensitive", () => {
    const solanaAddress = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";
    const result = walletSchema.safeParse(
      baseWallet({
        chainCode: "solana",
        address: solanaAddress,
        normalizedAddress: solanaAddress,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects a Bitcoin address that doesn't match either legacy or bech32 patterns", () => {
    const result = walletSchema.safeParse(
      baseWallet({
        chainCode: "bitcoin",
        address: "not-a-btc-address",
        normalizedAddress: "not-a-btc-address",
      }),
    );
    expect(result.success).toBe(false);
  });
});

describe("walletSchema circulation and review completeness rules", () => {
  it("requires a circulation fraction when the wallet affects the score", () => {
    const result = walletSchema.safeParse(
      baseWallet({
        affectsScore: true,
        circulatingInclusionFraction: null,
        balanceIncludedInCirculatingSupply: null,
        circulatingInclusionExplanation: null,
      }),
    );
    expect(result.success).toBe(false);
  });

  it("allows a null circulation fraction when the wallet does not affect the score", () => {
    const result = walletSchema.safeParse(
      baseWallet({
        affectsScore: false,
        circulatingInclusionFraction: null,
        balanceIncludedInCirculatingSupply: null,
        circulatingInclusionExplanation: null,
      }),
    );
    expect(result.success).toBe(true);
  });

  it("requires reviewer, timestamp, and evidence for an approved_sufficient wallet", () => {
    const result = walletSchema.safeParse(
      baseWallet({ reviewer: null, reviewedAt: null, evidenceSourceIds: [] }),
    );
    expect(result.success).toBe(false);
  });

  it("requires reviewer, timestamp, notes, and evidence for a reviewed zero-fraction wallet", () => {
    const result = walletSchema.safeParse(
      baseWallet({ circulatingInclusionFraction: "0", notes: undefined }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a properly reviewed zero-fraction wallet with notes present", () => {
    const result = walletSchema.safeParse(
      baseWallet({
        circulatingInclusionFraction: "0",
        notes: "Excluded per treasury policy",
      }),
    );
    expect(result.success).toBe(true);
  });
});

function baseFundingRound(overrides: Record<string, unknown> = {}) {
  return {
    id: fakeUuid(),
    projectId: fakeUuid(),
    eventDate: "2024-01-15",
    roundType: "seed",
    amountStatus: "unknown",
    includeInCapitalDeduction: true,
    inclusionReason: "Documented pre-launch capital",
    deduplicationKey: "seed-round-1",
    reviewStatus: "not_reviewed",
    reviewer: null,
    evidenceSourceIds: [],
    status: "active",
    reviewedAt: "2026-07-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("fundingRoundSchema", () => {
  it("accepts a minimal round with unknown amount status", () => {
    expect(fundingRoundSchema.safeParse(baseFundingRound()).success).toBe(true);
  });

  it("requires originalAmount and originalCurrency together", () => {
    const result = fundingRoundSchema.safeParse(
      baseFundingRound({ originalAmount: "1000000" }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects amountStatus 'unknown' paired with a present USD amount", () => {
    const result = fundingRoundSchema.safeParse(
      baseFundingRound({ amountStatus: "unknown", amountUsdAtEvent: "1000" }),
    );
    expect(result.success).toBe(false);
  });

  it("requires conversionMethod and usdConversionDate whenever a USD amount is given", () => {
    const result = fundingRoundSchema.safeParse(
      baseFundingRound({ amountStatus: "exact", amountUsdAtEvent: "1000" }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts a fully specified exact-amount round", () => {
    const result = fundingRoundSchema.safeParse(
      baseFundingRound({
        amountStatus: "exact",
        amountUsdAtEvent: "1000000",
        conversionMethod: "spot rate at close",
        usdConversionDate: "2024-01-15",
      }),
    );
    expect(result.success).toBe(true);
  });

  it("requires reviewer and evidence for an approved_sufficient round", () => {
    const result = fundingRoundSchema.safeParse(
      baseFundingRound({ reviewStatus: "approved_sufficient" }),
    );
    expect(result.success).toBe(false);
  });
});
