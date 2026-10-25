import { describe, expect, it, vi } from 'vitest'
import { getUser } from '@/registry/client'
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

describe('auth route lastSeenAt', () => {
  const setStoredLastSeen = (
    storage: { data: Map<string, unknown> },
    name: string,
    lastSeenAt: number,
  ) => {
    const users = storage.data.get('users') as LX.RegistryUser[]
    const index = users.findIndex((u) => u.name === name)
    users[index] = { ...users[index], lastSeenAt }
  }

  it('records lastSeenAt on first auth', async () => {
    const { env } = await createTestEnv({
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
    const before = Date.now()
    expect((await getUser(env, 'alice'))?.lastSeenAt ?? null).toBeNull()

    const res = await app.request(
      '/ah',
      { headers: { m: aesEncrypt(authText(), keyFor('alice', 'pw')) } },
      env,
    )

    expect(res.status).toBe(200)
    const user = await getUser(env, 'alice')
    expect(user?.lastSeenAt).toBeGreaterThanOrEqual(before)
  })

  it('records lastSeenAt on known-device re-auth', async () => {
    const { env, kv, storage } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw' }],
      syncFetch: async () => new Response('hello', { status: 200 }),
    })
    kv.store.set('client:client-1', 'alice')
    setStoredLastSeen(storage, 'alice', Date.now() - 61_000)
    const stale = (await getUser(env, 'alice'))?.lastSeenAt ?? 0
    const before = Date.now()

    const res = await app.request(
      '/ah',
      { headers: { m: 'enc', i: 'client-1' } },
      env,
    )

    expect(res.status).toBe(200)
    const lastSeenAt = (await getUser(env, 'alice'))?.lastSeenAt ?? 0
    expect(lastSeenAt).toBeGreaterThan(stale)
    expect(lastSeenAt).toBeGreaterThanOrEqual(before)
  })

  it('does not rewrite lastSeenAt inside the throttle window', async () => {
    const { env, kv, storage } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw' }],
      syncFetch: async () => new Response('hello', { status: 200 }),
    })
    kv.store.set('client:client-1', 'alice')
    const recent = Date.now() - 5_000
    setStoredLastSeen(storage, 'alice', recent)

    const res = await app.request(
      '/ah',
      { headers: { m: 'enc', i: 'client-1' } },
      env,
    )

    expect(res.status).toBe(200)
    expect((await getUser(env, 'alice'))?.lastSeenAt).toBe(recent)
  })

  it('still authenticates when the lastSeenAt write fails', async () => {
    const { env, kv } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw' }],
      syncFetch: async () => new Response('hello', { status: 200 }),
    })
    kv.store.set('client:client-1', 'alice')
    env.USER_REGISTRY = {
      idFromName: () => ({}) as DurableObjectId,
      get: () =>
        ({
          fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
            const request = new Request(input, init)
            // `getUser` succeeds, the last-seen write blows up.
            if (request.url.endsWith('/last-seen'))
              throw new Error('registry down')
            return new Response(
              JSON.stringify({
                name: 'alice',
                passwordHash: toMD5('pw'),
                status: 'active',
                source: 'admin',
                createdAt: 1,
              }),
              { status: 200 },
            )
          },
        }) as unknown as DurableObjectStub,
    } as unknown as DurableObjectNamespace

    const res = await app.request(
      '/ah',
      { headers: { m: 'enc', i: 'client-1' } },
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello')
  })
})
