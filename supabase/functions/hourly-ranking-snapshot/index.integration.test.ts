import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";
import type { UnifiedDocument } from "./index.js";

let denoStub: DenoStub;

function buildDocument(): UnifiedDocument {
  const tokenEntries = Array.from({ length: 19 }, (_, index) => ({
    entryId: `token-${index + 1}`,
    founderTeam: `Founder ${index + 1}`,
    project: `Token ${index + 1}`,
    valueType: "Token/network" as const,
    market: {
      type: "token" as const,
      sourceId: `token-market-${index + 1}`,
      observationDate: "2026-08-06",
      coinGeckoCoinId: `token-${index + 1}`,
    },
    grossMarketValueUsd: "1000000000",
    affiliatedOwnership: { status: "Unknown" as const, notes: "" },
    outsideCapital: { status: "Unknown" as const, events: [], notes: "" },
    confidence: { score: 90, label: "high" },
    upperEstimate: false,
    unknowns: [],
    disputedEvidence: [],
  }));

  return {
    snapshotDate: "2026-08-06",
    methodologyVersion: "1",
    sources: [
      ...tokenEntries.map((entry) => ({
        id: entry.market.sourceId,
        category: "market",
        name: "test token market",
        date: "2026-08-06",
        url: `https://example.test/source/${entry.market.sourceId}`,
        quality: "primary",
        notes: "integration test",
      })),
      {
        id: "coinbase-price",
        category: "market",
        name: "test public market",
        date: "2026-08-06",
        url: "https://example.test/source/coinbase-price",
        quality: "primary",
        notes: "integration test",
      },
      {
        id: "coinbase-shares",
        category: "market",
        name: "test share count",
        date: "2026-08-06",
        url: "https://example.test/source/coinbase-shares",
        quality: "primary",
        notes: "integration test",
      },
    ],
    entries: [
      ...tokenEntries,
      {
        entryId: "coinbase",
        founderTeam: "Brian Armstrong",
        project: "Coinbase",
        valueType: "Public company" as const,
        market: {
          type: "public" as const,
          ticker: "COIN",
          exchange: "NASDAQ",
          priceUsd: "200",
          priceDate: "2026-08-05",
          priceSourceId: "coinbase-price",
          shareClasses: [
            {
              className: "Class A",
              sharesOutstanding: "1000",
              asOfDate: "2026-08-05",
              sourceId: "coinbase-shares",
            },
          ],
        },
        grossMarketValueUsd: "200000",
        affiliatedOwnership: { status: "Unknown" as const, notes: "" },
        outsideCapital: { status: "Unknown" as const, events: [], notes: "" },
        confidence: { score: 90, label: "high" },
        upperEstimate: false,
        unknowns: [],
        disputedEvidence: [],
      },
    ],
  };
}

beforeAll(async () => {
  denoStub = installDenoStub();
  await import("./index.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("hourly ranking snapshot integration", () => {
  it("publishes all 20 entries when Yahoo omits a public quote and Nasdaq resolves it", async () => {
    const document = buildDocument();
    const publishBodies: unknown[] = [];
    let failureCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string, init?: RequestInit) => {
        const url = new URL(String(input));

        if (url.pathname === "/rest/v1/unified_ranking_documents") {
          return Promise.resolve(
            new Response(JSON.stringify([{ dataset: document }]), {
              status: 200,
            }),
          );
        }

        if (url.pathname === "/rest/v1/arkham_provider_control") {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  enabled: true,
                  last_success_at: "2026-08-06T03:30:00Z",
                  last_run_status: "success",
                },
              ]),
              { status: 200 },
            ),
          );
        }

        if (url.pathname === "/rest/v1/rpc/reserve_provider_request") {
          return Promise.resolve(
            new Response(JSON.stringify({ allowed: true }), { status: 200 }),
          );
        }

        if (url.hostname === "api.coingecko.com") {
          const ids = (url.searchParams.get("ids") ?? "")
            .split(",")
            .filter(Boolean);
          return Promise.resolve(
            new Response(
              JSON.stringify(
                ids.map((id) => ({
                  id,
                  current_price: 100,
                  circulating_supply: 10_000_000,
                  market_cap: 1_000_000_000,
                  last_updated: new Date().toISOString(),
                })),
              ),
              { status: 200 },
            ),
          );
        }

        if (url.hostname === "query1.finance.yahoo.com") {
          return Promise.resolve(
            new Response(JSON.stringify({ spark: { result: [] } }), {
              status: 200,
            }),
          );
        }

        if (url.hostname === "api.nasdaq.com") {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                data: {
                  primaryData: {
                    lastSalePrice: "$201.25",
                    lastTradeTimestamp: "Aug 6, 2026",
                  },
                },
              }),
              { status: 200 },
            ),
          );
        }

        if (url.pathname === "/rest/v1/rpc/publish_hourly_snapshot") {
          publishBodies.push(JSON.parse(String(init?.body)).p_payload);
          return Promise.resolve(
            new Response(JSON.stringify("snapshot-id"), { status: 200 }),
          );
        }

        if (url.pathname === "/rest/v1/rpc/record_hourly_snapshot_failure") {
          failureCalls += 1;
          return Promise.resolve(
            new Response(JSON.stringify({ ok: true }), { status: 200 }),
          );
        }

        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    denoStub.env = {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
      CRON_SECRET: "cron-secret",
    };

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    const responsePromise = denoStub.handler(
      new Request("https://edge.test", {
        method: "POST",
        headers: { "x-cron-secret": "cron-secret" },
      }),
    );
    await vi.runAllTimersAsync();
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "published",
      snapshotId: "snapshot-id",
      entryCount: 20,
    });
    expect(failureCalls).toBe(0);
    expect(publishBodies).toHaveLength(1);

    const payload = publishBodies[0] as {
      results: Array<Record<string, unknown>>;
      inputs: Array<Record<string, unknown>>;
      sources: Array<Record<string, unknown>>;
      provider_health: Record<string, { status: string; freshness: string }>;
    };
    expect(payload.results).toHaveLength(20);

    const coinbaseInput = payload.inputs.find(
      (row) => row.entry_id === "coinbase",
    );
    expect(coinbaseInput?.public_company_price_usd).toBe("201.25");

    const coinbaseSource = payload.sources.find(
      (row) => row.source_id === "market:coinbase",
    );
    expect(coinbaseSource?.source_name).toBe("nasdaq");
    expect(coinbaseSource?.source_url).toContain("api.nasdaq.com");
    expect(payload.provider_health.yahoo_finance).toMatchObject({
      status: "degraded",
    });

    const coinbaseResult = payload.results.find(
      (row) => row.entry_id === "coinbase",
    );
    expect(coinbaseResult?.final_value_usd).toBe("201250.00");
    expect(coinbaseResult?.rank).toBe(20);
  });
});
