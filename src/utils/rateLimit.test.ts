import { describe, expect, it } from 'vitest'
import { isRateLimited } from './rateLimit'

describe('isRateLimited (Rate Limiting binding)', () => {
  it('blocks when the binding reports !success', async () => {
    const env = {
      RATE_LIMITER: {
        limit: async () => ({ success: false }),
      },
    }
    expect(await isRateLimited(env, '1.2.3.4')).toBe(true)
  })

  it('allows when the binding reports success', async () => {
    const env = {
      RATE_LIMITER: {
        limit: async () => ({ success: true }),
      },
    }
    expect(await isRateLimited(env, '1.2.3.4')).toBe(false)
  })

  it('passes the ip as the rate-limit key', async () => {
    let seen: string | null = null
    const env = {
      RATE_LIMITER: {
        limit: async ({ key }: { key: string }) => {
          seen = key
          return { success: true }
        },
      },
    }
    await isRateLimited(env, '9.9.9.9')
    expect(seen).toBe('9.9.9.9')
  })
})

describe('isRateLimited (in-memory fallback)', () => {
  it('blocks after the limit is exceeded', async () => {
    const env = {}
    for (let i = 0; i < 10; i++) {
      expect(await isRateLimited(env, '10.0.0.1')).toBe(false)
    }
    expect(await isRateLimited(env, '10.0.0.1')).toBe(true)
  })

  it('tracks each IP independently', async () => {
    const env = {}
    for (let i = 0; i < 11; i++) {
      await isRateLimited(env, '10.0.0.2')
    }
    expect(await isRateLimited(env, '10.0.0.3')).toBe(false)
  })
})
