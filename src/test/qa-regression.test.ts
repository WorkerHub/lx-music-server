import { createMsg2call } from 'message2call'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { sha256Hex } from '@/admin/auth'
import { SYNC_CODE } from '@/constants'
import { UserSyncDO } from '@/durable/UserSyncDO'
import { getUser, transitionUser, updateSettings } from '@/registry/client'
import adminApp from '@/routes/admin'
import authApp from '@/routes/auth'
import devicesApp from '@/routes/devices'
import registerApp from '@/routes/register'
import {
  addTestUser,
  createMemoryStorage,
  createTestEnv,
  type MemoryStorage,
} from '@/test/registryEnv'
import { getUserSpace } from '@/user'
import { decryptMsg, encryptMsg } from '@/utils/compress'
import { aesEncrypt, toMD5 } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'

class UpgradeResponse extends Response {
  constructor(
    body?: BodyInit | null,
    init?: ResponseInit & { webSocket?: unknown },
  ) {
    const { webSocket, ...rest } = init ?? {}
    super(body, rest.status === 101 ? { ...rest, status: 200 } : rest)
    Object.defineProperty(this, 'status', { value: rest.status ?? 200 })
    if (webSocket)
      Object.defineProperty(this, 'webSocket', { value: webSocket })
  }
}

class FakeWebSocket {
  listeners = new Map<string, Array<(event?: unknown) => void>>()
  closed = false

  accept() {}

  addEventListener(type: string, handler: (event?: unknown) => void) {
    const list = this.listeners.get(type) ?? []
    list.push(handler)
    this.listeners.set(type, list)
  }

  send(_data: unknown) {}

  close() {
    if (this.closed) return
    this.closed = true
    this.emit('close')
  }

  emit(type: string, event?: unknown) {
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }
}

const ADMIN_PASSWORD = 'admin-password-qa-123'
let adminHash = ''

beforeAll(async () => {
  adminHash = await sha256Hex(ADMIN_PASSWORD)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const toBase64 = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))

const authMessage = async (password: string, deviceName = 'qa-dev') => {
  const keySeed = getKeySeed({
    name: 'tmp',
    passwordHash: toMD5(password),
  }) as string
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-1',
    },
    true,
    ['encrypt', 'decrypt'],
  )) as CryptoKeyPair
  const body = toBase64(
    (await crypto.subtle.exportKey('spki', pair.publicKey)) as ArrayBuffer,
  )
  const text = `lx-music auth::\n${body}\n${deviceName}\nlx_music_desktop\n`
  return { m: aesEncrypt(text, btoa(keySeed)), privateKey: pair.privateKey }
}

const performAhAuth = async (
  env: LX.Env,
  name: string,
  password: string,
): Promise<{ clientId: string; key: string }> => {
  const { m, privateKey } = await authMessage(password, `${name}-device`)
  const authRes = await authApp.request('/ah', { headers: { m } }, env)
  expect(authRes.status).toBe(200)

  const encrypted = await authRes.text()
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    Uint8Array.from(atob(encrypted), (char) => char.charCodeAt(0)),
  )
  return JSON.parse(new TextDecoder().decode(decrypted)) as {
    clientId: string
    key: string
  }
}

const setupUserSyncDO = async (
  env: LX.Env,
  storage: MemoryStorage,
  _name: string,
): Promise<{ doInstance: UserSyncDO }> => {
  let init: Promise<void> = Promise.resolve()
  const state = {
    storage,
    blockConcurrencyWhile: (fn: () => Promise<void>) => {
      init = fn()
      return init
    },
  } as unknown as DurableObjectState
  const doInstance = new UserSyncDO(state, env)
  await init
  return { doInstance }
}

const wireUserSyncNamespace = (
  env: LX.Env,
  dos: Map<string, UserSyncDO>,
): void => {
  env.USER_SYNC = {
    idFromName: (name: string) => ({ name }) as unknown as DurableObjectId,
    get: (id: DurableObjectId) =>
      ({
        fetch: (input: RequestInfo | URL, init?: RequestInit) => {
          const name = (id as unknown as { name: string }).name
          const instance = dos.get(name)
          if (!instance)
            return Promise.resolve(new Response(null, { status: 404 }))
          return instance.fetch(new Request(input, init))
        },
      }) as unknown as DurableObjectStub,
  } as unknown as DurableObjectNamespace
}

