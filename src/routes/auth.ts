import { Hono } from 'hono'
import { SYNC_CODE } from '@/constants'
import { aesDecrypt } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import { isRateLimited } from '@/utils/rateLimit'

const app = new Hono<{ Bindings: LX.Env }>()

const getIP = (c: { req: { raw: Request } }) => {
  return (
    c.req.raw.headers.get('cf-connecting-ip') ??
    c.req.raw.headers.get('x-forwarded-for') ??
    'unknown'
  )
}

const parseUsers = (raw: string): LX.User[] | null => {
  try {
    return JSON.parse(raw || '[]')
  } catch (err) {
    console.error('invalid LX_USERS:', err)
    return null
  }
}

app.get('/ah', async (c) => {
  const ip = getIP(c)
  if (await isRateLimited(c.env, ip)) return c.text(SYNC_CODE.msgBlockedIp, 403)

  const encryptedMsg = c.req.header('m')
  const clientId = c.req.header('i')

  if (!encryptedMsg) {
    return c.text(SYNC_CODE.msgAuthFailed, 401)
  }

  const users = parseUsers(c.env.LX_USERS)
  if (!users) return c.text('Server Misconfigured', 500)
  const serverName = c.env.SERVER_NAME || 'LX Music Server'
  const kv = c.env.KV

  // 已知设备重新认证
  if (clientId) {
    const userName = await kv.get(`client:${clientId}`)
    if (!userName) {
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
      return c.text(SYNC_CODE.msgAuthFailed, 401)
    }
    return c.text(await resp.text())
  }

  for (const userInfo of users) {
    const keySeed = getKeySeed(userInfo)
    if (!keySeed) continue
    const key = btoa(keySeed)
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
      return c.text(SYNC_CODE.msgAuthFailed, 401)
    }

    const result = await resp.json<{
      encrypted: string
      clientId: string
      userName: string
    }>()
    await kv.put(`client:${result.clientId}`, result.userName)
    return c.text(result.encrypted)
  }

  return c.text(SYNC_CODE.msgAuthFailed, 401)
})

export default app
