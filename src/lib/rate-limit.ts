/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * On Vercel serverless this resets per cold start, which is fine — it still
 * protects against burst abuse within a single instance lifetime. For
 * stricter enforcement at scale, swap for an Upstash Redis limiter.
 */

const store = new Map<string, number[]>();

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const DEFAULT_MAX_REQUESTS = 30;

/**
 * Returns `true` if the request should be allowed, `false` if rate-limited.
 */
export function rateLimit(
  key: string,
  options?: { windowMs?: number; max?: number },
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const windowMs = options?.windowMs ?? DEFAULT_WINDOW_MS;
  const max = options?.max ?? DEFAULT_MAX_REQUESTS;
  const now = Date.now();
  const cutoff = now - windowMs;

  let timestamps = store.get(key);

  if (!timestamps) {
    timestamps = [];
    store.set(key, timestamps);
  }

  // Prune expired entries.
  while (timestamps.length > 0 && timestamps[0] <= cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= max) {
    const retryAfterMs = timestamps[0] + windowMs - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  timestamps.push(now);

  return { allowed: true, remaining: max - timestamps.length, retryAfterMs: 0 };
}

/**
 * Derive a rate-limit key from a request. Uses the shop domain from the
 * query string, falling back to the client IP.
 */
export function rateLimitKeyFromRequest(request: Request): string {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (shop) {
    return `shop:${shop}`;
  }

  return `ip:${request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"}`;
}
