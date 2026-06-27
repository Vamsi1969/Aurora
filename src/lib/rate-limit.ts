/**
 * Simple in-memory sliding-window rate limiter.
 * Keyed by an arbitrary string (e.g. userId or IP).
 * Designed for serverless / single-instance deployments.
 */

interface WindowEntry {
  timestamps: number[];
}

const store = new Map<string, WindowEntry>();

// Periodically prune stale entries to prevent memory leaks.
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < 60_000);
    if (entry.timestamps.length === 0) store.delete(key);
  }
}, 60_000);

export interface RateLimitConfig {
  /** Maximum number of requests allowed within the window. */
  maxRequests: number;
  /** Window duration in milliseconds (default: 60 000 = 1 minute). */
  windowMs?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the oldest request in the window expires. */
  retryAfterSeconds: number;
}

/**
 * Check (and record) a request for the given key.
 *
 * @param key   Unique identifier — typically `userId` or a composite like `${userId}:${route}`
 * @param config  Limit configuration
 * @returns Whether the request is allowed, remaining quota, and retry-after hint.
 */
export function checkRateLimit(key: string, config: RateLimitConfig): RateLimitResult {
  const { maxRequests, windowMs = 60_000 } = config;
  const now = Date.now();

  let entry = store.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(key, entry);
  }

  // Evict timestamps outside the current window.
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterSeconds = Math.ceil((oldest + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    retryAfterSeconds: 0,
  };
}

/**
 * Build a standard 429 Response with rate-limit headers.
 */
export function rateLimitResponse(retryAfterSeconds: number): Response {
  const body = JSON.stringify({
    error: "Too many requests",
    message: `Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
  });
  return new Response(body, {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(retryAfterSeconds),
      "X-RateLimit-Remaining": "0",
    },
  });
}
