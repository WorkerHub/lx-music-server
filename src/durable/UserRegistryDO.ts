import {
  LAST_SEEN_WRITE_INTERVAL_MS,
  REGISTRY_SEEDED_KEY,
  REGISTRY_SETTINGS_KEY,
  REGISTRY_TOMBSTONES_KEY,
  REGISTRY_USERS_KEY,
} from '@/registry/constants'
import {
  isAddMusicLocationType,
  isRegistrationMode,
  isReservedName,
  isUserSource,
  isUserStatus,
  isValidMaxSnapshotNum,
  validateUsername,
} from '@/registry/validate'
import { resolveMD5 } from '@/utils/password'

const DEFAULT_SETTINGS: LX.RegistrySettings = { registrationMode: 'approval' }

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const parseSeedUsers = (raw: string | undefined): LX.User[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.error('invalid LX_USERS:', err)
    return []
  }
}

// A registry-backed replacement for the deploy-time `LX_USERS` secret. All
// reads/writes go through one DO instance (`__registry__`) so duplicate-name
// checks and writes are atomic, and newly registered users are visible
// immediately (KV is eventually consistent, D1 would need a new binding).
export class UserRegistryDO implements DurableObject {
  private state: DurableObjectState
  private env: LX.Env

  constructor(state: DurableObjectState, env: LX.Env) {
    this.state = state
    this.env = env
    this.state.blockConcurrencyWhile(async () => {
      await this.seed()
    })
  }

  // One-time import of the legacy `LX_USERS` secret. Once the `seeded` flag is
  // written, env no longer participates in auth: the registry is authoritative
  // so the two sources can never disagree.
  private async seed() {
    if (await this.state.storage.get<boolean>(REGISTRY_SEEDED_KEY)) return

    const existing =
      (await this.state.storage.get<LX.RegistryUser[]>(REGISTRY_USERS_KEY)) ??
      []
    const users = [...existing]
    const now = Date.now()
    for (const raw of parseSeedUsers(this.env.LX_USERS)) {
      const name = typeof raw?.name === 'string' ? raw.name : ''
      if (!name || users.some((u) => u.name === name)) continue
      const passwordHash = resolveMD5(raw)
      if (!passwordHash) continue
      users.push({
        name,
        passwordHash,
        status: 'active',
        source: 'imported',
        createdAt: now,
        ...(typeof raw.maxSnapshotNum === 'number'
          ? { maxSnapshotNum: raw.maxSnapshotNum }
          : {}),
        ...(isAddMusicLocationType(raw['list.addMusicLocationType'])
          ? { 'list.addMusicLocationType': raw['list.addMusicLocationType'] }
          : {}),
      })
    }

    await this.state.storage.put(REGISTRY_USERS_KEY, users)
    await this.state.storage.put(REGISTRY_SEEDED_KEY, true)
  }

  private async getUsers(): Promise<LX.RegistryUser[]> {
    return (
      (await this.state.storage.get<LX.RegistryUser[]>(REGISTRY_USERS_KEY)) ??
      []
    )
  }

  private async saveUsers(users: LX.RegistryUser[]) {
    await this.state.storage.put(REGISTRY_USERS_KEY, users)
  }

  private async getTombstones(): Promise<LX.RegistryTombstone[]> {
    return (
      (await this.state.storage.get<LX.RegistryTombstone[]>(
        REGISTRY_TOMBSTONES_KEY,
      )) ?? []
    )
  }

  private async saveTombstones(tombstones: LX.RegistryTombstone[]) {
    await this.state.storage.put(REGISTRY_TOMBSTONES_KEY, tombstones)
  }

