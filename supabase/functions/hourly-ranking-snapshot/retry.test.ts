import { describe, expect, it, vi } from "vitest";

import { RetryableProviderError, withProviderRetry } from "./retry.js";

function instantSleep() {
  return vi.fn().mockResolvedValue(undefined);
}

describe("withProviderRetry", () => {
  it("returns the result on the first attempt without sleeping", async () => {
    const sleep = instantSleep();
    const attempt = vi.fn().mockResolvedValue("ok");

    const result = await withProviderRetry(attempt, {
      delaysMs: [10, 20],
      sleep,
    });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries a RetryableProviderError and succeeds once the transient issue clears", async () => {
    const sleep = instantSleep();
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new RetryableProviderError("omitted COIN"))
      .mockRejectedValueOnce(new RetryableProviderError("omitted COIN"))
      .mockResolvedValueOnce("ok");

    const result = await withProviderRetry(attempt, {
      delaysMs: [500, 1500],
      sleep,
    });

    expect(result).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[500], [1500]]);
  });

  it("throws the last error once every retry is exhausted", async () => {
    const sleep = instantSleep();
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(new RetryableProviderError("attempt 1"))
      .mockRejectedValueOnce(new RetryableProviderError("attempt 2"))
      .mockRejectedValueOnce(new RetryableProviderError("final attempt"));

    await expect(
      withProviderRetry(attempt, { delaysMs: [10, 20], sleep }),
    ).rejects.toThrow("final attempt");
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable error, even on the first attempt", async () => {
    const sleep = instantSleep();
    const attempt = vi.fn().mockRejectedValue(new Error("quota exhausted"));

    await expect(
      withProviderRetry(attempt, { delaysMs: [10, 20], sleep }),
    ).rejects.toThrow("quota exhausted");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("makes exactly one attempt when delaysMs is empty", async () => {
    const sleep = instantSleep();
    const attempt = vi
      .fn()
      .mockRejectedValue(new RetryableProviderError("omitted COIN"));

    await expect(
      withProviderRetry(attempt, { delaysMs: [], sleep }),
    ).rejects.toThrow("omitted COIN");
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
