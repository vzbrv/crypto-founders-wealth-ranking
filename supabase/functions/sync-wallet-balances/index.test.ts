import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  installDenoStub,
  type DenoStub,
} from "../_shared/deno-test-harness.js";

// This file deliberately covers the auth/method/config dispatch layer only.
// The success path constructs a real viem PublicClient against
// EVM_ETHEREUM_RPC_URL inside the handler, which would need the handler
// refactored to accept an injectable client to test safely — see the
// audit notes. Untested here does not mean unverified: that inner sync
// logic (EvmBalanceAdapter, SolanaBalanceAdapter) has its own test suite
// in packages/chain-adapters/src/index.test.ts.

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
  return new Request("https://edge.example/sync-wallet-balances", {
    method: "POST",
    ...init,
  });
}

describe("sync-wallet-balances", () => {
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
      request({ headers: { "x-cron-secret": "anything" } }),
    );
    expect(response.status).toBe(500);
  });

  it("rejects requests with a wrong cron secret", async () => {
    baseEnv();
    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "wrong-secret" } }),
    );
    expect(response.status).toBe(401);
  });

  it("returns 502 and records a sanitized failure when the mapping read fails", async () => {
    baseEnv();
    const fetchMock = vi.fn().mockImplementation((input: URL | string) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/wallet_asset_mappings") {
        return Promise.resolve(new Response("", { status: 500 }));
      }
      if (url.pathname === "/rest/v1/rpc/record_provider_failure") {
        return Promise.resolve(new Response("{}", { status: 200 }));
      }
      throw new Error(`unexpected fetch to ${url.pathname}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const response = await denoStub.handler(
      request({ headers: { "x-cron-secret": "correct-secret" } }),
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: "Wallet refresh failed",
      staleDataRetained: true,
    });

    const failureCall = fetchMock.mock.calls.find(([input]: [URL | string]) =>
      String(input).includes("record_provider_failure"),
    );
    expect(failureCall).toBeDefined();
    const failureBody = JSON.parse(
      (failureCall![1] as RequestInit).body as string,
    );
    expect(failureBody.p_error_code).toBe("WALLET_MAPPING_READ_FAILED");
  });
});