  private async getSettings(): Promise<LX.RegistrySettings> {
    return (
      (await this.state.storage.get<LX.RegistrySettings>(
        REGISTRY_SETTINGS_KEY,
      )) ?? DEFAULT_SETTINGS
    )
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    if (path === '/users' && method === 'GET') return this.handleListUsers()
    if (path === '/users' && method === 'POST')
      return this.handleCreateUser(request)
    if (path === '/users/auth' && method === 'GET')
      return this.handleListAuthUsers()
    if (path === '/users/restore' && method === 'POST')
      return this.handleRestoreUser(request)
    if (path === '/tombstones' && method === 'GET')
      return this.handleListTombstones()
    if (path === '/settings' && method === 'GET')
      return json(await this.getSettings())
    if (path === '/settings' && method === 'PATCH')
      return this.handlePatchSettings(request)

    const statusMatch = path.match(/^\/users\/([^/]+)\/status$/)
    if (statusMatch && method === 'POST')
      return this.handleTransition(request, decodeURIComponent(statusMatch[1]))

    const lastSeenMatch = path.match(/^\/users\/([^/]+)\/last-seen$/)
    if (lastSeenMatch && method === 'POST')
      return this.handleTouchLastSeen(decodeURIComponent(lastSeenMatch[1]))

    const tombstoneMatch = path.match(/^\/users\/([^/]+)\/tombstone$/)
    if (tombstoneMatch && method === 'POST')
      return this.handleTombstone(decodeURIComponent(tombstoneMatch[1]))

    const userMatch = path.match(/^\/users\/([^/]+)$/)
    if (userMatch) {
      const name = decodeURIComponent(userMatch[1])
      if (method === 'GET') return this.handleGetUser(name)
      if (method === 'PATCH') return this.handleUpdateUser(request, name)
      if (method === 'DELETE')
        return this.handleDeleteUser(name, url.searchParams.get('expectStatus'))
    }

    const tombstoneNameMatch = path.match(/^\/tombstones\/([^/]+)$/)
    if (tombstoneNameMatch && method === 'DELETE')
      return this.handleDeleteTombstone(
        decodeURIComponent(tombstoneNameMatch[1]),
      )

    return new Response('Not Found', { status: 404 })
  }

  private async handleListUsers(): Promise<Response> {
    return json({ users: await this.getUsers() })
  }

  // Only active accounts may authenticate. Pending/disabled users are omitted
  // entirely so `/ah` cannot bind a device for them.
  private async handleListAuthUsers(): Promise<Response> {
    const users = (await this.getUsers())
      .filter((user) => user.status === 'active')
      .map((user) => ({
        name: user.name,
        passwordHash: resolveMD5(user),
      }))
      .filter(
        (user): user is { name: string; passwordHash: string } =>
          user.passwordHash !== null,
      )
    return json({ users })
  }

  private async handleGetUser(name: string): Promise<Response> {
    const user = (await this.getUsers()).find((u) => u.name === name)
    if (!user) return json({ error: 'user not found' }, 404)
    return json(user)
  }

  private async handleCreateUser(request: Request): Promise<Response> {
    const input = (await request.json()) as LX.RegistryUserInput
    const name = typeof input?.name === 'string' ? input.name : ''

    if (validateUsername(name) || isReservedName(name))
      return json({ error: 'username unavailable' }, 409)
    if (typeof input.passwordHash !== 'string' || !input.passwordHash)
      return json({ error: 'password hash required' }, 400)
    if (!isUserStatus(input.status))
      return json({ error: 'invalid status' }, 400)
    if (!isUserSource(input.source))
      return json({ error: 'invalid source' }, 400)
    if (
      input.maxSnapshotNum !== undefined &&
      !isValidMaxSnapshotNum(input.maxSnapshotNum)
    )
      return json({ error: 'invalid maxSnapshotNum' }, 400)
    if (
      input['list.addMusicLocationType'] !== undefined &&
      !isAddMusicLocationType(input['list.addMusicLocationType'])
    )
      return json({ error: 'invalid addMusicLocationType' }, 400)

    const users = await this.getUsers()
    const tombstones = await this.getTombstones()
    // Duplicate check and write happen in the same DO turn, so two concurrent
    // registrations for the same name cannot both succeed.
    if (
      users.some((u) => u.name === name) ||
      tombstones.some((t) => t.name === name)
    )
      return json({ error: 'username unavailable' }, 409)

    const user: LX.RegistryUser = {
      name,
      passwordHash: input.passwordHash,
      status: input.status,
      source: input.source,
      createdAt: Date.now(),
      ...(input.maxSnapshotNum !== undefined
        ? { maxSnapshotNum: input.maxSnapshotNum }
        : {}),
      ...(input['list.addMusicLocationType'] !== undefined
        ? { 'list.addMusicLocationType': input['list.addMusicLocationType'] }
        : {}),
    }
    users.push(user)
    await this.saveUsers(users)
    return json({ user }, 201)
  }

