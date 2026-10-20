import type { Context } from 'hono'
import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import {
  ADMIN_COOKIE_NAME,
  createAdminSession,
  getAdminPasswordHash,
  verifyAdminPassword,
  verifyAdminSession,
} from '@/admin/auth'
import {
  createUser,
  getSettings,
  getUser,
  listTombstones,
  listUsers,
  removeTombstone,
  removeUser,
  restoreUser,
  tombstoneUser,
  transitionUser,
  updateSettings,
  updateUser,
} from '@/registry/client'
import {
  DEFAULT_ADD_MUSIC_LOCATION_TYPE,
  DEFAULT_MAX_SNAPSHOT_NUM,
} from '@/registry/constants'
import {
  isAddMusicLocationType,
  isRegistrationMode,
  isReservedName,
  isValidMaxSnapshotNum,
  validatePassword,
  validateUsername,
} from '@/registry/validate'
import { toMD5 } from '@/utils/crypto'
import { isRateLimited } from '@/utils/rateLimit'
import { getClientIp, readJsonBody } from '@/utils/request'

const app = new Hono<{ Bindings: LX.Env }>()

// Registry results carry a numeric status; Hono's JSON helper wants the literal
// status-code union.
const asStatus = (status: number): ContentfulStatusCode =>
  status as ContentfulStatusCode

interface AdminUserView {
  name: string
  status: LX.UserStatus
  source: LX.UserSource
  createdAt: number
  maxSnapshotNum: number
  addMusicLocationType: LX.AddMusicLocationType
  deviceCount: number | null
}

interface DataStatusSummary {
  latest: string
  time: number
  snapshotCount: number
}

const callUserDo = async (
  env: LX.Env,
  name: string,
  path: string,
  init?: RequestInit,
): Promise<Response> => {
  const stub = env.USER_SYNC.get(env.USER_SYNC.idFromName(name))
  return stub.fetch(`https://do${path}`, init)
}

// The DO answers 503 while a user space has never been initialized (pending or
// brand-new accounts), which for admin purposes means "no devices".
const fetchUserDevices = async (
  env: LX.Env,
  name: string,
): Promise<LX.Sync.KeyInfo[] | null> => {
  try {
    const resp = await callUserDo(env, name, '/devices')
    if (resp.status === 503) return []
    if (!resp.ok) return null
    return (await resp.json()) as LX.Sync.KeyInfo[]
  } catch (err) {
    console.error('device list failed:', err)
    return null
  }
}

const fetchDataStatus = async (
  env: LX.Env,
  name: string,
): Promise<{
  list: DataStatusSummary | null
  dislike: DataStatusSummary | null
} | null> => {
  try {
    const resp = await callUserDo(env, name, '/data-status')
    if (!resp.ok) return null
    return (await resp.json()) as {
      list: DataStatusSummary | null
      dislike: DataStatusSummary | null
    }
  } catch (err) {
    console.error('data status failed:', err)
    return null
  }
}

const toView = (
  user: LX.RegistryUser,
  deviceCount: number | null,
): AdminUserView => ({
  name: user.name,
  status: user.status,
  source: user.source,
  createdAt: user.createdAt,
  maxSnapshotNum: user.maxSnapshotNum ?? DEFAULT_MAX_SNAPSHOT_NUM,
  addMusicLocationType:
    user['list.addMusicLocationType'] ?? DEFAULT_ADD_MUSIC_LOCATION_TYPE,
  deviceCount,
})

// Delete every KV client mapping and unbind every device, keeping the DO's
// sync data. Shared by account deletion and forced re-pairing on password
// reset.
const unbindAllDevices = async (env: LX.Env, name: string) => {
  const devices = await fetchUserDevices(env, name)
  if (devices) {
    for (const device of devices) {
      await env.KV.delete(`client:${device.clientId}`)
    }
  }
  try {
    await callUserDo(env, name, '/unbind-all', { method: 'POST' })
  } catch (err) {
    console.error('unbind-all failed:', err)
  }
}

const kickUser = async (env: LX.Env, name: string) => {
  try {
    await callUserDo(env, name, '/kick', { method: 'POST' })
  } catch (err) {
    console.error('kick failed:', err)
  }
}

const purgeUserData = async (env: LX.Env, name: string): Promise<boolean> => {
  try {
    const resp = await callUserDo(env, name, '/purge', { method: 'POST' })
    return resp.ok
  } catch (err) {
    console.error('purge failed:', err)
    return false
  }
}

