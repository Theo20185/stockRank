/**
 * Generic retry-with-exponential-backoff for Yahoo Finance calls.
 *
 * Why this exists separate from the FMP client's built-in retry:
 * `yahoo-finance2` is a library wrapper, not a raw fetch — its calls
 * sometimes return HTML error pages (which the library throws on),
 * sometimes return JSON with empty/stub fields, and sometimes throw
 * transient network errors. We can't reuse FMP's retry path because
 * that one inspects HTTP status codes directly. Here we treat ANY
 * thrown error as transient and retry on it.
 *
 * The wrapper is intentionally policy-light: callers compose their
 * own "what counts as failure" rules by throwing from inside `fn`
 * (e.g., quoteSummary throws when essential fields are missing, so
 * a stub response triggers a retry on the next attempt).
 *
 * Backoff schedule matches FMP's defaults for consistency:
 *   attempt 1 fails → sleep 250 ms → attempt 2
 *   attempt 2 fails → sleep 500 ms → attempt 3
 *   attempt 3 fails → sleep 1000 ms → attempt 4
 *   attempt 4 fails → throw the last error
 */

const DEFAULT_MAX_ATTEMPTS = 4;
const DEFAULT_BASE_MS = 250;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  /** Max attempts including the initial try. Default 4. */
  maxAttempts?: number;
  /** Base backoff in ms; doubles per attempt. Default 250. */
  baseMs?: number;
  /** Sleep impl, overridable for tests. */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Invoked before each retry sleep with the attempt number that just
   * failed and the error it threw. Use for logging visibility.
   */
  onRetry?: (attempt: number, err: unknown) => void;
};

export async function retryYahoo<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseMs = options.baseMs ?? DEFAULT_BASE_MS;
  const sleep = options.sleep ?? defaultSleep;

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= maxAttempts) break;
      options.onRetry?.(attempt, err);
      await sleep(baseMs * 2 ** (attempt - 1));
    }
  }
  throw lastErr;
}