  private async handleUpdateUser(
    request: Request,
    name: string,
  ): Promise<Response> {
    const patch = (await request.json()) as Partial<LX.RegistryUser>
    if (
      patch.maxSnapshotNum !== undefined &&
      !isValidMaxSnapshotNum(patch.maxSnapshotNum)
    )
      return json({ error: 'invalid maxSnapshotNum' }, 400)
    if (
      patch['list.addMusicLocationType'] !== undefined &&
      !isAddMusicLocationType(patch['list.addMusicLocationType'])
    )
      return json({ error: 'invalid addMusicLocationType' }, 400)
    if (
      patch.passwordHash !== undefined &&
      (typeof patch.passwordHash !== 'string' || !patch.passwordHash)
    )
      return json({ error: 'invalid passwordHash' }, 400)

    const users = await this.getUsers()
    const index = users.findIndex((u) => u.name === name)
    if (index === -1) return json({ error: 'user not found' }, 404)

    const current = users[index]
    users[index] = {
      ...current,
      ...(patch.maxSnapshotNum !== undefined
        ? { maxSnapshotNum: patch.maxSnapshotNum }
        : {}),
      ...(patch['list.addMusicLocationType'] !== undefined
        ? { 'list.addMusicLocationType': patch['list.addMusicLocationType'] }
        : {}),
      ...(patch.passwordHash !== undefined
        ? { passwordHash: patch.passwordHash }
        : {}),
    }
    await this.saveUsers(users)
    return json({ user: users[index] })
  }

  private async handleTransition(
    request: Request,
    name: string,
  ): Promise<Response> {
    const body = (await request.json()) as {
      status?: unknown
      from?: unknown
    }
    if (!isUserStatus(body.status))
      return json({ error: 'invalid status' }, 400)
    const from = Array.isArray(body.from) ? body.from.filter(isUserStatus) : []

    const users = await this.getUsers()
    const index = users.findIndex((u) => u.name === name)
    if (index === -1) return json({ error: 'user not found' }, 404)
    if (!from.includes(users[index].status))
      return json({ error: 'invalid state transition' }, 409)

    users[index] = { ...users[index], status: body.status }
    await this.saveUsers(users)
    return json({ user: users[index] })
  }

  // Step one of account deletion: drop the account, keep the DO data, and
  // reserve the name via a tombstone so nobody else can inherit the data.
  // Called by `/ah` after a successful authentication of any kind. The write is
  // throttled to one per `LAST_SEEN_WRITE_INTERVAL_MS` per user, so a chatty
  // client does not rewrite the whole user list on every request; every call
  // still reports the stored value so callers can test the behaviour.
  private async handleTouchLastSeen(name: string): Promise<Response> {
    const users = await this.getUsers()
    const index = users.findIndex((u) => u.name === name)
    if (index === -1) return json({ error: 'user not found' }, 404)

    const now = Date.now()
    const lastSeenAt = users[index].lastSeenAt ?? null
    if (lastSeenAt !== null && now - lastSeenAt < LAST_SEEN_WRITE_INTERVAL_MS) {
      return json({ updated: false, lastSeenAt })
    }

    users[index] = { ...users[index], lastSeenAt: now }
    await this.saveUsers(users)
    return json({ updated: true, lastSeenAt: now })
  }

