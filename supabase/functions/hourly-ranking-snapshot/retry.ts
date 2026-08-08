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

/**
 * Retries a batch fetch that returns a Map, merging newly-found entries
 * across attempts, and returns whatever was accumulated once attempts run
 * out — it never throws just because some keys are still missing.
 *
 * This is deliberately different from withProviderRetry's all-or-nothing
 * contract. A single omitted symbol used to abort the entire hourly
 * snapshot, and retrying the *whole* batch helped with one-off blips but
 * not with a provider that persistently omits one symbol for hours at a
 * stretch (observed in production: Yahoo Finance omitted "COIN" from every
 * attempt for 6+ consecutive hourly runs). accumulatePartialResults lets
 * the caller fall back to a per-entry carried-forward value for whatever's
 * still missing after retries, instead of failing every entry over one
 * persistently-flaky symbol.
 *
 * `fetchOnce` should throw RetryableProviderError for failures worth
 * retrying (e.g. a non-quota HTTP error); any other thrown error — for
 * example a quota-exhaustion stop — propagates immediately, unretried,
 * since no amount of retrying fixes it and every attempt burns provider
 * quota.
 */
export async function accumulatePartialResults<K, V>(
  fetchOnce: () => Promise<Map<K, V>>,
  expectedKeys: Iterable<K>,
  options: RetryOptions,
): Promise<Map<K, V>> {
  const sleep = options.sleep ?? defaultSleep;
  const totalAttempts = options.delaysMs.length + 1;
  const merged = new Map<K, V>();
  const keys = [...expectedKeys];

  for (let attemptIndex = 0; attemptIndex < totalAttempts; attemptIndex += 1) {
    try {
      const found = await fetchOnce();
      for (const [key, value] of found) merged.set(key, value);
    } catch (error) {
      if (!(error instanceof RetryableProviderError)) throw error;
      // A retryable (e.g. transient HTTP) failure on this attempt doesn't
      // clear anything already merged from an earlier attempt — fall
      // through to the missing-keys check below like any other attempt.
    }

    const stillMissing = keys.some((key) => !merged.has(key));
    if (!stillMissing) break;

    const isLastAttempt = attemptIndex === totalAttempts - 1;
    if (!isLastAttempt) await sleep(options.delaysMs[attemptIndex]);
  }

  return merged;
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