const parseUserConfig = (
  body: Record<string, unknown>,
):
  | { error: string }
  | {
      maxSnapshotNum?: number
      'list.addMusicLocationType'?: LX.AddMusicLocationType
    } => {
  const config: {
    maxSnapshotNum?: number
    'list.addMusicLocationType'?: LX.AddMusicLocationType
  } = {}
  if (body.maxSnapshotNum !== undefined) {
    if (!isValidMaxSnapshotNum(body.maxSnapshotNum))
      return { error: 'maxSnapshotNum must be an integer between 1 and 100' }
    config.maxSnapshotNum = body.maxSnapshotNum
  }
  if (body.addMusicLocationType !== undefined) {
    if (!isAddMusicLocationType(body.addMusicLocationType))
      return { error: 'addMusicLocationType must be top or bottom' }
    config['list.addMusicLocationType'] = body.addMusicLocationType
  }
  return config
}

const hasError = (value: object): value is { error: string } => 'error' in value

// Unconfigured deployments expose nothing: no panel, no admin API.
app.use('/api/admin/*', async (c, next) => {
  if (!getAdminPasswordHash(c.env)) return c.notFound()
  await next()
})

app.use('/api/admin/*', async (c, next) => {
  if (c.req.path === '/api/admin/login') return next()
  const authorized = await verifyAdminSession(
    c.env,
    getCookie(c, ADMIN_COOKIE_NAME),
  )
  if (!authorized) return c.json({ error: 'unauthorized' }, 401)
  await next()
})

app.post('/api/admin/login', async (c) => {
  const ip = getClientIp(c)
  if (await isRateLimited(c.env, `admin:${ip}`))
    return c.json({ error: 'blocked' }, 403)

  const body = await readJsonBody(c)
  const password = typeof body.password === 'string' ? body.password : ''
  if (!password || !(await verifyAdminPassword(c.env, password)))
    return c.json({ error: 'invalid credentials' }, 401)

  const session = await createAdminSession(c.env)
  if (!session) return c.json({ error: 'not configured' }, 404)

  setCookie(c, ADMIN_COOKIE_NAME, session.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    path: '/',
    maxAge: session.maxAge,
  })
  return c.json({ ok: true })
})

app.post('/api/admin/logout', (c) => {
  deleteCookie(c, ADMIN_COOKIE_NAME, { path: '/' })
  return c.body(null, 204)
})

app.get('/api/admin/users', async (c) => {
  const users = await listUsers(c.env)
  const views = await Promise.all(
    users.map(async (user) => {
      const devices = await fetchUserDevices(c.env, user.name)
      return toView(user, devices === null ? null : devices.length)
    }),
  )
  return c.json({ users: views })
})

app.post('/api/admin/users', async (c) => {
  const body = await readJsonBody(c)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  const nameError = validateUsername(name)
  if (nameError) return c.json({ error: nameError }, 400)
  if (isReservedName(name))
    return c.json({ error: 'username unavailable' }, 409)
  const passwordError = validatePassword(password)
  if (passwordError) return c.json({ error: passwordError }, 400)
  const config = parseUserConfig(body)
  if (hasError(config)) return c.json({ error: config.error }, 400)

  const result = await createUser(c.env, {
    name,
    passwordHash: toMD5(password),
    status: 'active',
    source: 'admin',
    ...config,
  })
  if (!result.ok)
    return c.json({ error: 'username unavailable' }, asStatus(result.status))
  return c.json({ user: toView(result.data.user, 0) }, 201)
})

app.patch('/api/admin/users/:name', async (c) => {
  const name = c.req.param('name')
  const body = await readJsonBody(c)
  const config = parseUserConfig(body)
  if (hasError(config)) return c.json({ error: config.error }, 400)
  if (Object.keys(config).length === 0)
    return c.json({ error: 'nothing to update' }, 400)

  const result = await updateUser(c.env, name, config)
  if (!result.ok)
    return c.json({ error: 'user not found' }, asStatus(result.status))
  const devices = await fetchUserDevices(c.env, name)
  return c.json({
    user: toView(result.data.user, devices === null ? null : devices.length),
  })
})

app.post('/api/admin/users/:name/reset-password', async (c) => {
  const name = c.req.param('name')
  const body = await readJsonBody(c)
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordError = validatePassword(password)
  if (passwordError) return c.json({ error: passwordError }, 400)

  const result = await updateUser(c.env, name, {
    passwordHash: toMD5(password),
  })
  if (!result.ok)
    return c.json({ error: 'user not found' }, asStatus(result.status))

  // Paired devices re-authenticate with their device key, not the password, so
  // a password reset alone does not revoke them. Removing devices is therefore
  // the default and the panel spells this out in its confirmation copy.
  const removeDevices = body.removeDevices !== false
  if (removeDevices) await unbindAllDevices(c.env, name)
  return c.json({ ok: true, devicesRemoved: removeDevices })
})

const transition = async (
  c: Context<{ Bindings: LX.Env }>,
  name: string,
  status: LX.UserStatus,
  from: LX.UserStatus[],
) => {
  const result = await transitionUser(c.env, name, status, from)
  if (!result.ok)
    return c.json(
      { error: result.status === 404 ? 'user not found' : 'invalid state' },
      asStatus(result.status),
    )
  if (status === 'disabled') await kickUser(c.env, name)
  const devices = await fetchUserDevices(c.env, name)
  return c.json({
    user: toView(result.data.user, devices === null ? null : devices.length),
  })
}