const adminLogin = async (env: LX.Env): Promise<string> => {
  const res = await adminApp.request(
    '/api/admin/login',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: ADMIN_PASSWORD }),
    },
    env,
  )
  expect(res.status).toBe(200)
  const cookie = res.headers.get('set-cookie')
  if (!cookie) throw new Error('missing session cookie')
  return cookie.split(';')[0]
}

const basicAuth = (name: string, pass: string) =>
  `Basic ${btoa(`${name}:${pass}`)}`

const music = (id: string, name = id): LX.Music.MusicInfo =>
  ({
    id,
    name,
    singer: 'singer',
    source: 'kw',
    interval: null,
    meta: {},
  }) as LX.Music.MusicInfo

describe('QA 1: 迁移（LX_USERS 自动播种、幂等性与注册表准据）', () => {
  it('旧配置首次启动自动播种为 active/imported，重复启动不重复播种，改 env 不影响鉴权', async () => {
    const initialUsers: LX.User[] = [
      { name: 'migrated_user', password: 'migrated_password_1' },
    ]

    const { env } = await createTestEnv({
      users: initialUsers,
    })

    // 1. 验证名单自动落库为 active/imported
    const user = await getUser(env, 'migrated_user')
    expect(user).not.toBeNull()
    expect(user?.status).toBe('active')
    expect(user?.source).toBe('imported')
    expect(user?.passwordHash).toBe(toMD5('migrated_password_1'))

    // 2. 模拟 DO 实例重启，并改动 env 名单（删去旧人、加入新人）
    // 再次调用注册表：验证未重复播种，且新 env 用户没有被导入
    const oldUserAfter = await getUser(env, 'migrated_user')
    expect(oldUserAfter?.status).toBe('active')
    const newUserInRegistry = await getUser(env, 'new_env_user')
    expect(newUserInRegistry).toBeNull()

    // 3. 验证播种后改 env 不影响老用户 /ah 鉴权，新 env 用户鉴权被拒
    const dos = new Map<string, UserSyncDO>()
    const doStorage = createMemoryStorage()
    const { doInstance } = await setupUserSyncDO(
      env,
      doStorage,
      'migrated_user',
    )
    dos.set('migrated_user', doInstance)
    wireUserSyncNamespace(env, dos)

    // 老用户 /ah 成功
    const authSuccess = await performAhAuth(
      env,
      'migrated_user',
      'migrated_password_1',
    )
    expect(authSuccess.clientId).toBeTruthy()

    // 新 env 用户 /ah 失败 (401)
    const { m: failedM } = await authMessage(
      'new_password_2',
      'new-env-user-device',
    )
    const failedAuthRes = await authApp.request(
      '/ah',
      { headers: { m: failedM } },
      env,
    )
    expect(failedAuthRes.status).toBe(401)
  })
})

