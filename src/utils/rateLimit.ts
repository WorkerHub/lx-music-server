// Centralized rate limiting for the `/ah` auth endpoint.
//
// Production relies on the Cloudflare Workers Rate Limiting binding
// (`RATE_LIMITER`), which is backed by Cloudflare's rate-limiting
// infrastructure (shared with WAF rate limiting rules) instead of per-isolate
// memory. Counters are cached on-machine and updated in the background, so the
// `limit()` call adds no meaningful latency.
//
// When the binding is absent (e.g. local dev without it configured), we fall
// back to an in-memory counter. That fallback is NOT effective across isolates
// or restarts and exists only so development and unit tests keep working.

const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60 * 1000

type RateLimiterBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

const ipFailures = new Map<string, { count: number; resetAt: number }>()

/**
 * Returns `true` when the request should be blocked (over the limit).
 * Each call counts toward the limit — for an attacker guessing passwords every
 * request is a failure, so this is effectively a failed-attempt cap.
 */
export const isRateLimited = async (
  env: { RATE_LIMITER?: RateLimiterBinding },
  ip: string,
): Promise<boolean> => {
  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key: ip })
    return !success
  }

  const now = Date.now()
  const entry = ipFailures.get(ip)
  if (!entry || entry.resetAt < now) {
    ipFailures.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}