app.post('/api/admin/users/:name/approve', (c) =>
  transition(c, c.req.param('name'), 'active', ['pending']),
)

app.post('/api/admin/users/:name/disable', (c) =>
  transition(c, c.req.param('name'), 'disabled', ['active']),
)

app.post('/api/admin/users/:name/enable', (c) =>
  transition(c, c.req.param('name'), 'active', ['disabled']),
)

// Rejecting an application leaves no tombstone: a pending account never
// initialized its DO, so there is no data to preserve or clean up.
app.post('/api/admin/users/:name/reject', async (c) => {
  const name = c.req.param('name')
  const result = await removeUser(c.env, name, 'pending')
  if (!result.ok)
    return c.json(
      { error: result.status === 404 ? 'user not found' : 'invalid state' },
      asStatus(result.status),
    )
  return c.json({ ok: true })
})

// Step one of deletion: account gone, sync data kept, name reserved.
app.delete('/api/admin/users/:name', async (c) => {
  const name = c.req.param('name')
  const user = await getUser(c.env, name)
  if (!user) return c.json({ error: 'user not found' }, 404)
  if (user.status === 'pending')
    return c.json({ error: 'pending users have no data; reject instead' }, 409)

  const result = await tombstoneUser(c.env, name)
  if (!result.ok)
    return c.json({ error: 'user not found' }, asStatus(result.status))

  await unbindAllDevices(c.env, name)
  return c.json({ orphaned: true })
})

app.get('/api/admin/users/:name/devices', async (c) => {
  const devices = await fetchUserDevices(c.env, c.req.param('name'))
  if (devices === null) return c.json({ error: 'user data unavailable' }, 502)
  return c.json(devices)
})

app.delete('/api/admin/users/:name/devices/:clientId', async (c) => {
  const name = c.req.param('name')
  const clientId = c.req.param('clientId')
  let resp: Response
  try {
    resp = await callUserDo(
      c.env,
      name,
      `/devices/${encodeURIComponent(clientId)}`,
      { method: 'DELETE' },
    )
  } catch (err) {
    console.error('device delete failed:', err)
    return c.json({ error: 'user data unavailable' }, 502)
  }

  if (resp.status === 204) await c.env.KV.delete(`client:${clientId}`)
  return new Response(null, { status: resp.status })
})

app.get('/api/admin/orphans', async (c) => {
  const tombstones = await listTombstones(c.env)
  const items = await Promise.all(
    tombstones.map(async (tombstone) => ({
      name: tombstone.name,
      deletedAt: tombstone.deletedAt,
      source: tombstone.source,
      dataStatus: await fetchDataStatus(c.env, tombstone.name),
    })),
  )
  return c.json(items)
})

app.post('/api/admin/orphans/:name/restore', async (c) => {
  const name = c.req.param('name')
  const body = await readJsonBody(c)
  const password = typeof body.password === 'string' ? body.password : ''
  const passwordError = validatePassword(password)
  if (passwordError) return c.json({ error: passwordError }, 400)

  const result = await restoreUser(c.env, name, toMD5(password))
  if (!result.ok)
    return c.json(
      { error: result.status === 404 ? 'not found' : 'conflict' },
      asStatus(result.status),
    )
  return c.json({ user: toView(result.data.user, 0) }, 201)
})

// Step two of deletion: irreversible wipe of the orphaned DO. Guarded by a
// full-name confirmation because nothing can be recovered afterwards.
app.delete('/api/admin/orphans/:name', async (c) => {
  const name = c.req.param('name')
  const body = await readJsonBody(c)
  if (body.confirmName !== name)
    return c.json({ error: 'confirmName does not match' }, 400)

  const tombstones = await listTombstones(c.env)
  if (!tombstones.some((tombstone) => tombstone.name === name))
    return c.json({ error: 'not found' }, 404)

  if (!(await purgeUserData(c.env, name)))
    return c.json({ error: 'failed to purge user data' }, 502)

  const removed = await removeTombstone(c.env, name)
  if (!removed.ok)
    return c.json({ error: 'not found' }, asStatus(removed.status))
  return c.json({ purged: true })
})

app.get('/api/admin/settings', async (c) => {
  return c.json(await getSettings(c.env))
})

app.patch('/api/admin/settings', async (c) => {
  const body = await readJsonBody(c)
  if (!isRegistrationMode(body.registrationMode))
    return c.json({ error: 'invalid registrationMode' }, 400)
  const result = await updateSettings(c.env, body.registrationMode)
  if (!result.ok)
    return c.json({ error: 'invalid settings' }, asStatus(result.status))
  return c.json(result.data)
})

export default app
