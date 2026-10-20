import { UserRegistryDO } from '@/durable/UserRegistryDO'
import { createUser } from '@/registry/client'
import { toMD5 } from '@/utils/crypto'

// Shared test fixtures: an in-memory Durable Object storage/KV plus a real
// UserRegistryDO instance wired into LX.Env, so route and DO tests exercise the
// same code paths as production (seeding, atomic duplicate checks, ...).

export interface MemoryStorage extends DurableObjectStorage {
  data: Map<string, unknown>
}

export const createMemoryStorage = (): MemoryStorage => {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      data.set(key, value)
    },
    delete: async (key: string) => data.delete(key),
    deleteAll: async () => {
      data.clear()
    },
  } as unknown as MemoryStorage
}

export interface MemoryKV extends KVNamespace {
  store: Map<string, string>
}

export const createMemoryKV = (): MemoryKV => {
  const store = new Map<string, string>()
  return {
    store,
    get: async (key: string) => store.get(key) ?? null,
    put: async (key: string, value: string) => {
      store.set(key, value)
    },
    delete: async (key: string) => {
      store.delete(key)
    },
  } as unknown as MemoryKV
}

export interface TestEnvOptions {
  users?: LX.User[] | string
  adminPasswordHash?: string
  rateLimiter?: LX.RateLimiterBinding
  syncFetch?: (name: string, request: Request) => Promise<Response>
}

export interface TestEnvHarness {
  env: LX.Env
  kv: MemoryKV
  storage: MemoryStorage
  registry: UserRegistryDO
  syncCalls: Array<{ name: string; request: Request }>
}

export const createTestEnv = async (
  options: TestEnvOptions = {},
): Promise<TestEnvHarness> => {
  const kv = createMemoryKV()
  const storage = createMemoryStorage()
  const syncCalls: Array<{ name: string; request: Request }> = []
  const syncFetch =
    options.syncFetch ??
    (async () => new Response('Not Found', { status: 404 }))

  const env = {
    LX_USERS:
      typeof options.users === 'string'
        ? options.users
        : JSON.stringify(options.users ?? []),
    SERVER_NAME: 'test',
    KV: kv,
    LX_ADMIN_PASSWORD_HASH: options.adminPasswordHash,
    // Default to an always-allowing limiter so tests do not share the
    // module-level in-memory fallback counters.
    RATE_LIMITER: options.rateLimiter ?? {
      limit: async () => ({ success: true }),
    },
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

  env.USER_REGISTRY = {
    idFromName: () => ({}) as DurableObjectId,
    get: () =>
      ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          registry.fetch(new Request(input, init)),
      }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace

  env.USER_SYNC = {
    idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) =>
      ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const request = new Request(input, init)
          const name = (id as unknown as { name: string }).name
          syncCalls.push({ name, request })
          return syncFetch(name, request)
        },
      }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace

  return { env, kv, storage, registry, syncCalls }
}

export const addTestUser = async (
  env: LX.Env,
  input: {
    name: string
    password: string
    status?: LX.UserStatus
    source?: LX.UserSource
    maxSnapshotNum?: number
  },
): Promise<LX.RegistryUser> => {
  const result = await createUser(env, {
    name: input.name,
    passwordHash: toMD5(input.password),
    status: input.status ?? 'active',
    source: input.source ?? 'admin',
    ...(input.maxSnapshotNum !== undefined
      ? { maxSnapshotNum: input.maxSnapshotNum }
      : {}),
  })
  if (!result.ok)
    throw new Error(`failed to create test user: ${result.status}`)
  return result.data.user
}