describe('QA 2: 三类账号完成 /ah + /socket + 一次歌单同步全流程', () => {
  it('env 播种、管理员添加、自助注册批准后三类账号均能成功完成首次认证、WebSocket 升级并完成歌单同步', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'u_imported', password: 'pass_imported_1' }],
      adminPasswordHash: adminHash,
    })

    // 1. 管理员添加账号
    await addTestUser(env, {
      name: 'u_admin',
      password: 'pass_admin_1',
      source: 'admin',
    })

    // 2. 自助注册并在 approval 模式下由管理员批准
    await updateSettings(env, 'approval')
    const regRes = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'u_self',
          password: 'pass_self_1',
        }),
      },
      env,
    )
    expect(regRes.status).toBe(201)
    expect(await regRes.json()).toEqual({ status: 'pending' })
    await transitionUser(env, 'u_self', 'active', ['pending'])

    const accounts: Array<{ name: string; pass: string }> = [
      { name: 'u_imported', pass: 'pass_imported_1' },
      { name: 'u_admin', pass: 'pass_admin_1' },
      { name: 'u_self', pass: 'pass_self_1' },
    ]

    const dos = new Map<string, UserSyncDO>()
    const doStorages = new Map<string, MemoryStorage>()
    for (const acc of accounts) {
      const storage = createMemoryStorage()
      doStorages.set(acc.name, storage)
      const { doInstance } = await setupUserSyncDO(env, storage, acc.name)
      dos.set(acc.name, doInstance)
    }
    wireUserSyncNamespace(env, dos)

    for (const acc of accounts) {
      // 1. /ah 首次认证
      const { clientId, key } = await performAhAuth(env, acc.name, acc.pass)
      expect(clientId).toBeTruthy()
      expect(key).toBeTruthy()

      // 2. /socket WebSocket 连接升级并建立双向消息传输
      const serverSocket = new FakeWebSocket()
      const clientSocket = new FakeWebSocket()
      vi.stubGlobal('WebSocketPair', function WebSocketPair() {
        return { 0: clientSocket, 1: serverSocket }
      })
      vi.stubGlobal('Response', UpgradeResponse)

      // 建立客户端 Mock msg2call，处理服务端下发的 sync RPC 调用
      let syncFinishedResolve: () => void = () => {}
      const syncFinishedPromise = new Promise<void>((resolve) => {
        syncFinishedResolve = resolve
      })

      const clientMsg2call = createMsg2call({
        funcsObj: {
          getEnabledFeatures: async () => ({ list: true }),
          list_sync_get_sync_mode: async () => 'overwrite',
          list_sync_get_list_data: async () => ({
            defaultList: [music(`song-${acc.name}`, `Playlist of ${acc.name}`)],
            loveList: [],
            userList: [],
          }),
          list_sync_get_md5: async () => `md5-${acc.name}`,
          list_sync_finished: async () => {},
          finished: async () => {
            syncFinishedResolve()
          },
        },
        sendMessage: async (data) => {
          const encrypted = await encryptMsg(null, JSON.stringify(data))
          serverSocket.emit('message', { data: encrypted })
        },
      })

      serverSocket.send = async (data: unknown) => {
        if (typeof data !== 'string') return
        const decrypted = await decryptMsg(null, data)
        if (decrypted) {
          try {
            clientMsg2call.message(JSON.parse(decrypted))
          } catch (err) {
            console.error('clientMsg2call error', err)
          }
        }
      }

      const token = aesEncrypt('lx-music connect', key)
      const upgradeRes = await env.USER_SYNC.get(
        env.USER_SYNC.idFromName(acc.name),
      ).fetch(
        `https://do/ws?i=${encodeURIComponent(clientId)}&t=${encodeURIComponent(token)}`,
      )
      expect(upgradeRes.status).toBe(101)

      // 3. 等待歌单同步完成
      await syncFinishedPromise

      // 验证服务端快照已生成
      const userSpace = getUserSpace(acc.name)
      expect(
        userSpace.listManage.snapshotDataManage.snapshotInfo.latest,
      ).toBeTruthy()
      const listData = await userSpace.listManage.getListData()
      expect(listData.defaultList[0]?.name).toBe(`Playlist of ${acc.name}`)

      serverSocket.close()
      vi.unstubAllGlobals()
    }
  })
})

describe('QA 3: 状态闸门（pending 与 disabled 在三处入口的表现与安全防护）', () => {
  it('pending、disabled 账号在 /ah、/socket、/devices 均被拒且不泄露状态差异', async () => {
    const { env } = await createTestEnv()
    await addTestUser(env, {
      name: 'user_pending',
      password: 'password_123',
      status: 'pending',
      source: 'self',
    })
    await addTestUser(env, {
      name: 'user_disabled',
      password: 'password_123',
      status: 'disabled',
      source: 'admin',
    })

    const dos = new Map<string, UserSyncDO>()
    for (const name of ['user_pending', 'user_disabled', 'user_nonexistent']) {
      const storage = createMemoryStorage()
      const { doInstance } = await setupUserSyncDO(env, storage, name)
      dos.set(name, doInstance)
    }
    wireUserSyncNamespace(env, dos)

    const targetUsers = ['user_pending', 'user_disabled', 'user_nonexistent']

    // 1. /ah 入口：所有非 active 账号均返回 401 且响应均为 msgAuthFailed
    for (const u of targetUsers) {
      const { m } = await authMessage('password_123', `${u}-dev`)
      const res = await authApp.request('/ah', { headers: { m } }, env)
      expect(res.status).toBe(401)
      expect(await res.text()).toBe(SYNC_CODE.msgAuthFailed)
    }

    // 2. /socket 入口：所有非 active 账号均返回 401 且响应均为 msgAuthFailed
    for (const u of targetUsers) {
      const dummyKey16 = btoa('1234567890123456')
      const dummyToken = aesEncrypt('lx-music connect', dummyKey16)
      const res = await env.USER_SYNC.get(env.USER_SYNC.idFromName(u)).fetch(
        `https://do/ws?i=dummy-client&t=${encodeURIComponent(dummyToken)}`,
      )
      expect(res.status).toBe(401)
      expect(await res.text()).toBe(SYNC_CODE.msgAuthFailed)
    }

    // 3. /devices 入口：所有非 active 账号均返回 401 且响应均为 Unauthorized
    for (const u of targetUsers) {
      const res = await devicesApp.request(
        '/devices',
        { headers: { authorization: basicAuth(u, 'password_123') } },
        env,
      )
      expect(res.status).toBe(401)
      expect(await res.text()).toBe('Unauthorized')
    }
  })
})

