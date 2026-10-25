import { beforeAll, describe, expect, it } from 'vitest'
import { sha256Hex } from '@/admin/auth'
import { getUser, listTombstones } from '@/registry/client'
import { addTestUser, createTestEnv } from '@/test/registryEnv'
import { toMD5 } from '@/utils/crypto'
import app from './admin'

const ADMIN_PASSWORD = 'admin-password-123'
let adminHash = ''

beforeAll(async () => {
  adminHash = await sha256Hex(ADMIN_PASSWORD)
})

const json = (body: unknown) => ({
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

// Default DO behaviour: no devices, no snapshot data, everything else 204.
const syncFetch = async (_name: string, request: Request) => {
  const path = new URL(request.url).pathname
  if (path === '/devices' && request.method === 'GET') return Response.json([])
  if (path === '/data-status')
    return Response.json({ list: null, dislike: null })
  return new Response(null, { status: 204 })
}

const setup = async (options: Parameters<typeof createTestEnv>[0] = {}) => {
  return createTestEnv({ adminPasswordHash: adminHash, syncFetch, ...options })
}

const login = async (env: LX.Env): Promise<string> => {
  const res = await app.request(
    '/api/admin/login',
    { method: 'POST', ...json({ password: ADMIN_PASSWORD }) },
    env,
  )
  expect(res.status).toBe(200)
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('missing session cookie')
  return cookie.split(';')[0]
}

const authed = (cookie: string, init: RequestInit = {}) => ({
  ...init,
  headers: {
    cookie,
    ...(init.body ? { 'content-type': 'application/json' } : {}),
  },
})

describe('admin API configuration and login', () => {
  it('exposes nothing when the admin secret is missing', async () => {
    const { env } = await createTestEnv()

    expect((await app.request('/api/admin/users', {}, env)).status).toBe(404)
    expect(
      (
        await app.request(
          '/api/admin/login',
          { method: 'POST', ...json({ password: ADMIN_PASSWORD }) },
          env,
        )
      ).status,
    ).toBe(404)
  })

  it('rejects a wrong password and accepts the configured one', async () => {
    const { env } = await setup()

    const wrong = await app.request(
      '/api/admin/login',
      { method: 'POST', ...json({ password: 'nope' }) },
      env,
    )
    expect(wrong.status).toBe(401)

    const ok = await app.request(
      '/api/admin/login',
      { method: 'POST', ...json({ password: ADMIN_PASSWORD }) },
      env,
    )
    expect(ok.status).toBe(200)
    const cookie = ok.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('lx_admin=')
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('Secure')
    expect(cookie).toContain('SameSite=Strict')
  })

  it('requires a session for every other endpoint', async () => {
    const { env } = await setup()
    const paths = [
      '/api/admin/users',
      '/api/admin/users/alice/devices',
      '/api/admin/orphans',
      '/api/admin/settings',
    ]
    for (const path of paths) {
      const res = await app.request(path, {}, env)
      expect(res.status).toBe(401)
    }
  })

  it('clears the cookie on logout', async () => {
    const { env } = await setup()
    const cookie = await login(env)
    const res = await app.request(
      '/api/admin/logout',
      authed(cookie, { method: 'POST' }),
      env,
    )
    expect(res.status).toBe(204)
  })
})

describe('admin user listing', () => {
  it('returns the public view without password hashes', async () => {
    const { env } = await setup({
      users: [{ name: 'legacy', password: 'pw12345678' }],
    })
    const cookie = await login(env)

    const res = await app.request('/api/admin/users', authed(cookie), env)
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      users: Array<Record<string, unknown>>
    }
    expect(body.users).toHaveLength(1)
    expect(body.users[0]).toMatchObject({
      name: 'legacy',
      status: 'active',
      source: 'imported',
      deviceCount: 0,
    })
    expect(body.users[0]).not.toHaveProperty('passwordHash')
  })

  it('reports deviceCount as null when the DO fails', async () => {
    const { env } = await setup({
      users: [{ name: 'legacy', password: 'pw12345678' }],
      syncFetch: async () => new Response('boom', { status: 500 }),
    })
    const cookie = await login(env)

    const res = await app.request('/api/admin/users', authed(cookie), env)
    const body = (await res.json()) as {
      users: Array<{ deviceCount: unknown }>
    }
    expect(body.users[0].deviceCount).toBeNull()
  })
})

describe('admin user creation and editing', () => {
  it('creates an active admin-sourced account with an MD5 hash', async () => {
    const { env } = await setup()
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users',
      authed(cookie, {
        method: 'POST',
        ...json({
          name: 'added',
          password: 'pw12345678',
          maxSnapshotNum: 30,
          addMusicLocationType: 'top',
        }),
      }),
      env,
    )
    expect(res.status).toBe(201)
    const user = await getUser(env, 'added')
    expect(user).toMatchObject({
      status: 'active',
      source: 'admin',
      passwordHash: toMD5('pw12345678'),
      maxSnapshotNum: 30,
      'list.addMusicLocationType': 'top',
    })
  })

  it('validates the name, password and config', async () => {
    const { env } = await setup()
    const cookie = await login(env)

    const cases = [
      { name: 'ab', password: 'pw12345678' },
      { name: 'validname', password: '1234567' },
      { name: 'validname', password: 'pw12345678', maxSnapshotNum: 0 },
      {
        name: 'validname',
        password: 'pw12345678',
        addMusicLocationType: 'middle',
      },
    ]
    for (const body of cases) {
      const res = await app.request(
        '/api/admin/users',
        authed(cookie, { method: 'POST', ...json(body) }),
        env,
      )
      expect(res.status).toBe(400)
    }

    const reserved = await app.request(
      '/api/admin/users',
      authed(cookie, {
        method: 'POST',
        ...json({ name: '__server__', password: 'pw12345678' }),
      }),
      env,
    )
    expect(reserved.status).toBe(409)
  })

  it('returns 409 for a duplicate name', async () => {
    const { env } = await setup({
      users: [{ name: 'legacy', password: 'pw12345678' }],
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users',
      authed(cookie, {
        method: 'POST',
        ...json({ name: 'legacy', password: 'pw12345678' }),
      }),
      env,
    )
    expect(res.status).toBe(409)
  })

  it('updates snapshot settings', async () => {
    const { env } = await setup({
      users: [{ name: 'legacy', password: 'pw12345678' }],
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/legacy',
      authed(cookie, {
        method: 'PATCH',
        ...json({ maxSnapshotNum: 50, addMusicLocationType: 'top' }),
      }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await getUser(env, 'legacy')).toMatchObject({
      maxSnapshotNum: 50,
      'list.addMusicLocationType': 'top',
    })
  })
})

describe('admin state transitions', () => {
  it('approves, disables and enables an account', async () => {
    const { env, syncCalls } = await setup()
    await addTestUser(env, {
      name: 'waiting',
      password: 'pw12345678',
      status: 'pending',
      source: 'self',
    })
    const cookie = await login(env)

    const approve = await app.request(
      '/api/admin/users/waiting/approve',
      authed(cookie, { method: 'POST' }),
      env,
    )
    expect(approve.status).toBe(200)
    expect((await getUser(env, 'waiting'))?.status).toBe('active')

    const again = await app.request(
      '/api/admin/users/waiting/approve',
      authed(cookie, { method: 'POST' }),
      env,
    )
    expect(again.status).toBe(409)

    const disable = await app.request(
      '/api/admin/users/waiting/disable',
      authed(cookie, { method: 'POST' }),
      env,
    )
    expect(disable.status).toBe(200)
    expect((await getUser(env, 'waiting'))?.status).toBe('disabled')
    expect(
      syncCalls.some(
        (call) =>
          call.name === 'waiting' &&
          call.request.method === 'POST' &&
          call.request.url.endsWith('/kick'),
      ),
    ).toBe(true)

    const enable = await app.request(
      '/api/admin/users/waiting/enable',
      authed(cookie, { method: 'POST' }),
      env,
    )
    expect(enable.status).toBe(200)
    expect((await getUser(env, 'waiting'))?.status).toBe('active')
  })

  it('rejects a pending application without leaving a tombstone', async () => {
    const { env } = await setup()
    await addTestUser(env, {
      name: 'waiting',
      password: 'pw12345678',
      status: 'pending',
      source: 'self',
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/waiting/reject',
      authed(cookie, { method: 'POST' }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await getUser(env, 'waiting')).toBeNull()
    expect(await listTombstones(env)).toHaveLength(0)
  })
})

describe('admin password reset', () => {
  it('removes devices by default so paired clients must re-pair', async () => {
    const { env, kv, syncCalls } = await setup({
      syncFetch: async (_name, request) => {
        const path = new URL(request.url).pathname
        if (path === '/devices' && request.method === 'GET')
          return Response.json([{ clientId: 'c1' }])
        return new Response(null, { status: 204 })
      },
    })
    await addTestUser(env, { name: 'alice', password: 'pw12345678' })
    kv.store.set('client:c1', 'alice')
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/alice/reset-password',
      authed(cookie, {
        method: 'POST',
        ...json({ password: 'newpassword' }),
      }),
      env,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, devicesRemoved: true })
    expect((await getUser(env, 'alice'))?.passwordHash).toBe(
      toMD5('newpassword'),
    )
    expect(kv.store.has('client:c1')).toBe(false)
    expect(
      syncCalls.some((call) => call.request.url.endsWith('/unbind-all')),
    ).toBe(true)
  })

  it('keeps devices when removeDevices is false', async () => {
    const { env, kv } = await setup()
    await addTestUser(env, { name: 'alice', password: 'pw12345678' })
    kv.store.set('client:c1', 'alice')
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/alice/reset-password',
      authed(cookie, {
        method: 'POST',
        ...json({ password: 'newpassword', removeDevices: false }),
      }),
      env,
    )

    expect(res.status).toBe(200)
    expect(kv.store.get('client:c1')).toBe('alice')
  })
})

describe('admin account deletion and orphan handling', () => {
  const deleteAlice = async (env: LX.Env, cookie: string) => {
    const res = await app.request(
      '/api/admin/users/alice',
      authed(cookie, { method: 'DELETE' }),
      env,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ orphaned: true })
  }

  it('tombstones the account, clears KV mappings and unbinds devices', async () => {
    const { env, kv, syncCalls } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) => {
        const path = new URL(request.url).pathname
        if (path === '/devices' && request.method === 'GET')
          return Response.json([{ clientId: 'c1' }])
        if (path === '/data-status')
          return Response.json({ list: null, dislike: null })
        return new Response(null, { status: 204 })
      },
    })
    kv.store.set('client:c1', 'alice')
    const cookie = await login(env)

    await deleteAlice(env, cookie)

    expect(await getUser(env, 'alice')).toBeNull()
    expect(kv.store.has('client:c1')).toBe(false)
    expect(
      syncCalls.some((call) => call.request.url.endsWith('/unbind-all')),
    ).toBe(true)
    const tombstones = await listTombstones(env)
    expect(tombstones.map((tombstone) => tombstone.name)).toEqual(['alice'])
  })

  it('refuses to delete a pending account', async () => {
    const { env } = await setup()
    await addTestUser(env, {
      name: 'waiting',
      password: 'pw12345678',
      status: 'pending',
      source: 'self',
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/waiting',
      authed(cookie, { method: 'DELETE' }),
      env,
    )
    expect(res.status).toBe(409)
  })

  it('lists orphans with live data status and restores them', async () => {
    const { env } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) => {
        if (new URL(request.url).pathname === '/data-status')
          return Response.json({
            list: { latest: 'abc', time: 1, snapshotCount: 3 },
            dislike: null,
          })
        if (new URL(request.url).pathname === '/devices')
          return Response.json([])
        return new Response(null, { status: 204 })
      },
    })
    const cookie = await login(env)
    await deleteAlice(env, cookie)

    const orphans = await app.request('/api/admin/orphans', authed(cookie), env)
    expect(orphans.status).toBe(200)
    expect(await orphans.json()).toEqual([
      {
        name: 'alice',
        deletedAt: expect.any(Number),
        source: 'imported',
        dataStatus: {
          list: { latest: 'abc', time: 1, snapshotCount: 3 },
          dislike: null,
        },
      },
    ])

    const restore = await app.request(
      '/api/admin/orphans/alice/restore',
      authed(cookie, {
        method: 'POST',
        ...json({ password: 'restoredpassword' }),
      }),
      env,
    )
    expect(restore.status).toBe(201)
    expect(await getUser(env, 'alice')).toMatchObject({
      status: 'active',
      source: 'imported',
      passwordHash: toMD5('restoredpassword'),
    })
    expect(await listTombstones(env)).toHaveLength(0)
  })

  it('purges orphaned data only with a matching confirmName', async () => {
    const { env, syncCalls } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const cookie = await login(env)
    await deleteAlice(env, cookie)

    const mismatch = await app.request(
      '/api/admin/orphans/alice',
      authed(cookie, { method: 'DELETE', ...json({ confirmName: 'other' }) }),
      env,
    )
    expect(mismatch.status).toBe(400)

    const purged = await app.request(
      '/api/admin/orphans/alice',
      authed(cookie, { method: 'DELETE', ...json({ confirmName: 'alice' }) }),
      env,
    )
    expect(purged.status).toBe(200)
    expect(await purged.json()).toEqual({ purged: true })
    expect(
      syncCalls.some(
        (call) =>
          call.request.method === 'POST' && call.request.url.endsWith('/purge'),
      ),
    ).toBe(true)
    expect(await listTombstones(env)).toHaveLength(0)
  })
})

