import { Hono } from 'hono'
import { toMD5 } from '@/utils/crypto'
import { constantTimeEqual, resolveMD5 } from '@/utils/password'

const app = new Hono<{ Bindings: LX.Env }>()

const parseUsers = (raw: string): LX.User[] => {
  try {
    return JSON.parse(raw || '[]')
  } catch (err) {
    console.error('invalid LX_USERS:', err)
    return []
  }
}

const basicAuth = (c: {
  req: { raw: Request }
  env: LX.Env
}): string | null => {
  const authHeader = c.req.raw.headers.get('authorization')
  if (!authHeader?.startsWith('Basic ')) return null

  let decoded: string
  try {
    decoded = atob(authHeader.slice(6))
  } catch {
    return null
  }

  const sep = decoded.indexOf(':')
  if (sep === -1) return null
  const username = decoded.slice(0, sep)
  const password = decoded.slice(sep + 1)

  const users = parseUsers(c.env.LX_USERS)
  // Compare MD5 digests (both sides normalized to fixed-length) in constant
  // time so the stored password does not leak through timing. Supports both
  // plaintext `password` and precomputed `passwordHash` storage.
  const providedMD5 = toMD5(password)
  let matched: string | null = null
  for (const u of users) {
    if (u.name !== username) continue
    const storedMD5 = resolveMD5(u)
    if (storedMD5 === null) continue
    if (constantTimeEqual(providedMD5, storedMD5)) matched = u.name
  }
  return matched
}

app.get('/devices', async (c) => {
  const userName = basicAuth(c)
  if (!userName) {
    return c.text('Unauthorized', 401, {
      'www-authenticate': 'Basic realm="LX Music Server"',
    })
  }

  const doId = c.env.USER_SYNC.idFromName(userName)
  const doStub = c.env.USER_SYNC.get(doId)
  const resp = await doStub.fetch('https://do/devices')
  return new Response(resp.body, {
    status: resp.status,
    headers: { 'content-type': 'application/json' },
  })
})

app.delete('/devices/:clientId', async (c) => {
  const userName = basicAuth(c)
  if (!userName) {
    return c.text('Unauthorized', 401, {
      'www-authenticate': 'Basic realm="LX Music Server"',
    })
  }

  const clientId = c.req.param('clientId')

  const doId = c.env.USER_SYNC.idFromName(userName)
  const doStub = c.env.USER_SYNC.get(doId)
  const resp = await doStub.fetch(
    `https://do/devices/${encodeURIComponent(clientId)}`,
    { method: 'DELETE' },
  )

  // Remove mapping only after the owner-scoped DO deletion succeeds.
  if (resp.status === 204) {
    await c.env.KV.delete(`client:${clientId}`)
  }

  return new Response(null, { status: resp.status })
})

export default app
