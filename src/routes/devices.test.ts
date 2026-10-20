import { describe, expect, it } from 'vitest'
import { addTestUser, createTestEnv } from '@/test/registryEnv'
import app from './devices'

const basic = (name: string, password: string) =>
  `Basic ${btoa(`${name}:${password}`)}`

const devicesResponse = () =>
  new Response(
    JSON.stringify([{ clientId: 'c1', deviceName: 'phone', isMobile: true }]),
    { status: 200, headers: { 'content-type': 'application/json' } },
  )

describe('/devices Basic auth against the registry', () => {
  it('accepts an active account and returns its devices', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) =>
        request.url.endsWith('/devices')
          ? devicesResponse()
          : new Response(null, { status: 404 }),
    })

    const res = await app.request(
      '/devices',
      { headers: { authorization: basic('alice', 'pw12345678') } },
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([
      { clientId: 'c1', deviceName: 'phone', isMobile: true },
    ])
  })

  it('rejects a wrong password', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })

    const res = await app.request(
      '/devices',
      { headers: { authorization: basic('alice', 'wrong-password') } },
      env,
    )

    expect(res.status).toBe(401)
  })

  it('rejects pending and disabled accounts', async () => {
    const { env } = await createTestEnv()
    await addTestUser(env, {
      name: 'waiting',
      password: 'pw12345678',
      status: 'pending',
      source: 'self',
    })
    await addTestUser(env, {
      name: 'blocked',
      password: 'pw12345678',
      status: 'disabled',
    })

    for (const name of ['waiting', 'blocked']) {
      const res = await app.request(
        '/devices',
        { headers: { authorization: basic(name, 'pw12345678') } },
        env,
      )
      expect(res.status).toBe(401)
    }
  })
})
