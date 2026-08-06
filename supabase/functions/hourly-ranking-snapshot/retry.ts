/**
 * Retry helper for the market-data fetches in index.ts.
 *
 * Both fetchCoinGecko and fetchPublicPrices make one batch request per run
 * for every symbol they need, then fail entirely if the provider's response
 * omits even one of them (or returns a non-quota HTTP error). That single
 * point of failure took down an entire hourly snapshot when Yahoo Finance's
 * undocumented spark endpoint silently dropped one ticker from a batch
 * response — see the audit notes.
 *
 * withProviderRetry gives call sites a way to retry that specific failure
 * mode a bounded number of times with backoff, without retrying failures
 * that a retry can't fix (a genuine quota block, or data that's stale no
 * matter how many times you re-fetch it in the same second). Call sites
 * signal "this one is worth retrying" by throwing RetryableProviderError;
 * any other thrown error propagates immediately, unretried.
 */

export class RetryableProviderError extends Error {}

export interface RetryOptions {
  /** Delay before each retry, in order. Length + 1 = total attempts made. */
  delaysMs: number[];
  /** Injectable for tests; defaults to a real setTimeout-based delay. */
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withProviderRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const totalAttempts = options.delaysMs.length + 1;

  for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex += 1) {
    try {
      return await attempt();
    } catch (error) {
      const isLastAttempt = attemptIndex === totalAttempts - 1;
      if (!(error instanceof RetryableProviderError) || isLastAttempt) {
        throw error;
      }
      await sleep(options.delaysMs[attemptIndex]);
    }
  }

  // Unreachable: the loop above always returns or throws.
  throw new Error("withProviderRetry: exhausted attempts without a result");
}
