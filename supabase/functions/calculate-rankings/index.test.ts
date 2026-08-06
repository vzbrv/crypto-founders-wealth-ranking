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
  return new Request("https://edge.example/calculate-rankings", {
    method: "POST",
    ...init,
  });
}

describe("calculate-rankings", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(denoStub.env)) delete denoStub.env[key];
  });

  it("rejects non-POST requests", async () => {
    const response = await denoStub.handler(request({ method: "GET" }));
    expect(response.status).toBe(405);
  });

  it("returns 500 when required configuration is missing", async () => {
    // Deliberately leave env unset.
    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "anything" } }),
    );
    expect(response.status).toBe(500);
  });

  it("rejects requests with a wrong or missing cron secret", async () => {
    baseEnv();
    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "wrong-secret" } }),
    );
    expect(response.status).toBe(401);
  });

  it("triggers the ranking RPC and returns the calculation run id on success", async () => {
    baseEnv();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify("run-123"), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "correct-secret" } }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      calculationRunId: "run-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/rest/v1/rpc/recalculate_rankings");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      p_trigger_type: "scheduled",
    });
  });

  it("returns 502 when the ranking RPC responds with a failure status", async () => {
    baseEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 500 })),
    );

    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "correct-secret" } }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Ranking calculation failed",
    });
  });

  it("returns 502 when the fetch to Supabase throws", async () => {
    baseEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "correct-secret" } }),
    );

    expect(response.status).toBe(502);
  });
});
