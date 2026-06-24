/**
 * Run an async task with a timeout and bounded exponential-backoff retries.
 * Throws the last error if all attempts fail (or a TimeoutError on timeout).
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

export type RetryOptions = {
  retries?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
  onAttempt?: (attempt: number, err: unknown) => void;
};

export async function withRetry<T>(
  task: (signal: AbortSignal) => Promise<T>,
  opts: RetryOptions = {},
): Promise<T> {
  const retries = opts.retries ?? 2;
  const timeoutMs = opts.timeoutMs ?? 10_000;
  const baseDelayMs = opts.baseDelayMs ?? 600;

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new TimeoutError(timeoutMs)), timeoutMs);
    try {
      return await task(ctrl.signal);
    } catch (err) {
      lastErr = ctrl.signal.aborted ? new TimeoutError(timeoutMs) : err;
      opts.onAttempt?.(attempt + 1, lastErr);
      if (attempt === retries) break;
      const delay = baseDelayMs * 2 ** attempt + Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
