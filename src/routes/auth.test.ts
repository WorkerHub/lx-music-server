import { describe, expect, it, vi } from 'vitest'
import { addTestUser, createTestEnv } from '@/test/registryEnv'
import { aesEncrypt, toMD5 } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import app from './auth'

const CLIENT_MAPPING_TTL_SECONDS = 365 * 24 * 60 * 60

const keyFor = (name: string, password: string) =>
  btoa(getKeySeed({ name, passwordHash: toMD5(password) }) as string)

const authText = (deviceName = 'dev') =>
  `lx-music auth::\n<publickey>\n${deviceName}\n`

describe('auth route client mapping TTL (M5)', () => {
  it('writes the client mapping with a TTL on first auth', async () => {
    const { env, kv } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw' }],
      syncFetch: async () =>
        new Response(
          JSON.stringify({
            encrypted: 'enc',
            clientId: 'new-client',
            userName: 'alice',
          }),
          { status: 200 },
        ),
    })
    const put = vi.spyOn(kv, 'put')
    const encryptedMsg = aesEncrypt(authText(), keyFor('alice', 'pw'))

    const res = await app.request('/ah', { headers: { m: encryptedMsg } }, env)

    expect(res.status).toBe(200)
    expect(put).toHaveBeenCalledWith('client:new-client', 'alice', {
      expirationTtl: CLIENT_MAPPING_TTL_SECONDS,
    })
  })

  it('renews the client mapping TTL on known-device re-auth', async () => {
    const { env, kv } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw' }],
      syncFetch: async () => new Response('hello', { status: 200 }),
    })
    kv.store.set('client:client-1', 'alice')
    const put = vi.spyOn(kv, 'put')

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

describe('auth route status gate', () => {
  it('rejects a pending account on first auth without touching KV', async () => {
    const { env, kv } = await createTestEnv({
      syncFetch: async () => new Response('unexpected', { status: 200 }),
    })
    await addTestUser(env, {
      name: 'waiting',
      password: 'pw12345678',
      status: 'pending',
      source: 'self',
    })
    const put = vi.spyOn(kv, 'put')

    const res = await app.request(
      '/ah',
      {
        headers: { m: aesEncrypt(authText(), keyFor('waiting', 'pw12345678')) },
      },
      env,
    )

    expect(res.status).toBe(401)
    expect(put).not.toHaveBeenCalled()
  })

  it('rejects a disabled account even when its device mapping still exists', async () => {
    const { env, kv } = await createTestEnv({
      syncFetch: async () => new Response('unexpected', { status: 200 }),
    })
    await addTestUser(env, {
      name: 'blocked',
      password: 'pw12345678',
      status: 'disabled',
    })
    kv.store.set('client:client-1', 'blocked')

    const res = await app.request(
      '/ah',
      { headers: { m: 'enc', i: 'client-1' } },
      env,
    )

    expect(res.status).toBe(401)
  })

  it('answers 500 when the registry is unreachable instead of a bogus 401', async () => {
    const { env } = await createTestEnv()
    env.USER_REGISTRY = {
      idFromName: () => ({}) as DurableObjectId,
      get: () => {
        throw new Error('registry down')
      },
    } as unknown as DurableObjectNamespace

    const res = await app.request('/ah', { headers: { m: 'enc' } }, env)

    expect(res.status).toBe(500)
  })
})
