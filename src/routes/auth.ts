import { Hono } from 'hono'
import { SYNC_CODE } from '@/constants'
import { aesDecrypt } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import { isRateLimited } from '@/utils/rateLimit'

const app = new Hono<{ Bindings: LX.Env }>()

const getIP = (c: { req: { raw: Request } }) => {
  // Cloudflare always sets cf-connecting-ip on edge traffic; it is the only
  // header we trust for rate limiting. x-forwarded-for is removed because a
  // client can spoof it to rotate rate-limit buckets (REVIEW L1). In local
  // `wrangler dev` the header is absent and every request keys on "unknown",
  // which is acceptable because the dev fallback limiter is in-memory and
  // per-machine anyway.
  return c.req.raw.headers.get('cf-connecting-ip') ?? 'unknown'
}

const parseUsers = (raw: string): LX.User[] | null => {
  try {
    return JSON.parse(raw || '[]')
  } catch (err) {
    console.error('invalid LX_USERS:', err)
    return null
  }
}

// `client:{id}` → userName 映射的 TTL（秒）。365 天，设备重新认证时续期，
// 避免被删除外的所有路径留下永不过期的孤儿映射（REVIEW M5）。
const CLIENT_MAPPING_TTL_SECONDS = 365 * 24 * 60 * 60

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
      // 映射已过期（365 天 TTL）或被删除：客户端始终带 i 头、且不会自动回退到
      // 首次认证，这里只能返回 401。用户需在客户端重新输入密码走首次认证重新
      // 配对（会生成新的 clientId）。这是个人同步服务下可接受的权衡（REVIEW M5）。
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
    // 重新认证成功即续期映射，避免活跃设备因 TTL 到期而被判为未知。
    await kv.put(`client:${clientId}`, userName, {
      expirationTtl: CLIENT_MAPPING_TTL_SECONDS,
    })
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
      body: JSON.stringify({
        encryptedMsg,
        serverName,
        userName: userInfo.name,
      }),
    })
    if (!resp.ok) {
      return c.text(SYNC_CODE.msgAuthFailed, 401)
    }

    const result = await resp.json<{
      encrypted: string
      clientId: string
      userName: string
    }>()
    await kv.put(`client:${result.clientId}`, result.userName, {
      expirationTtl: CLIENT_MAPPING_TTL_SECONDS,
    })
    return c.text(result.encrypted)
  }

  return c.text(SYNC_CODE.msgAuthFailed, 401)
})

export default app
