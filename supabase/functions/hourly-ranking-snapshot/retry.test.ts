import { describe, expect, it, vi } from "vitest";

import {
  accumulatePartialResults,
  RetryableProviderError,
  withProviderRetry,
} from "./retry.js";

function instantSleep() {
  return vi.fn().mockResolvedValue(undefined);
}

describe("accumulatePartialResults", () => {
  it("returns the full map immediately when every key is found on the first attempt", async () => {
    const sleep = instantSleep();
    const fetchOnce = vi.fn().mockResolvedValue(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );

    const result = await accumulatePartialResults(fetchOnce, ["a", "b"], {
      delaysMs: [10, 20],
      sleep,
    });

    expect(result).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("merges newly-found keys across attempts instead of discarding earlier progress", async () => {
    const sleep = instantSleep();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(new Map([["a", 1]]))
      .mockResolvedValueOnce(new Map([["b", 2]]));

    const result = await accumulatePartialResults(fetchOnce, ["a", "b"], {
      delaysMs: [10, 20],
      sleep,
    });

    expect(result).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("returns a partial map instead of throwing once every attempt is exhausted", async () => {
    const sleep = instantSleep();
    const fetchOnce = vi.fn().mockResolvedValue(new Map([["a", 1]]));

    const result = await accumulatePartialResults(fetchOnce, ["a", "b"], {
      delaysMs: [10, 20],
      sleep,
    });

    expect(result).toEqual(new Map([["a", 1]]));
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });

  it("keeps retrying past a retryable error on one attempt, keeping earlier progress", async () => {
    const sleep = instantSleep();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(new Map([["a", 1]]))
      .mockRejectedValueOnce(new RetryableProviderError("blip"))
      .mockResolvedValueOnce(new Map([["b", 2]]));

    const result = await accumulatePartialResults(fetchOnce, ["a", "b"], {
      delaysMs: [10, 20],
      sleep,
    });

    expect(result).toEqual(
      new Map([
        ["a", 1],
        ["b", 2],
      ]),
    );
    expect(fetchOnce).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-retryable error immediately, even with partial progress already merged", async () => {
    const sleep = instantSleep();
    const fetchOnce = vi
      .fn()
      .mockResolvedValueOnce(new Map([["a", 1]]))
      .mockRejectedValueOnce(new Error("quota exhausted"));

    await expect(
      accumulatePartialResults(fetchOnce, ["a", "b"], {
        delaysMs: [10, 20],
        sleep,
      }),
    ).rejects.toThrow("quota exhausted");
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it("returns an empty map, not an error, when every attempt fails and nothing was ever found", async () => {
    const sleep = instantSleep();
    const fetchOnce = vi
      .fn()
      .mockRejectedValue(new RetryableProviderError("always down"));

    const result = await accumulatePartialResults(fetchOnce, ["a"], {
      delaysMs: [10],
      sleep,
    });

    expect(result).toEqual(new Map());
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });
});

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
