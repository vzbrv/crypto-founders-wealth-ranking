import { describe, expect, it, vi } from "vitest";

import { CoinGeckoAdapter } from "./index.js";

const assets = [
  { assetId: "asset-a", coingeckoId: "alpha" },
  { assetId: "asset-b", coingeckoId: "beta" },
];

function adapter(fetch: typeof globalThis.fetch): CoinGeckoAdapter {
  return new CoinGeckoAdapter({
    fetch,
    now: () => new Date("2026-07-28T12:00:00Z"),
    sleep: async () => undefined,
    minRequestIntervalMs: 0,
    maxRetries: 0,
  });
}

describe("CoinGeckoAdapter", () => {
  it("fetches and normalizes multiple assets in one batch", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "alpha",
            current_price: 1.25,
            circulating_supply: 100,
            market_cap: 125,
            last_updated: "2026-07-28T11:59:00Z",
          },
          {
            id: "beta",
            current_price: "2",
            circulating_supply: 50,
            market_cap: 100,
            last_updated: "2026-07-28T11:59:30Z",
          },
        ]),
      ),
    );

    const result = await adapter(fetch).sync(assets);

    expect(fetch).toHaveBeenCalledOnce();
    expect(
      new URL(fetch.mock.calls[0]![0].toString()).searchParams.get("ids"),
    ).toBe("alpha,beta");
    expect(
      result.observations.map(({ assetId, priceUsd }) => ({
        assetId,
        priceUsd,
      })),
    ).toEqual([
      { assetId: "asset-a", priceUsd: "1.25" },
      { assetId: "asset-b", priceUsd: "2" },
    ]);
    expect(result.health.status).toBe("healthy");
  });

  it("rejects invalid rows without discarding valid observations", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "alpha",
            current_price: 1,
            circulating_supply: 100,
            market_cap: 100,
          },
          {
            id: "beta",
            current_price: -1,
            circulating_supply: 50,
            market_cap: 0,
          },
        ]),
      ),
    );

    const result = await adapter(fetch).sync(assets);

    expect(result.observations).toHaveLength(1);
    expect(result.rejections).toMatchObject([
      { assetId: "asset-b", code: "invalid_response" },
    ]);
    expect(result.health.status).toBe("degraded");
  });

  it("returns no observations when the provider fails", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));

    const result = await adapter(fetch).sync(assets);

    expect(result.observations).toEqual([]);
    expect(result.rejections).toHaveLength(2);
    expect(result.health).toMatchObject({
      status: "failed",
      errorCode: "provider_failure",
    });
  });
});
