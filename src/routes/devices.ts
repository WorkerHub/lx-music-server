import { Hono } from 'hono'
import { getUser } from '@/registry/client'
import { toMD5 } from '@/utils/crypto'
import { constantTimeEqual, resolveMD5 } from '@/utils/password'

const app = new Hono<{ Bindings: LX.Env }>()

const basicAuth = async (c: {
  req: { raw: Request }
  env: LX.Env
}): Promise<string | null> => {
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

  let user: LX.RegistryUser | null
  try {
    user = await getUser(c.env, username)
  } catch (err) {
    console.error('registry unavailable:', err)
    return null
  }
  // Pending/disabled accounts are rejected exactly like unknown ones.
  if (!user || user.status !== 'active') return null

  // Compare MD5 digests (both sides normalized to fixed-length) in constant
  // time so the stored password does not leak through timing.
  const providedMD5 = toMD5(password)
  const storedMD5 = resolveMD5(user)
  if (storedMD5 === null) return null
  return constantTimeEqual(providedMD5, storedMD5) ? user.name : null
}

app.get('/devices', async (c) => {
  const userName = await basicAuth(c)
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
  const userName = await basicAuth(c)
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
