import { REGISTRY_DO_NAME } from '@/registry/constants'

// Thin client over the registry DO. Every call goes through the single
// `__registry__` instance, which serializes duplicate-name checks and writes.
export type RegistryResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number }

const request = async (
  env: LX.Env,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const stub = env.USER_REGISTRY.get(
    env.USER_REGISTRY.idFromName(REGISTRY_DO_NAME),
  )
  return stub.fetch(
    new Request(`https://registry${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers as Record<string, string> | undefined),
      },
    }),
  )
}

const readJson = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T

const mutate = async <T>(response: Response): Promise<RegistryResult<T>> => {
  if (!response.ok) return { ok: false, status: response.status }
  return { ok: true, data: await readJson<T>(response) }
}

export const listUsers = async (env: LX.Env): Promise<LX.RegistryUser[]> => {
  const response = await request(env, '/users')
  if (!response.ok) throw new Error(`registry list failed: ${response.status}`)
  const body = await readJson<{ users: LX.RegistryUser[] }>(response)
  return body.users
}

export const listAuthUsers = async (
  env: LX.Env,
): Promise<Array<{ name: string; passwordHash: string }>> => {
  const response = await request(env, '/users/auth')
  if (!response.ok)
    throw new Error(`registry auth list failed: ${response.status}`)
  const body = await readJson<{
    users: Array<{ name: string; passwordHash: string }>
  }>(response)
  return body.users
}

export const getUser = async (
  env: LX.Env,
  name: string,
): Promise<LX.RegistryUser | null> => {
  const response = await request(env, `/users/${encodeURIComponent(name)}`)
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`registry get failed: ${response.status}`)
  return readJson<LX.RegistryUser>(response)
}

export const createUser = async (
  env: LX.Env,
  input: LX.RegistryUserInput,
): Promise<RegistryResult<{ user: LX.RegistryUser }>> => {
  return mutate(
    await request(env, '/users', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

export const updateUser = async (
  env: LX.Env,
  name: string,
  patch: {
    maxSnapshotNum?: number
    'list.addMusicLocationType'?: LX.AddMusicLocationType
    passwordHash?: string
  },
): Promise<RegistryResult<{ user: LX.RegistryUser }>> => {
  return mutate(
    await request(env, `/users/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  )
}

export const transitionUser = async (
  env: LX.Env,
  name: string,
  status: LX.UserStatus,
  from: LX.UserStatus[],
): Promise<RegistryResult<{ user: LX.RegistryUser }>> => {
  return mutate(
    await request(env, `/users/${encodeURIComponent(name)}/status`, {
      method: 'POST',
      body: JSON.stringify({ status, from }),
    }),
  )
}

export const tombstoneUser = async (
  env: LX.Env,
  name: string,
): Promise<RegistryResult<{ tombstone: LX.RegistryTombstone }>> => {
  return mutate(
    await request(env, `/users/${encodeURIComponent(name)}/tombstone`, {
      method: 'POST',
    }),
  )
}

export const removeUser = async (
  env: LX.Env,
  name: string,
  expectStatus?: LX.UserStatus,
): Promise<RegistryResult<{ removed: true }>> => {
  const query = expectStatus ? `?expectStatus=${expectStatus}` : ''
  return mutate(
    await request(env, `/users/${encodeURIComponent(name)}${query}`, {
      method: 'DELETE',
    }),
  )
}

export const restoreUser = async (
  env: LX.Env,
  name: string,
  passwordHash: string,
): Promise<RegistryResult<{ user: LX.RegistryUser }>> => {
  return mutate(
    await request(env, '/users/restore', {
      method: 'POST',
      body: JSON.stringify({ name, passwordHash }),
    }),
  )
}

export const listTombstones = async (
  env: LX.Env,
): Promise<LX.RegistryTombstone[]> => {
  const response = await request(env, '/tombstones')
  if (!response.ok)
    throw new Error(`registry tombstone list failed: ${response.status}`)
  const body = await readJson<{ tombstones: LX.RegistryTombstone[] }>(response)
  return body.tombstones
}

export const removeTombstone = async (
  env: LX.Env,
  name: string,
): Promise<RegistryResult<{ removed: true }>> => {
  return mutate(
    await request(env, `/tombstones/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),
  )
}

export const getSettings = async (
  env: LX.Env,
): Promise<LX.RegistrySettings> => {
  const response = await request(env, '/settings')
  if (!response.ok)
    throw new Error(`registry settings failed: ${response.status}`)
  return readJson<LX.RegistrySettings>(response)
}

export const updateSettings = async (
  env: LX.Env,
  registrationMode: LX.RegistrationMode,
): Promise<RegistryResult<LX.RegistrySettings>> => {
  return mutate(
    await request(env, '/settings', {
      method: 'PATCH',
      body: JSON.stringify({ registrationMode }),
    }),
  )
}
