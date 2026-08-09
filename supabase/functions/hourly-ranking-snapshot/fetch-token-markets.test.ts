import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";
import type { UnifiedDocument } from "./index.js";

let denoStub: DenoStub;
let fetchCoinGecko: typeof import("./index.js").fetchCoinGecko;

beforeAll(async () => {
  denoStub = installDenoStub();
  ({ fetchCoinGecko } = await import("./index.js"));
});

afterEach(() => {
  delete denoStub.env.COINGECKO_DEMO_API_KEY;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function token(id: string): UnifiedDocument["entries"][number] {
  return {
    entryId: id,
    founderTeam: id,
    project: id,
    valueType: "Token/network",
    market: {
      type: "token",
      sourceId: "coingecko",
      observationDate: "2026-08-09",
      coinGeckoCoinId: id,
    },
    grossMarketValueUsd: "1",
    affiliatedOwnership: { status: "Unknown", notes: "" },
    outsideCapital: { status: "Unknown", events: [], notes: "" },
    confidence: { score: 90, label: "high" },
    upperEstimate: false,
    unknowns: [],
    disputedEvidence: [],
  };
}

function market(id: string, now: Date) {
  return {
    id,
    current_price: 40,
    circulating_supply: 333_000_000,
    market_cap: 13_320_000_000,
    last_updated: now.toISOString(),
  };
}

describe("fetchCoinGecko fallback behavior", () => {
  it("recovers a token with a single-id request after persistent batch omission", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-08-09T12:00:00Z");
    const fetchMock = vi.fn().mockImplementation((input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/reserve_provider_request") {
        return Promise.resolve(
          new Response(JSON.stringify({ allowed: true }), { status: 200 }),
        );
      }
      if (url.hostname !== "api.coingecko.com") {
        throw new Error(`unexpected fetch to ${url.toString()}`);
      }
      const ids = url.searchParams.get("ids") ?? "";
      return Promise.resolve(
        new Response(
          JSON.stringify(
            ids === "hyperliquid"
              ? [market("hyperliquid", now)]
              : [market("bitcoin", now)],
          ),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = fetchCoinGecko(
      {
        snapshotDate: "2026-08-09",
        methodologyVersion: "1",
        sources: [],
        entries: [token("bitcoin"), token("hyperliquid")],
      },
      "https://example.supabase.co",
      { "content-type": "application/json" },
      now,
    );

    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1600);

    const result = await resultPromise;
    expect(result.markets.get("hyperliquid")).toMatchObject({
      price: 40,
      supply: 333_000_000,
      marketCap: 13_320_000_000,
    });
    expect(result.markets.get("hyperliquid")?.sourceUrl).toContain(
      "ids=hyperliquid",
    );
    const coinGeckoCalls = fetchMock.mock.calls.filter(
      ([input]: [URL | string]) => String(input).includes("api.coingecko.com"),
    );
    expect(coinGeckoCalls).toHaveLength(4);
  });
});
