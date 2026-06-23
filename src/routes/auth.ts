import { Hono } from 'hono'
import { SYNC_CODE } from '@/constants'
import { aesDecrypt, toMD5 } from '@/utils/crypto'

const app = new Hono<{ Bindings: LX.Env }>()

const getIP = (c: { req: { raw: Request } }) => {
  return (
    c.req.raw.headers.get('cf-connecting-ip') ??
    c.req.raw.headers.get('x-forwarded-for') ??
    'unknown'
  )
}

// In-memory rate limiting per IP (resets on Worker restart, sufficient as first-pass guard)
const ipFailures = new Map<string, { count: number; resetAt: number }>()
const RATE_LIMIT = 10
const RATE_WINDOW_MS = 60 * 1000

const checkRateLimit = (ip: string): boolean => {
  const now = Date.now()
  const entry = ipFailures.get(ip)
  if (!entry || entry.resetAt < now) return false
  return entry.count >= RATE_LIMIT
}

const recordFailure = (ip: string) => {
  const now = Date.now()
  const entry = ipFailures.get(ip)
  if (!entry || entry.resetAt < now) {
    ipFailures.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS })
  } else {
    entry.count++
  }
}

const clearFailures = (ip: string) => {
  ipFailures.delete(ip)
}

app.get('/ah', async (c) => {
  const ip = getIP(c)
  if (checkRateLimit(ip)) return c.text(SYNC_CODE.msgBlockedIp, 403)

  const encryptedMsg = c.req.header('m')
  const clientId = c.req.header('i')

  if (!encryptedMsg) {
    recordFailure(ip)
    return c.text(SYNC_CODE.msgAuthFailed, 401)
  }

  const users: LX.User[] = JSON.parse(c.env.LX_USERS || '[]')
  const serverName = c.env.SERVER_NAME || 'LX Music Server'
  const kv = c.env.KV

  // 已知设备重新认证
  if (clientId) {
    const userName = await kv.get(`client:${clientId}`)
    if (!userName) {
      recordFailure(ip)
      return c.text(SYNC_CODE.msgAuthFailed, 401)
    }

    const doId = c.env.USER_SYNC.idFromName(userName)
    const doStub = c.env.USER_SYNC.get(doId)

    const resp = await doStub.fetch('https://do/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ encryptedMsg, clientId, serverName }),
    })
    if (!resp.ok) {
      recordFailure(ip)
      return c.text(SYNC_CODE.msgAuthFailed, 401)
    }
    clearFailures(ip)
    return c.text(await resp.text())
  }

  for (const userInfo of users) {
    const keyHex = toMD5(userInfo.password).substring(0, 16)
    const key = btoa(keyHex)
    let text: string
    try {
      text = aesDecrypt(encryptedMsg, key)
    } catch (_e: any) {
      continue
    }
    if (!text.startsWith(SYNC_CODE.authMsg)) continue

    const doId = c.env.USER_SYNC.idFromName(userInfo.name)
    const doStub = c.env.USER_SYNC.get(doId)

    const resp = await doStub.fetch('https://do/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ encryptedMsg, serverName }),
    })
    if (!resp.ok) {
      recordFailure(ip)
      return c.text(SYNC_CODE.msgAuthFailed, 401)
    }

    const result = await resp.json<{
      encrypted: string
      clientId: string
      userName: string
    }>()
    await kv.put(`client:${result.clientId}`, result.userName)
    clearFailures(ip)
    return c.text(result.encrypted)
  }

  recordFailure(ip)
  return c.text(SYNC_CODE.msgAuthFailed, 401)
})

export default app
