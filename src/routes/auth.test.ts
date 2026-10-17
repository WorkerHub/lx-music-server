import { describe, expect, it, vi } from 'vitest'
import { aesEncrypt } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import app from './auth'

const CLIENT_MAPPING_TTL_SECONDS = 30 * 24 * 60 * 60

const makeEnv = (
  kv: {
    get: (key: string) => Promise<string | null>
    put: (...args: any[]) => Promise<void>
  },
  stubFetch: (req: Request) => Promise<Response>,
): LX.Env => {
  return {
    LX_USERS: JSON.stringify([{ name: 'alice', password: 'pw' }]),
    SERVER_NAME: 'test',
    KV: kv,
    USER_SYNC: {
      idFromName: () => ({}) as DurableObjectId,
      get: () => ({ fetch: stubFetch }) as unknown as DurableObjectStub,
    },
  } as unknown as LX.Env
}

describe('auth route client mapping TTL (M5)', () => {
  it('writes the client mapping with a TTL on first auth', async () => {
    const put = vi.fn(async () => {})
    const user = { name: 'alice', password: 'pw' }
    const key = btoa(getKeySeed(user) as string)
    const encryptedMsg = aesEncrypt('lx-music auth::dev', key)
    const env = makeEnv(
      { get: async () => null, put },
      async () =>
        new Response(
          JSON.stringify({
            encrypted: 'enc',
            clientId: 'new-client',
            userName: 'alice',
          }),
          { status: 200 },
        ),
    )

    const res = await app.request('/ah', { headers: { m: encryptedMsg } }, env)

    expect(res.status).toBe(200)
    expect(put).toHaveBeenCalledWith('client:new-client', 'alice', {
      expirationTtl: CLIENT_MAPPING_TTL_SECONDS,
    })
  })

  it('renews the client mapping TTL on known-device re-auth', async () => {
    const put = vi.fn(async () => {})
    const env = makeEnv(
      { get: async () => 'alice', put },
      async () => new Response('hello', { status: 200 }),
    )

    const res = await app.request(
      '/ah',
      { headers: { m: 'enc', i: 'client-1' } },
      env,
    )

    expect(res.status).toBe(200)
    expect(put).toHaveBeenCalledWith('client:client-1', 'alice', {
      expirationTtl: CLIENT_MAPPING_TTL_SECONDS,
    })
  })
})
