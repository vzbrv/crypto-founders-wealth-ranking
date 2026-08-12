import { describe, expect, it, vi } from "vitest";
import { ArkhamApiError, ArkhamClient } from "./arkham.js";

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("Arkham API client", () => {
  it("uses the server-side API-Key header and returns normalized metadata", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe("https://example.test/chains");
      expect(new Headers(init?.headers).get("API-Key")).toBeTruthy();
      return jsonResponse({ chains: [{ name: "ethereum" }] });
    });

    const result = await new ArkhamClient({
      apiKey: "fixture-value",
      baseUrl: "https://example.test",
      fetchImpl,
    }).getChains();

    expect(result.data).toEqual({ chains: [{ name: "ethereum" }] });
    expect(result.endpoint).toBe("/chains");
    expect(result.rawResponseHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(result)).not.toContain("fixture-value");
  });

  it("retries bounded 429 and 5xx responses with backoff", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "rate limited" }, 429))
      .mockResolvedValueOnce(jsonResponse({ error: "unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse({ chains: [] }));
    const sleep = vi.fn(async () => undefined);

    const result = await new ArkhamClient({
      apiKey: "fixture-value",
      baseUrl: "https://example.test",
      fetchImpl,
      sleep,
      maxRetries: 2,
    }).getChains();

    expect(result.data).toEqual({ chains: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls[0]?.[0]).toBeLessThan(
      sleep.mock.calls[1]?.[0] ?? 0,
    );
  });

  it.each([
    [401, "authentication failed"],
    [403, "access denied"],
  ])(
    "does not retry %s responses or leak credentials",
    async (status, label) => {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        jsonResponse(
          { message: "fixture secret should not be returned" },
          status,
        ),
      );

      const error = await new ArkhamClient({
        apiKey: "fixture-value",
        baseUrl: "https://example.test",
        fetchImpl,
      })
        .getChains()
        .catch((value: unknown) => value as ArkhamApiError);

      expect(error).toBeInstanceOf(ArkhamApiError);
      expect(error.status).toBe(status);
      expect(error.message).toContain(label);
      expect(error.message).not.toContain("fixture-value");
      expect(error.message).not.toContain("fixture secret");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
});
