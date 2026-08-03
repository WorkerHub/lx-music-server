import { Hono } from 'hono'

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
  const user = users.find((u) => u.name === username && u.password === password)
  return user ? user.name : null
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
