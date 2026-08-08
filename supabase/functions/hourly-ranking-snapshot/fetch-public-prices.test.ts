import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";
import type { UnifiedDocument } from "./index.js";

// This is a regression test for a real production incident: Yahoo
// Finance's undocumented /v7/finance/spark endpoint omitted "COIN" from a
// batch response on 2026-08-06 01:00 UTC, which aborted the entire hourly
// ranking snapshot (all 20 entries, not just the Coinbase one) because the
// fetch had no retry. See retry.ts and retry.test.ts for the generic retry
// helper this relies on.

let denoStub: DenoStub;
let fetchPublicPrices: typeof import("./index.js").fetchPublicPrices;

beforeAll(async () => {
  denoStub = installDenoStub();
  ({ fetchPublicPrices } = await import("./index.js"));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function documentWithPublicEntry(
  overrides: Partial<UnifiedDocument["entries"][number]> = {},
): UnifiedDocument {
  return {
    snapshotDate: "2026-08-06",
    methodologyVersion: "1",
    entries: [
      {
        entryId: "coinbase",
        founderTeam: "Brian Armstrong",
        project: "Coinbase",
        valueType: "Public company",
        market: {
          type: "public",
          ticker: "COIN",
          exchange: "NASDAQ",
          priceUsd: "200",
          priceDate: "2026-08-05",
          priceSourceId: "yahoo-finance",
          shareClasses: [
            {
              className: "Class A",
              sharesOutstanding: "1000",
              asOfDate: "2026-08-05",
              sourceId: "yahoo-finance",
            },
          ],
        },
        grossMarketValueUsd: "200000",
        affiliatedOwnership: { status: "Unknown", notes: "" },
        outsideCapital: { status: "Unknown", events: [], notes: "" },
        confidence: { score: 90, label: "high" },
        upperEstimate: false,
        unknowns: [],
        disputedEvidence: [],
        ...overrides,
      },
    ],
  } as UnifiedDocument;
}

function stubReserveAndFetch(
  fetchYahoo: (call: number) => Response,
): ReturnType<typeof vi.fn> {
  let yahooCallCount = 0;
  const fetchMock = vi.fn().mockImplementation((input: URL | string) => {
    const url = new URL(String(input));
    if (url.pathname === "/rest/v1/rpc/reserve_provider_request") {
      return Promise.resolve(
        new Response(JSON.stringify({ allowed: true }), { status: 200 }),
      );
    }
    if (url.hostname === "query1.finance.yahoo.com") {
      const response = fetchYahoo(yahooCallCount);
      yahooCallCount += 1;
      return Promise.resolve(response);
    }
    throw new Error(`unexpected fetch to ${url.toString()}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sparkResponse(symbols: string[]): Response {
  return new Response(
    JSON.stringify({
      spark: {
        result: symbols.map((symbol) => ({
          symbol,
          timestamp: [Math.floor(Date.now() / 1000)],
          indicators: { quote: [{ close: [200] }] },
        })),
      },
    }),
    { status: 200 },
  );
}

describe("fetchPublicPrices retry behavior", () => {
  it("recovers when Yahoo Finance omits a symbol on the first attempt but includes it on retry", async () => {
    vi.useFakeTimers();
    const fetchMock = stubReserveAndFetch((call) =>
      call === 0 ? sparkResponse([]) : sparkResponse(["COIN"]),
    );

    const resultPromise = fetchPublicPrices(
      documentWithPublicEntry(),
      "https://example.supabase.co",
      { "content-type": "application/json" },
      new Date(),
    );

    // Let the first (failing) attempt settle, then advance past the 500ms
    // retry delay so the second attempt fires.
    await vi.advanceTimersByTimeAsync(600);

    const result = await resultPromise;

    expect(result.prices.has("COIN")).toBe(true);
    const yahooCalls = fetchMock.mock.calls.filter(([input]: [URL | string]) =>
      String(input).includes("query1.finance.yahoo.com"),
    );
    expect(yahooCalls).toHaveLength(2);
  });

  it("returns a partial map (COIN missing) instead of throwing once retries are exhausted", async () => {
    // This is the exact real-world case: Yahoo omitted COIN for 6+
    // consecutive hourly runs, not just a one-off blip. Retrying alone
    // can't fix a persistent omission, so fetchPublicPrices now returns
    // whatever it *did* find and leaves it to the caller (the main entry
    // loop in index.ts) to carry forward a prior value for what's missing,
    // instead of aborting the entire snapshot over one symbol.
    vi.useFakeTimers();
    stubReserveAndFetch(() => sparkResponse([]));

    const resultPromise = fetchPublicPrices(
      documentWithPublicEntry(),
      "https://example.supabase.co",
      { "content-type": "application/json" },
      new Date(),
    );

    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(1600);

    const result = await resultPromise;
    expect(result.prices.has("COIN")).toBe(false);
  });
});