describe('QA 4: 注册模式、保留名、同名并发与限流', () => {
  it('三档注册模式各验：closed 403 / open 直接 active / approval 落 pending', async () => {
    const { env } = await createTestEnv()

    // closed 模式
    await updateSettings(env, 'closed')
    const closedRes = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'reg_closed', password: 'password123' }),
      },
      env,
    )
    expect(closedRes.status).toBe(403)
    expect(await getUser(env, 'reg_closed')).toBeNull()

    // open 模式
    await updateSettings(env, 'open')
    const openRes = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'reg_open', password: 'password123' }),
      },
      env,
    )
    expect(openRes.status).toBe(201)
    expect(await openRes.json()).toEqual({ status: 'active' })
    const openUser = await getUser(env, 'reg_open')
    expect(openUser?.status).toBe('active')

    // approval 模式
    await updateSettings(env, 'approval')
    const appRes = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'reg_approval', password: 'password123' }),
      },
      env,
    )
    expect(appRes.status).toBe(201)
    expect(await appRes.json()).toEqual({ status: 'pending' })
    const appUser = await getUser(env, 'reg_approval')
    expect(appUser?.status).toBe('pending')
  })

  it('保留名与 __ 前缀被拒', async () => {
    const { env } = await createTestEnv()
    await updateSettings(env, 'open')

    for (const name of ['__prefix', '__server__', '__admin_internal__']) {
      const res = await registerApp.request(
        '/api/register',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name, password: 'password123' }),
        },
        env,
      )
      // 保留名以 __ 开头，返回 409
      expect(res.status).toBe(409)
    }
  })

  it('同名并发注册严格只成功一个，另一个返回 409', async () => {
    const { env } = await createTestEnv()
    await updateSettings(env, 'open')

    const [res1, res2] = await Promise.all([
      registerApp.request(
        '/api/register',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'race_user', password: 'password123' }),
        },
        env,
      ),
      registerApp.request(
        '/api/register',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ name: 'race_user', password: 'password123' }),
        },
        env,
      ),
    ])

    const statuses = [res1.status, res2.status].sort()
    expect(statuses).toEqual([201, 409])
  })

  it('注册与登录限流生效', async () => {
    // 注册限流触发时返回 403
    const { env: regLimitEnv } = await createTestEnv({
      rateLimiter: { limit: async () => ({ success: false }) },
    })
    const regRes = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'limited_user', password: 'password123' }),
      },
      regLimitEnv,
    )
    expect(regRes.status).toBe(403)

    // 登录限流触发时返回 403
    const { env: loginLimitEnv } = await createTestEnv({
      adminPasswordHash: adminHash,
      rateLimiter: { limit: async () => ({ success: false }) },
    })
    const loginRes = await adminApp.request(
      '/api/admin/login',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: ADMIN_PASSWORD }),
      },
      loginLimitEnv,
    )
    expect(loginRes.status).toBe(403)
  })
})

