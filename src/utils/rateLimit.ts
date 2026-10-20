// Centralized rate limiting for the credential-bearing endpoints: `/ah`,
// `/api/register` and `/api/admin/login`.
//
// Production relies on the Cloudflare Workers Rate Limiting binding
// (`RATE_LIMITER`), which is backed by Cloudflare's rate-limiting
// infrastructure (shared with WAF rate limiting rules) instead of per-isolate
// memory. Counters are cached on-machine and updated in the background, so the
// `limit()` call adds no meaningful latency.
//
// Callers pass a namespaced key (`<ip>`, `register:<ip>`, `admin:<ip>`) so one
// endpoint's traffic never consumes another's quota.
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
  key: string,
): Promise<boolean> => {
  if (env.RATE_LIMITER) {
    const { success } = await env.RATE_LIMITER.limit({ key })
    return !success
  }

  const now = Date.now()
  const entry = ipFailures.get(key)
  if (!entry || entry.resetAt < now) {
    ipFailures.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return false
  }
  entry.count++
  return entry.count > RATE_LIMIT
}
