import { describe, expect, it } from "vitest";

import { calculateScoreBreakdown, explorerUrl } from "../../lib/transparency";
import { getProjectEvidence } from "../../lib/transparency-data";

describe("transparency data", () => {
  it("reproduces the public score formula", () => {
    expect(
      calculateScoreBreakdown({
        marketCapUsd: 125_000_000,
        excludedValueUsd: 25_000_000,
        capitalRaisedUsd: 10_000_000,
      }),
    ).toBe(90_000_000);
  });

  it("exposes every required manual input with a source", () => {
    const evidence = getProjectEvidence("synthetic-horizon");
    expect(evidence).not.toBeNull();
    expect(evidence?.sourceClaims).toHaveLength(20);

    const claims = new Set(
      evidence?.sourceClaims.map(
        ({ recordType, field }) => `${recordType}:${field}`,
      ),
    );
    expect(claims).toEqual(
      new Set([
        "project:identity",
        "project:methodologyNotes",
        "founding_unit:identity",
        "founding_unit:projectLinks[0].attributionFraction",
        "founding_unit:projectLinks[0].attributionMethod",
        "asset:identity",
        "asset:providerIds",
        "asset:chainCode",
        "asset:contractAddress",
        "tracked_wallet:ownership",
        "tracked_wallet:classification",
        "tracked_wallet:ownershipConfidence",
        "tracked_wallet:circulatingInclusionFraction",
        "tracked_wallet:affectsScore",
        "funding_round:eventDate",
        "funding_round:roundType",
        "funding_round:originalAmount",
        "funding_round:amountUsdAtEvent",
        "funding_round:conversionMethod",
        "funding_round:includeInCapitalDeduction",
      ]),
    );
  });

  it("links supported wallets to a public explorer", () => {
    expect(
      explorerUrl("ethereum", "0x2222222222222222222222222222222222222222"),
    ).toBe(
      "https://etherscan.io/address/0x2222222222222222222222222222222222222222",
    );
    expect(explorerUrl("solana", "11111111111111111111111111111111")).toBe(
      "https://solscan.io/account/11111111111111111111111111111111",
    );
  });
});
