import { describe, expect, it } from "vitest";

import {
  calculateCirculatingMarketValue,
  consolidateCanonicalSupply,
  selectLatestAsOf,
  type PriceObservation,
} from "./inputs.js";

const base: PriceObservation = {
  id: "known",
  assetId: "eth",
  price: "2000",
  quoteCurrency: "USD",
  observedAt: "2026-01-01T00:00:00Z",
  knownAt: "2026-01-01T00:01:00Z",
};

describe("ranking v2 snapshot inputs", () => {
  it("does not leak a later backfill into an old knowledge cutoff", () => {
    const selected = selectLatestAsOf(
      [
        base,
        {
          ...base,
          id: "late-backfill",
          price: "2100",
          knownAt: "2026-02-01T00:00:00Z",
        },
      ],
      {
        economicAsOf: "2026-01-02T00:00:00Z",
        knowledgeCutoff: "2026-01-02T00:00:00Z",
      },
    );
    expect(selected.get("eth")?.id).toBe("known");
  });

  it("derives market value from separate price and supply inputs", () => {
    expect(
      calculateCirculatingMarketValue(base, {
        id: "supply",
        assetId: "eth",
        circulatingUnits: "120000000",
        observedAt: base.observedAt,
        knownAt: base.knownAt,
      }),
    ).toBe("240000000000");
  });

  it("rejects a wrapped representation above its canonical backing", () => {
    expect(() =>
      consolidateCanonicalSupply([
        {
          assetId: "weth",
          canonicalAssetId: "eth",
          circulatingUnits: "101",
          backingUnits: "100",
        },
      ]),
    ).toThrow("exceeds canonical backing");
  });
});
