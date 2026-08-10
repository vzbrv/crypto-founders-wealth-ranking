import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";

// Tests for the carry-forward lookup that backs per-entry resilience: when
// a provider persistently omits one symbol (the real incident: Yahoo
// Finance dropped "COIN" for 6+ consecutive hourly runs), the handler
// falls back to this entry's last known-good *published* value instead of
// aborting the whole snapshot. See get_last_known_market_input in
// supabase/migrations/202608070001_last_known_market_input_lookup.sql for
// the RPC this calls.

let denoStub: DenoStub;
let findLastKnownMarketInput: typeof import("./index.js").findLastKnownMarketInput;
let compareHourlyResultRows: typeof import("./index.js").compareHourlyResultRows;

beforeAll(async () => {
  denoStub = installDenoStub();
  ({ findLastKnownMarketInput, compareHourlyResultRows } =
    await import("./index.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubRpcResponse(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
  );
}

const carriedProvenance = {
  source_url: "https://example.com/market-source",
  source_name: "yahoo_finance",
  fetched_at: "2026-08-06T14:05:00.000Z",
};

describe("findLastKnownMarketInput", () => {
  it("returns the carried-forward value when the RPC finds a prior published entry", async () => {
    stubRpcResponse([
      {
        price_usd: "152.34",
        circulating_supply: null,
        gross_value_usd: "45000000000",
        observed_at: "2026-08-06T14:00:00.000Z",
        ...carriedProvenance,
      },
    ]);

    const result = await findLastKnownMarketInput(
      "coinbase",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      7 * 24 * 60 * 60,
      new Date("2026-08-06T15:00:00.000Z"),
    );

    expect(result).toEqual({
      priceUsd: 152.34,
      circulatingSupply: null,
      grossValueUsd: 45000000000,
      observedAt: "2026-08-06T14:00:00.000Z",
      sourceUrl: "https://example.com/market-source",
      provider: "yahoo_finance",
      fetchedAt: "2026-08-06T14:05:00.000Z",
    });
  });

  it("returns null when the RPC finds no prior published value", async () => {
    stubRpcResponse([]);

    const result = await findLastKnownMarketInput(
      "brand-new-entry",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      7 * 24 * 60 * 60,
      new Date("2026-08-06T15:00:00.000Z"),
    );

    expect(result).toBeNull();
  });

  it("returns null (not a thrown error) when the RPC call itself fails", async () => {
    stubRpcResponse({ message: "internal error" }, 500);

    const result = await findLastKnownMarketInput(
      "coinbase",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      7 * 24 * 60 * 60,
      new Date("2026-08-06T15:00:00.000Z"),
    );

    expect(result).toBeNull();
  });

  it("returns null when the network request throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const result = await findLastKnownMarketInput(
      "coinbase",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      7 * 24 * 60 * 60,
      new Date("2026-08-06T15:00:00.000Z"),
    );

    expect(result).toBeNull();
  });

  it("falls back grossValueUsd to null when the prior row never had one (defensive)", async () => {
    stubRpcResponse([
      {
        price_usd: "10",
        circulating_supply: "500",
        gross_value_usd: null,
        observed_at: "2026-08-06T14:00:00.000Z",
        ...carriedProvenance,
      },
    ]);

    const result = await findLastKnownMarketInput(
      "some-entry",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      7 * 24 * 60 * 60,
      new Date("2026-08-06T15:00:00.000Z"),
    );

    expect(result).toEqual({
      priceUsd: 10,
      circulatingSupply: 500,
      grossValueUsd: null,
      observedAt: "2026-08-06T14:00:00.000Z",
      sourceUrl: "https://example.com/market-source",
      provider: "yahoo_finance",
      fetchedAt: "2026-08-06T14:05:00.000Z",
    });
  });

  it("rejects a carried-forward value older than the market-data limit", async () => {
    stubRpcResponse([
      {
        price_usd: "152.34",
        circulating_supply: null,
        gross_value_usd: "45000000000",
        observed_at: "2026-08-06T14:00:00.000Z",
        ...carriedProvenance,
      },
    ]);

    const result = await findLastKnownMarketInput(
      "coinbase",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      60 * 60,
      new Date("2026-08-06T16:00:01.000Z"),
    );

    expect(result).toBeNull();
  });

  it.each([
    [
      "token",
      2 * 60 * 60,
      "2026-08-06T14:00:00.000Z",
      "2026-08-06T16:00:01.000Z",
    ],
    [
      "public",
      7 * 24 * 60 * 60,
      "2026-07-30T00:00:00.000Z",
      "2026-08-06T00:00:01.000Z",
    ],
  ])(
    "rejects stale %s fallback before it can be published",
    async (_market, maxStalenessSeconds, observedAt, now) => {
      stubRpcResponse([
        {
          price_usd: "152.34",
          circulating_supply: null,
          gross_value_usd: "45000000000",
          observed_at: observedAt,
          ...carriedProvenance,
        },
      ]);

      const result = await findLastKnownMarketInput(
        `${_market}-entry`,
        "https://example.supabase.co",
        { "content-type": "application/json" },
        maxStalenessSeconds,
        new Date(now),
      );

      expect(result).toBeNull();
    },
  );

  it("rejects a carried-forward value without source provenance", async () => {
    stubRpcResponse([
      {
        price_usd: "10",
        circulating_supply: "500",
        gross_value_usd: "5000",
        observed_at: "2026-08-06T14:00:00.000Z",
        source_url: null,
        source_name: null,
        fetched_at: null,
      },
    ]);

    const result = await findLastKnownMarketInput(
      "some-entry",
      "https://example.supabase.co",
      { "content-type": "application/json" },
      7 * 24 * 60 * 60,
      new Date("2026-08-06T15:00:00.000Z"),
    );

    expect(result).toBeNull();
  });

  it("orders close Decimal values exactly, then uses entry ID as the tie-break", () => {
    const rows = [
      { entry_id: "zeta", _sort_value: "100.09" },
      { entry_id: "alpha", _sort_value: "100.09" },
      { entry_id: "lower", _sort_value: "100.08999999999999999" },
      { entry_id: "higher", _sort_value: "100.09000000000000001" },
    ].sort(compareHourlyResultRows);

    expect(rows.map((row) => row.entry_id)).toEqual([
      "higher",
      "alpha",
      "zeta",
      "lower",
    ]);
  });
});
