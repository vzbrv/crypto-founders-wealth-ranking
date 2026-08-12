import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";

let denoStub: DenoStub;

beforeAll(async () => {
  denoStub = installDenoStub();
  await import("./index.js");
});

function baseEnv() {
  denoStub.env.SUPABASE_URL = "https://example.supabase.co";
  denoStub.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  denoStub.env.CRON_SECRET = "correct-secret";
}

function request(
  init: RequestInit & { headers?: Record<string, string> } = {},
) {
  return new Request("https://edge.example/provider-health", {
    method: "POST",
    ...init,
  });
}

const authedHeaders = { "x-cron-secret": "correct-secret" };

describe("provider-health", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(denoStub.env)) delete denoStub.env[key];
  });

  it("rejects non-POST requests", async () => {
    const response = await denoStub.handler(request({ method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("returns 500 when required configuration is missing", async () => {
    const response = await denoStub.handler(
      request({ headers: authedHeaders }),
    );
    expect(response.status).toBe(500);
  });

  it("rejects requests with a wrong cron secret", async () => {
    baseEnv();
    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "wrong" } }),
    );
    expect(response.status).toBe(401);
  });

  it("reports healthy when every provider is current", async () => {
    baseEnv();
    const arkhamNow = new Date().toISOString();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname === "/rest/v1/public_arkham_provider_status") {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  enabled: true,
                  status: "healthy",
                  last_success_at: arkhamNow,
                  last_run_status: "success",
                  last_run_completed_at: arkhamNow,
                  updated_at: arkhamNow,
                },
              ]),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                provider: "coingecko",
                status: "healthy",
                freshness: "current",
                checked_at: "2026-08-04T00:00:00Z",
                latency_ms: 120,
              },
            ]),
            { status: 200 },
          ),
        );
      }),
    );

    const response = await denoStub.handler(
      request({ headers: authedHeaders }),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("healthy");
  });

  it("reports degraded (503) when any provider is failed or stale", async () => {
    baseEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname === "/rest/v1/public_arkham_provider_status") {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  enabled: true,
                  status: "healthy",
                  last_success_at: "2026-08-04T00:00:00Z",
                  last_run_status: "success",
                  last_run_completed_at: "2026-08-04T00:00:00Z",
                  updated_at: "2026-08-04T00:00:00Z",
                },
              ]),
              { status: 200 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                provider: "coingecko",
                status: "healthy",
                freshness: "current",
                checked_at: "2026-08-04T00:00:00Z",
                latency_ms: 120,
              },
              {
                provider: "yahoo_finance",
                status: "failed",
                freshness: "stale",
                checked_at: "2026-08-03T00:00:00Z",
                latency_ms: null,
              },
            ]),
            { status: 200 },
          ),
        );
      }),
    );

    const response = await denoStub.handler(
      request({ headers: authedHeaders }),
    );

    expect(response.status).toBe(503);
    const body = (await response.json()) as { status: string };
    expect(body.status).toBe("degraded");
  });

  it("returns 502 when the upstream read fails", async () => {
    baseEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );

    const response = await denoStub.handler(
      request({ headers: authedHeaders }),
    );

    expect(response.status).toBe(502);
  });
});