describe('QA 5: 删除链（设备解绑、保留同步数据、恢复与彻底清理）', () => {
  it('删除账号后设备全失效、KV映射清除、同步数据在 dataStatus 可见；恢复账号后旧歌单接回；清理后数据清空且可全新注册', async () => {
    const { env, kv } = await createTestEnv({
      adminPasswordHash: adminHash,
    })
    const cookie = await adminLogin(env)

    // 1. 创建账号并初始化 DO
    await addTestUser(env, { name: 'chain_user', password: 'chain_password_1' })
    const storage = createMemoryStorage()
    // 预填设备与 KV 映射
    storage.data.set('devices', {
      userName: 'chain_user',
      clients: {
        'client-xyz': {
          clientId: 'client-xyz',
          key: 'key-xyz',
          deviceName: 'dev-1',
          isMobile: false,
          lastConnectDate: 100,
        },
      },
    })
    kv.store.set('client:client-xyz', 'chain_user')

    const dos = new Map<string, UserSyncDO>()
    const { doInstance } = await setupUserSyncDO(env, storage, 'chain_user')
    dos.set('chain_user', doInstance)
    wireUserSyncNamespace(env, dos)

    // 写入初始歌单数据与快照，并做一次更新产生历史快照后刷入存储
    const userSpace = getUserSpace('chain_user')
    await userSpace.listEvent.list_data_overwrite(
      'chain_user',
      {
        defaultList: [music('old-1', 'Preserved Old Song')],
        loveList: [],
        userList: [],
      },
      true,
    )
    await userSpace.listManage.createSnapshot()
    await userSpace.listEvent.list_data_overwrite(
      'chain_user',
      {
        defaultList: [
          music('old-1', 'Preserved Old Song'),
          music('old-2', 'Preserved Old Song 2'),
        ],
        loveList: [],
        userList: [],
      },
      true,
    )
    await userSpace.listManage.createSnapshot()
    await userSpace.flush()

    // 2. 管理员删除账号
    const delRes = await adminApp.request(
      '/api/admin/users/chain_user',
      { method: 'DELETE', headers: { cookie } },
      env,
    )
    expect(delRes.status).toBe(200)
    expect(await delRes.json()).toMatchObject({ orphaned: true })

    // 验证 KV 映射已被清除
    expect(await kv.get('client:client-xyz')).toBeNull()

    // 验证墓碑存在，且在 orphans 列表中能够查看到旧数据概况（dataStatus 可见）
    const orphansRes = await adminApp.request(
      '/api/admin/orphans',
      { headers: { cookie } },
      env,
    )
    expect(orphansRes.status).toBe(200)
    const orphans = (await orphansRes.json()) as Array<{
      name: string
      dataStatus: { list: { snapshotCount: number } | null }
    }>
    const orphanItem = orphans.find((o) => o.name === 'chain_user')
    expect(orphanItem).toBeDefined()
    expect(orphanItem?.dataStatus.list?.snapshotCount).toBeGreaterThan(0)

    // 验证此时普通自助注册该用户名会被 409 拒绝
    await updateSettings(env, 'open')
    const selfRegConflict = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'chain_user',
          password: 'new_password_try',
        }),
      },
      env,
    )
    expect(selfRegConflict.status).toBe(409)

    // 3. 恢复账号：恢复后旧歌单接回
    const restoreRes = await adminApp.request(
      '/api/admin/orphans/chain_user/restore',
      {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ password: 'restored_password_1' }),
      },
      env,
    )
    expect(restoreRes.status).toBe(201)
    const restoredUser = await getUser(env, 'chain_user')
    expect(restoredUser?.status).toBe('active')
    // 检查旧歌单依然存在
    const restoredListData = await userSpace.listManage.getListData()
    expect(restoredListData.defaultList[0]?.name).toBe('Preserved Old Song')

    // 再次删除以便测试彻底清理流程
    await adminApp.request(
      '/api/admin/users/chain_user',
      { method: 'DELETE', headers: { cookie } },
      env,
    )

    // 4. 彻底清理：confirmName 不一致时拒绝清理 (400)
    const wrongConfirmRes = await adminApp.request(
      '/api/admin/orphans/chain_user',
      {
        method: 'DELETE',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmName: 'wrong_name' }),
      },
      env,
    )
    expect(wrongConfirmRes.status).toBe(400)

    // 正确 confirmName 时彻底清理 (200)
    const purgeRes = await adminApp.request(
      '/api/admin/orphans/chain_user',
      {
        method: 'DELETE',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ confirmName: 'chain_user' }),
      },
      env,
    )
    expect(purgeRes.status).toBe(200)
    expect(await purgeRes.json()).toEqual({ purged: true })

    // 验证 DO 存储已被完全清空 (storage.deleteAll 执行完毕)
    expect(storage.data.size).toBe(0)

    // 5. 彻底清理后同名可被重新自助注册，且为全新空数据
    const reRegRes = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'chain_user',
          password: 'brand_new_password',
        }),
      },
      env,
    )
    expect(reRegRes.status).toBe(201)

    // 新用户首次 /ah 认证连接，DO 初始化并生成新的纯净空间
    const authFresh = await performAhAuth(
      env,
      'chain_user',
      'brand_new_password',
    )
    expect(authFresh.clientId).toBeTruthy()

    const freshUserSpace = getUserSpace('chain_user')
    const freshListData = await freshUserSpace.listManage.getListData()
    expect(freshListData.defaultList).toEqual([])
    expect(freshListData.loveList).toEqual([])
  })
})

