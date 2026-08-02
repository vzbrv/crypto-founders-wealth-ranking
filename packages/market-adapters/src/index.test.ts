import { describe, expect, it, vi } from "vitest";

import {
  CoinGeckoAdapter,
  type CoinGeckoAdapterOptions,
  ProviderQuotaStopError,
} from "./index.js";

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
      result.observations.map(({ assetId, priceUsd, sourceUrl }) => ({
        assetId,
        priceUsd,
        sourceUrl,
      })),
    ).toEqual([
      {
        assetId: "asset-a",
        priceUsd: "1.25",
        sourceUrl:
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=alpha&precision=full",
      },
      {
        assetId: "asset-b",
        priceUsd: "2",
        sourceUrl:
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=beta&precision=full",
      },
    ]);
    expect(result.observations[0]).toMatchObject({
      sourceDescription: "CoinGecko markets API record for alpha",
      observedAt: "2026-07-28T11:59:00.000Z",
      fetchedAt: "2026-07-28T12:00:00.000Z",
      circulatingSupply: "100",
    });
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

  it("stops permanently on quota responses without retrying", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(new Response("quota exceeded", { status: 429 }));
    const onPermanentStop = vi.fn();
    const guardedAdapter = new CoinGeckoAdapter({
      fetch,
      now: () => new Date("2026-07-28T12:00:00Z"),
      sleep: async () => undefined,
      minRequestIntervalMs: 0,
      maxRetries: 2,
      onPermanentStop,
    });

    await expect(guardedAdapter.sync(assets)).rejects.toBeInstanceOf(
      ProviderQuotaStopError,
    );
    expect(fetch).toHaveBeenCalledOnce();
    expect(onPermanentStop).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 429,
        condition: "HTTP_429_RATE_OR_QUOTA_LIMIT",
      }),
    );
  });

  it("checks quota before each batched provider request", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "alpha",
            current_price: 1,
            circulating_supply: 100,
            market_cap: 100,
            last_updated: "2026-07-28T11:59:00Z",
          },
        ]),
      ),
    );
    const beforeRequest = vi
      .fn<NonNullable<CoinGeckoAdapterOptions["beforeRequest"]>>()
      .mockResolvedValue(undefined);
    const guardedAdapter = new CoinGeckoAdapter({
      fetch,
      now: () => new Date("2026-07-28T12:00:00Z"),
      sleep: async () => undefined,
      minRequestIntervalMs: 0,
      maxRetries: 0,
      batchSize: 1,
      beforeRequest,
    });

    const result = await guardedAdapter.sync([assets[0]!]);

    expect(beforeRequest).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledOnce();
    expect(result.observations).toHaveLength(1);
  });
});
