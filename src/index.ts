import { Hono } from 'hono'
import { SYNC_CODE } from '@/constants'
import adminRoutes from '@/routes/admin'
import authRoutes from '@/routes/auth'
import devicesRoutes from '@/routes/devices'
import helloRoutes from '@/routes/hello'
import registerRoutes from '@/routes/register'

export { UserRegistryDO } from '@/durable/UserRegistryDO'
export { UserSyncDO } from '@/durable/UserSyncDO'

const app = new Hono<{ Bindings: LX.Env }>()

app.route('/', helloRoutes)
app.route('/', authRoutes)
app.route('/', devicesRoutes)
app.route('/', registerRoutes)
app.route('/', adminRoutes)

// WebSocket upgrade → UserSyncDO
app.get('/socket', async (c) => {
  const upgradeHeader = c.req.header('upgrade')
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return c.text('Expected WebSocket', 426)
  }

  const clientId = c.req.query('i')
  const token = c.req.query('t')

  if (!clientId || !token) {
    return c.text(SYNC_CODE.msgAuthFailed, 401)
  }

  // clientId → userName via KV
  const userName = await c.env.KV.get(`client:${clientId}`)
  if (!userName) {
    return c.text(SYNC_CODE.msgAuthFailed, 401)
  }

  const doId = c.env.USER_SYNC.idFromName(userName)
  const doStub = c.env.USER_SYNC.get(doId)

  // 转发 WebSocket upgrade 到 DO
  return doStub.fetch(
    new Request(
      `https://do/ws?i=${encodeURIComponent(clientId)}&t=${encodeURIComponent(token)}`,
      {
        headers: c.req.raw.headers,
      },
    ),
  )
})

export default app