describe('admin failure propagation', () => {
  it('answers 502 when the DO refuses to unbind devices on password reset', async () => {
    const { env } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) => {
        const path = new URL(request.url).pathname
        if (path === '/devices') return Response.json([{ clientId: 'c1' }])
        if (path === '/unbind-all') return new Response('boom', { status: 500 })
        return new Response(null, { status: 204 })
      },
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/alice/reset-password',
      authed(cookie, {
        method: 'POST',
        ...json({ password: 'newpassword' }),
      }),
      env,
    )

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({
      passwordChanged: true,
      devicesRemoved: false,
    })
  })

  it('answers 502 when disable cannot drop live connections', async () => {
    const { env } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) => {
        if (new URL(request.url).pathname === '/kick')
          return new Response('boom', { status: 500 })
        return Response.json([])
      },
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/alice/disable',
      authed(cookie, { method: 'POST' }),
      env,
    )

    expect(res.status).toBe(502)
    expect((await getUser(env, 'alice'))?.status).toBe('disabled')
  })

  it('answers 502 with a partial marker when deletion cannot unbind devices', async () => {
    const { env } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) => {
        const path = new URL(request.url).pathname
        if (path === '/devices') return Response.json([])
        if (path === '/unbind-all') return new Response('boom', { status: 500 })
        return new Response(null, { status: 204 })
      },
    })
    const cookie = await login(env)

    const res = await app.request(
      '/api/admin/users/alice',
      authed(cookie, { method: 'DELETE' }),
      env,
    )

    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({
      orphaned: true,
      devicesUnbound: false,
    })
    expect(await listTombstones(env)).toHaveLength(1)
  })

  it('rate-limits admin login attempts', async () => {
    const { env } = await setup({
      rateLimiter: { limit: async () => ({ success: false }) },
    })

    const res = await app.request(
      '/api/admin/login',
      { method: 'POST', ...json({ password: ADMIN_PASSWORD }) },
      env,
    )

    expect(res.status).toBe(403)
  })
})