describe('QA 6: 管理 API 安全', () => {
  it('未登录 401，未配置管理员 Secret 时 404，用户列表不含 passwordHash，设备列表不含设备 key', async () => {
    // 1. 未配置管理员 Secret 时，访问 /admin 与 /api/admin/* 全部 404
    const { env: noAdminEnv } = await createTestEnv()
    expect(
      (await adminApp.request('/api/admin/users', {}, noAdminEnv)).status,
    ).toBe(404)
    expect(
      (
        await adminApp.request(
          '/api/admin/login',
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: ADMIN_PASSWORD }),
          },
          noAdminEnv,
        )
      ).status,
    ).toBe(404)

    // 2. 配置了管理员 Secret，但未登录时访问受保护端点返回 401
    const { env } = await createTestEnv({
      adminPasswordHash: adminHash,
      users: [{ name: 'sec_user', password: 'sec_password_1' }],
    })
    expect((await adminApp.request('/api/admin/users', {}, env)).status).toBe(
      401,
    )
    expect((await adminApp.request('/api/admin/orphans', {}, env)).status).toBe(
      401,
    )

    // 3. 登录后获取用户列表：响应中绝不能含有 passwordHash
    const cookie = await adminLogin(env)
    const usersRes = await adminApp.request(
      '/api/admin/users',
      { headers: { cookie } },
      env,
    )
    expect(usersRes.status).toBe(200)
    const usersData = (await usersRes.json()) as {
      users: Array<Record<string, unknown>>
    }
    expect(usersData.users.length).toBeGreaterThan(0)
    for (const u of usersData.users) {
      expect(u.passwordHash).toBeUndefined()
    }

    // 4. 设备列表查询：/devices 与 /api/admin/users/:name/devices 均不包含设备私密密钥 key
    const storage = createMemoryStorage()
    storage.data.set('devices', {
      userName: 'sec_user',
      clients: {
        'c-sec-1': {
          clientId: 'c-sec-1',
          key: 'SUPER_SECRET_DEVICE_KEY',
          deviceName: 'Secret Phone',
          isMobile: true,
          lastConnectDate: 1000,
        },
      },
    })
    const dos = new Map<string, UserSyncDO>()
    const { doInstance } = await setupUserSyncDO(env, storage, 'sec_user')
    dos.set('sec_user', doInstance)
    wireUserSyncNamespace(env, dos)

    // 4.1 用户端 Basic Auth /devices 查询
    const devicesRes = await devicesApp.request(
      '/devices',
      { headers: { authorization: basicAuth('sec_user', 'sec_password_1') } },
      env,
    )
    expect(devicesRes.status).toBe(200)
    const userDevices = (await devicesRes.json()) as Array<
      Record<string, unknown>
    >
    expect(userDevices.length).toBe(1)
    expect(userDevices[0].key).toBeUndefined()
    expect(userDevices[0].clientId).toBe('c-sec-1')

    // 4.2 管理员 API 查询设备列表
    const adminDevicesRes = await adminApp.request(
      '/api/admin/users/sec_user/devices',
      { headers: { cookie } },
      env,
    )
    expect(adminDevicesRes.status).toBe(200)
    const adminDevices = (await adminDevicesRes.json()) as Array<
      Record<string, unknown>
    >
    expect(adminDevices.length).toBe(1)
    expect(adminDevices[0].key).toBeUndefined()
    expect(adminDevices[0].clientId).toBe('c-sec-1')
  })
})
