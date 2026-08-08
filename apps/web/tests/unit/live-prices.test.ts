import { describe, expect, it } from "vitest";

import {
  calculateEntryLiveEstimate,
  collectLiveProducts,
  parseCoinbaseMessage,
  reconcileLivePrice,
  subscriptionMessages,
  type LiveProductPrice,
} from "../../lib/live-prices";
import type { RankingEntry } from "../../lib/ranking";

const entry: RankingEntry = {
  rank: 1,
  rankChange: 0,
  scoreUsd: "800000000",
  confidence: "high",
  calculatedAt: "2026-07-28T12:00:00.000Z",
  foundingUnitId: "unit-ethereum",
  slug: "ethereum-founders",
  displayName: "Ethereum Founders",
  description: null,
  imageUrl: null,
  iqWikiSlug: null,
  projects: [
    {
      id: "project-ethereum",
      slug: "ethereum",
      name: "Ethereum",
      symbol: "ETH",
      attributionFraction: "1",
      canonicalScoreUsd: "800000000",
      canonicalPriceUsd: "2",
      circulatingSupply: "500000000",
      excludedSupply: "75000000",
      outsideHolderSupply: "425000000",
      capitalRaisedUsd: "50000000",
    },
  ],
  excludedHoldingsUsd: "150000000",
  capitalDeductedUsd: "50000000",
  freshestObservationAt: "2026-07-28T12:00:00.000Z",
  warnings: [],
  eligibilityStatus: "ranked",
  ineligibilityReasons: [],
  walletReviewStatus: "approved_sufficient",
  fundingReviewStatus: "approved_sufficient",
  isStale: false,
  staleReason: null,
  status: "ranked",
};

describe("live price overlay", () => {
  it("builds Coinbase subscriptions only for supported canonical pairs", () => {
    expect(collectLiveProducts([entry])).toEqual([
      { productId: "ETH-USD", canonicalPriceUsd: "2" },
    ]);
    expect(
      subscriptionMessages(["ETH-USD"]).map((message) => JSON.parse(message)),
    ).toEqual([
      {
        type: "subscribe",
        product_ids: ["ETH-USD"],
        channel: "ticker_batch",
      },
      { type: "subscribe", channel: "heartbeats" },
    ]);
  });

  it("parses ticker batches and rejects prices beyond canonical variance", () => {
    const [tick] = parseCoinbaseMessage(
      JSON.stringify({
        channel: "ticker_batch",
        timestamp: "2026-07-28T12:00:01.000Z",
        events: [{ tickers: [{ product_id: "ETH-USD", price: "2.1" }] }],
      }),
    );

    expect(tick).toEqual({
      productId: "ETH-USD",
      priceUsd: "2.1",
      observedAt: "2026-07-28T12:00:01.000Z",
    });
    expect(reconcileLivePrice(tick!, "2").accepted).toBe(true);
    expect(reconcileLivePrice({ ...tick!, priceUsd: "3" }, "2").accepted).toBe(
      false,
    );
  });

  it("updates a presentation estimate without changing the canonical score", () => {
    const price: LiveProductPrice = {
      productId: "ETH-USD",
      priceUsd: "2.1",
      observedAt: "2026-07-28T12:00:01.000Z",
      varianceRatio: 0.05,
      stale: true,
    };

    expect(
      calculateEntryLiveEstimate(entry, new Map([[price.productId, price]])),
    ).toEqual({
      scoreUsd: "842500000",
      liveProjectCount: 1,
      stale: true,
    });
    expect(entry.scoreUsd).toBe("800000000");
  });
});