describe('admin device management', () => {
  it('lists devices and deletes a single one', async () => {
    const { env, kv } = await setup({
      users: [{ name: 'alice', password: 'pw12345678' }],
      syncFetch: async (_name, request) => {
        const path = new URL(request.url).pathname
        if (path === '/devices' && request.method === 'GET')
          return Response.json([
            { clientId: 'c1', deviceName: 'phone', isMobile: true },
          ])
        if (path.startsWith('/devices/') && request.method === 'DELETE')
          return new Response(null, { status: 204 })
        return new Response(null, { status: 204 })
      },
    })
    kv.store.set('client:c1', 'alice')
    const cookie = await login(env)

    const list = await app.request(
      '/api/admin/users/alice/devices',
      authed(cookie),
      env,
    )
    expect(await list.json()).toEqual([
      { clientId: 'c1', deviceName: 'phone', isMobile: true },
    ])

    const removed = await app.request(
      '/api/admin/users/alice/devices/c1',
      authed(cookie, { method: 'DELETE' }),
      env,
    )
    expect(removed.status).toBe(204)
    expect(kv.store.has('client:c1')).toBe(false)
  })
})

describe('admin registration settings', () => {
  it('reads and updates the registration mode', async () => {
    const { env } = await setup()
    const cookie = await login(env)

    const initial = await app.request(
      '/api/admin/settings',
      authed(cookie),
      env,
    )
    expect(await initial.json()).toEqual({ registrationMode: 'approval' })

    const updated = await app.request(
      '/api/admin/settings',
      authed(cookie, {
        method: 'PATCH',
        ...json({ registrationMode: 'open' }),
      }),
      env,
    )
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ registrationMode: 'open' })

    const invalid = await app.request(
      '/api/admin/settings',
      authed(cookie, {
        method: 'PATCH',
        ...json({ registrationMode: 'sometimes' }),
      }),
      env,
    )
    expect(invalid.status).toBe(400)
  })
})

