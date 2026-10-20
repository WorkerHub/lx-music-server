import { describe, expect, it } from 'vitest'
import { UserRegistryDO } from '@/durable/UserRegistryDO'
import { createMemoryStorage, type MemoryStorage } from '@/test/registryEnv'
import { toMD5 } from '@/utils/crypto'

const createRegistry = async (options: {
  users?: LX.User[]
  storage?: MemoryStorage
}) => {
  const storage = options.storage ?? createMemoryStorage()
  const env = {
    LX_USERS: JSON.stringify(options.users ?? []),
  } as unknown as LX.Env
  let init: Promise<void> = Promise.resolve()
  const state = {
    storage,
    blockConcurrencyWhile: (fn: () => Promise<void>) => {
      init = fn()
      return init
    },
  } as unknown as DurableObjectState

  const registry = new UserRegistryDO(state, env)
  await init
  return { registry, storage, env }
}

const call = (
  registry: UserRegistryDO,
  path: string,
  init?: RequestInit,
): Promise<Response> =>
  registry.fetch(
    new Request(`https://registry${path}`, {
      headers: { 'content-type': 'application/json' },
      ...init,
    }),
  )

const listUsers = async (registry: UserRegistryDO) => {
  const res = await call(registry, '/users')
  return ((await res.json()) as { users: LX.RegistryUser[] }).users
}

const createBody = (overrides: Record<string, unknown> = {}) => ({
  name: 'alice',
  passwordHash: toMD5('pw12345678'),
  status: 'active',
  source: 'admin',
  ...overrides,
})

describe('UserRegistryDO seeding', () => {
  it('imports LX_USERS once and converts plaintext passwords to MD5', async () => {
    const { registry } = await createRegistry({
      users: [{ name: 'legacy', password: 'pw12345678' }],
    })

    const users = await listUsers(registry)
    expect(users).toHaveLength(1)
    expect(users[0]).toMatchObject({
      name: 'legacy',
      passwordHash: toMD5('pw12345678'),
      status: 'active',
      source: 'imported',
    })
  })

  it('is idempotent and ignores later env changes', async () => {
    const storage = createMemoryStorage()
    await createRegistry({
      storage,
      users: [{ name: 'legacy', password: 'pw12345678' }],
    })
    const { registry } = await createRegistry({
      storage,
      users: [{ name: 'other', password: 'pw12345678' }],
    })

    const users = await listUsers(registry)
    expect(users.map((user) => user.name)).toEqual(['legacy'])
  })

  it('skips entries without a name or credential', async () => {
    const { registry } = await createRegistry({
      users: [
        { name: '', password: 'x' },
        { name: 'nopassword' },
        { name: 'ok', passwordHash: toMD5('pw12345678') },
      ],
    })

    expect((await listUsers(registry)).map((user) => user.name)).toEqual(['ok'])
  })
})

describe('UserRegistryDO uniqueness', () => {
  it('rejects duplicates, reserved names and tombstoned names with 409', async () => {
    const { registry } = await createRegistry({})
    expect(
      (
        await call(registry, '/users', {
          method: 'POST',
          body: JSON.stringify(createBody()),
        })
      ).status,
    ).toBe(201)

    const duplicate = await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody()),
    })
    expect(duplicate.status).toBe(409)

    const reserved = await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ name: '__server__' })),
    })
    expect(reserved.status).toBe(409)

    await call(registry, '/users/alice/tombstone', { method: 'POST' })
    const tombstoned = await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody()),
    })
    expect(tombstoned.status).toBe(409)
  })
})

describe('UserRegistryDO state machine', () => {
  it('only allows the expected transition', async () => {
    const { registry } = await createRegistry({})
    await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ status: 'pending', source: 'self' })),
    })

    const wrong = await call(registry, '/users/alice/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'disabled', from: ['active'] }),
    })
    expect(wrong.status).toBe(409)

    const approve = await call(registry, '/users/alice/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'active', from: ['pending'] }),
    })
    expect(approve.status).toBe(200)

    const again = await call(registry, '/users/alice/status', {
      method: 'POST',
      body: JSON.stringify({ status: 'active', from: ['pending'] }),
    })
    expect(again.status).toBe(409)
  })

  it('rejects pending accounts from the auth list', async () => {
    const { registry } = await createRegistry({})
    await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ name: 'pending', status: 'pending' })),
    })
    await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ name: 'active' })),
    })

    const res = await call(registry, '/users/auth')
    const body = (await res.json()) as {
      users: Array<{ name: string; passwordHash: string }>
    }
    expect(body.users.map((user) => user.name)).toEqual(['active'])
  })
})

describe('UserRegistryDO deletion semantics', () => {
  it('refuses to tombstone a pending account', async () => {
    const { registry } = await createRegistry({})
    await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ status: 'pending' })),
    })

    const res = await call(registry, '/users/alice/tombstone', {
      method: 'POST',
    })
    expect(res.status).toBe(409)
  })

  it('tombstones an account and restores it with the original source', async () => {
    const { registry } = await createRegistry({})
    await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ source: 'self' })),
    })

    const tombstoned = await call(registry, '/users/alice/tombstone', {
      method: 'POST',
    })
    expect(tombstoned.status).toBe(200)
    expect(await listUsers(registry)).toHaveLength(0)

    const restore = await call(registry, '/users/restore', {
      method: 'POST',
      body: JSON.stringify({
        name: 'alice',
        passwordHash: toMD5('newpassword'),
      }),
    })
    expect(restore.status).toBe(201)
    const restored = (await restore.json()) as { user: LX.RegistryUser }
    expect(restored.user).toMatchObject({
      name: 'alice',
      status: 'active',
      source: 'self',
    })

    const tombstones = await call(registry, '/tombstones')
    expect(
      ((await tombstones.json()) as { tombstones: unknown[] }).tombstones,
    ).toHaveLength(0)
  })

  it('hard-deletes a pending account for rejection without a tombstone', async () => {
    const { registry } = await createRegistry({})
    await call(registry, '/users', {
      method: 'POST',
      body: JSON.stringify(createBody({ status: 'pending' })),
    })

    const res = await call(registry, '/users/alice?expectStatus=pending', {
      method: 'DELETE',
    })
    expect(res.status).toBe(200)
    expect(await listUsers(registry)).toHaveLength(0)
    const tombstones = await call(registry, '/tombstones')
    expect(
      ((await tombstones.json()) as { tombstones: unknown[] }).tombstones,
    ).toHaveLength(0)
  })
})

describe('UserRegistryDO settings', () => {
  it('defaults to approval and persists a valid mode', async () => {
    const { registry } = await createRegistry({})

    const initial = await call(registry, '/settings')
    expect(await initial.json()).toEqual({ registrationMode: 'approval' })

    const invalid = await call(registry, '/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationMode: 'sometimes' }),
    })
    expect(invalid.status).toBe(400)

    const updated = await call(registry, '/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationMode: 'open' }),
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({ registrationMode: 'open' })
  })
})
