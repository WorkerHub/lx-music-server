import { describe, expect, it } from 'vitest'
import { getUser, tombstoneUser, updateSettings } from '@/registry/client'
import { addTestUser, createTestEnv } from '@/test/registryEnv'
import { toMD5 } from '@/utils/crypto'
import app from './register'

const post = (env: LX.Env, body: Record<string, unknown>) =>
  app.request(
    '/api/register',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
    env,
  )

describe('POST /api/register', () => {
  it('defaults to approval mode and creates a pending account', async () => {
    const { env } = await createTestEnv()

    const res = await post(env, {
      name: 'newuser',
      password: 'pw12345678',
    })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status: 'pending' })
    const user = await getUser(env, 'newuser')
    expect(user).toMatchObject({
      status: 'pending',
      source: 'self',
      passwordHash: toMD5('pw12345678'),
    })
  })

  it('creates an active account in open mode', async () => {
    const { env } = await createTestEnv()
    await updateSettings(env, 'open')

    const res = await post(env, { name: 'newuser', password: 'pw12345678' })

    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ status: 'active' })
  })

  it('refuses registrations in closed mode', async () => {
    const { env } = await createTestEnv()
    await updateSettings(env, 'closed')

    const res = await post(env, { name: 'newuser', password: 'pw12345678' })

    expect(res.status).toBe(403)
    expect(await getUser(env, 'newuser')).toBeNull()
  })

  it('rejects existing, tombstoned and reserved names with 409', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'legacy', password: 'pw12345678' }],
    })
    await addTestUser(env, { name: 'orphan', password: 'pw12345678' })
    await tombstoneUser(env, 'orphan')

    for (const name of ['legacy', 'orphan', '__server__']) {
      const res = await post(env, { name, password: 'pw12345678' })
      expect(res.status).toBe(409)
    }
  })

  it('rejects invalid names and short passwords with 400', async () => {
    const { env } = await createTestEnv()

    expect(
      (await post(env, { name: 'ab', password: 'pw12345678' })).status,
    ).toBe(400)
    expect(
      (await post(env, { name: 'newuser', password: '1234567' })).status,
    ).toBe(400)
    expect((await post(env, {})).status).toBe(400)
  })

  it('blocks rate-limited registrations with 403', async () => {
    const { env } = await createTestEnv({
      rateLimiter: { limit: async () => ({ success: false }) },
    })

    const res = await post(env, { name: 'newuser', password: 'pw12345678' })

    expect(res.status).toBe(403)
  })
})

describe('GET /api/registration-info', () => {
  it('reports the current mode', async () => {
    const { env } = await createTestEnv()
    const res = await app.request('/api/registration-info', {}, env)
    expect(await res.json()).toEqual({ registrationMode: 'approval' })
  })
})