describe('admin build info', () => {
  const BUILD_COMMIT = '9f8e7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c'

  it('requires a session like every other protected endpoint', async () => {
    const { env } = await setup()

    const res = await app.request('/api/admin/build-info', {}, env)
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'unauthorized' })
  })

  it('returns the injected build metadata verbatim', async () => {
    const { env } = await setup()
    env.BUILD_VERSION = '1.0.0'
    env.BUILD_COMMIT = BUILD_COMMIT
    env.BUILD_TIME = '2026-10-21T06:47:30Z'
    const cookie = await login(env)

    const res = await app.request('/api/admin/build-info', authed(cookie), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      version: '1.0.0',
      commit: BUILD_COMMIT,
      builtAt: '2026-10-21T06:47:30Z',
    })
  })

  it('passes the composite display version through verbatim', async () => {
    // The deploy workflow now injects the full display string
    // v{version}-{commit count}-{7-char sha}; the endpoint must not reformat it.
    const { env } = await setup()
    env.BUILD_VERSION = 'v1.3.1-2-abc1234'
    env.BUILD_COMMIT = BUILD_COMMIT
    env.BUILD_TIME = '2026-10-21T06:47:30Z'
    const cookie = await login(env)

    const res = await app.request('/api/admin/build-info', authed(cookie), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      version: 'v1.3.1-2-abc1234',
      commit: BUILD_COMMIT,
      builtAt: '2026-10-21T06:47:30Z',
    })
  })

  it('falls back to dev/null when nothing was injected', async () => {
    const { env } = await setup()
    const cookie = await login(env)

    const res = await app.request('/api/admin/build-info', authed(cookie), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      version: 'dev',
      commit: 'dev',
      builtAt: null,
    })
  })

  it('treats blank values as not injected', async () => {
    const { env } = await setup()
    env.BUILD_VERSION = '  '
    env.BUILD_COMMIT = ''
    env.BUILD_TIME = '   '
    const cookie = await login(env)

    const res = await app.request('/api/admin/build-info', authed(cookie), env)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      version: 'dev',
      commit: 'dev',
      builtAt: null,
    })
  })
})