  private async handleTombstone(name: string): Promise<Response> {
    const users = await this.getUsers()
    const index = users.findIndex((u) => u.name === name)
    if (index === -1) return json({ error: 'user not found' }, 404)
    if (users[index].status === 'pending')
      return json({ error: 'pending users have no data; reject instead' }, 409)

    const [removed] = users.splice(index, 1)
    const tombstones = (await this.getTombstones()).filter(
      (t) => t.name !== name,
    )
    tombstones.push({
      name,
      deletedAt: Date.now(),
      source: removed.source,
    })
    await this.saveUsers(users)
    await this.saveTombstones(tombstones)
    return json({ tombstone: tombstones[tombstones.length - 1] })
  }

  private async handleDeleteUser(
    name: string,
    expectStatus: string | null,
  ): Promise<Response> {
    const users = await this.getUsers()
    const index = users.findIndex((u) => u.name === name)
    if (index === -1) return json({ error: 'user not found' }, 404)
    if (expectStatus && users[index].status !== expectStatus)
      return json({ error: 'invalid state transition' }, 409)

    users.splice(index, 1)
    await this.saveUsers(users)
    return json({ removed: true })
  }

  // Admin-only path: rebuild an account under a tombstoned name so its DO data
  // (playlists, snapshots) is picked up again.
  private async handleRestoreUser(request: Request): Promise<Response> {
    const body = (await request.json()) as {
      name?: unknown
      passwordHash?: unknown
      maxSnapshotNum?: unknown
      'list.addMusicLocationType'?: unknown
    }
    const name = typeof body.name === 'string' ? body.name : ''
    if (typeof body.passwordHash !== 'string' || !body.passwordHash)
      return json({ error: 'password hash required' }, 400)

    const tombstones = await this.getTombstones()
    const tombstone = tombstones.find((t) => t.name === name)
    if (!tombstone) return json({ error: 'tombstone not found' }, 404)

    const users = await this.getUsers()
    if (users.some((u) => u.name === name))
      return json({ error: 'username unavailable' }, 409)

    const user: LX.RegistryUser = {
      name,
      passwordHash: body.passwordHash,
      status: 'active',
      // Keep the original provenance so the panel can still tell where the
      // account came from.
      source: tombstone.source,
      createdAt: Date.now(),
      ...(isValidMaxSnapshotNum(body.maxSnapshotNum)
        ? { maxSnapshotNum: body.maxSnapshotNum }
        : {}),
      ...(isAddMusicLocationType(body['list.addMusicLocationType'])
        ? {
            'list.addMusicLocationType': body[
              'list.addMusicLocationType'
            ] as LX.AddMusicLocationType,
          }
        : {}),
    }
    users.push(user)
    await this.saveUsers(users)
    await this.saveTombstones(tombstones.filter((t) => t.name !== name))
    return json({ user }, 201)
  }

  private async handleListTombstones(): Promise<Response> {
    return json({ tombstones: await this.getTombstones() })
  }

  private async handleDeleteTombstone(name: string): Promise<Response> {
    const tombstones = await this.getTombstones()
    if (!tombstones.some((t) => t.name === name))
      return json({ error: 'tombstone not found' }, 404)
    await this.saveTombstones(tombstones.filter((t) => t.name !== name))
    return json({ removed: true })
  }

  private async handlePatchSettings(request: Request): Promise<Response> {
    const body = (await request.json()) as { registrationMode?: unknown }
    if (!isRegistrationMode(body.registrationMode))
      return json({ error: 'invalid registrationMode' }, 400)
    const settings: LX.RegistrySettings = {
      registrationMode: body.registrationMode,
    }
    await this.state.storage.put(REGISTRY_SETTINGS_KEY, settings)
    return json(settings)
  }
}
