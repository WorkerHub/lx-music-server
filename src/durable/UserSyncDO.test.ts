import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  addTestUser,
  createMemoryStorage,
  createTestEnv,
  type MemoryStorage,
} from '@/test/registryEnv'
import { getUserSpace } from '@/user'
import { aesEncrypt, toMD5 } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import { isConnectionLimitReached, UserSyncDO } from './UserSyncDO'

const authText = (deviceName = 'dev') =>
  `lx-music auth::\n<publickey>\n${deviceName}\n`

const initDo = async (
  env: LX.Env,
  storage: MemoryStorage,
): Promise<{ doInstance: UserSyncDO; init: Promise<void> }> => {
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
  return { doInstance, init }
}

const seedDevice = (
  storage: MemoryStorage,
  userName: string,
  clientId: string,
  key: string,
  deviceName = 'dev',
) => {
  storage.data.set('devices', {
    userName,
    clients: {
      [clientId]: {
        clientId,
        key,
        deviceName,
        isMobile: false,
        lastConnectDate: 0,
      },
    },
  })
}

const newKey = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes))
}

describe('UserSyncDO first-auth trusts the routed userName (M4)', () => {
  it('rejects a message that only another user can decrypt', async () => {
    const users: LX.User[] = [
      { name: 'alice', password: 'aaa' },
      { name: 'bob', password: 'bbb' },
    ]
    const { env } = await createTestEnv({ users })
    const { doInstance } = await initDo(env, createMemoryStorage())

    // Encrypt with bob's key, but route the auth to alice. The DO must only
    // try alice's key and reject, instead of looping all users and binding bob.
    const bobKey = btoa(getKeySeed(users[1]) as string)
    const encryptedMsg = aesEncrypt(authText(), bobKey)

    const resp = await doInstance.fetch(
      new Request('https://do/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          encryptedMsg,
          serverName: 'test',
          userName: 'alice',
        }),
      }),
    )

    expect(resp.status).toBe(401)
  })

  it('rejects when the routed userName is unknown', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'aaa' }],
    })
    const { doInstance } = await initDo(env, createMemoryStorage())

    const resp = await doInstance.fetch(
      new Request('https://do/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          encryptedMsg: 'whatever',
          serverName: 'test',
          userName: 'ghost',
        }),
      }),
    )

    expect(resp.status).toBe(401)
  })

  it('re-authenticates a known device via clientId without a userName', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'aaa' }],
    })
    const storage = createMemoryStorage()
    const key = newKey()
    seedDevice(storage, 'alice', 'client-1', key, 'dev1')
    const { doInstance } = await initDo(env, storage)

    const encryptedMsg = aesEncrypt(`lx-music auth::dev1`, key)
    const resp = await doInstance.fetch(
      new Request('https://do/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          encryptedMsg,
          clientId: 'client-1',
          serverName: 'test',
        }),
      }),
    )

    expect(resp.status).toBe(200)
  })
})

describe('UserSyncDO status gate', () => {
  it('refuses a first auth for a pending account', async () => {
    const { env } = await createTestEnv()
    await addTestUser(env, {
      name: 'waiting',
      password: 'pw12345678',
      status: 'pending',
      source: 'self',
    })
    const { doInstance } = await initDo(env, createMemoryStorage())

    const key = btoa(
      getKeySeed({
        name: 'waiting',
        passwordHash: toMD5('pw12345678'),
      }) as string,
    )
    const resp = await doInstance.fetch(
      new Request('https://do/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          encryptedMsg: aesEncrypt(authText(), key),
          serverName: 'test',
          userName: 'waiting',
        }),
      }),
    )

    expect(resp.status).toBe(401)
  })

  it('refuses a WebSocket upgrade for a disabled account', async () => {
    const { env } = await createTestEnv()
    await addTestUser(env, {
      name: 'blocked',
      password: 'pw12345678',
      status: 'disabled',
    })
    const storage = createMemoryStorage()
    const key = newKey()
    seedDevice(storage, 'blocked', 'client-1', key)
    const { doInstance } = await initDo(env, storage)

    const token = aesEncrypt('lx-music connect', key)
    const resp = await doInstance.fetch(
      new Request(`https://do/ws?i=client-1&t=${encodeURIComponent(token)}`, {
        headers: { upgrade: 'websocket' },
      }),
    )

    expect(resp.status).toBe(401)
  })
})

describe('UserSyncDO admin endpoints', () => {
  it('returns 503 from /devices when userSpace is uninitialized (L6)', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw' }],
    })
    const state = {
      storage: createMemoryStorage(),
      // Never run initialize, leaving this.userSpace null.
      blockConcurrencyWhile: () => {},
    } as unknown as DurableObjectState
    const doInstance = new UserSyncDO(state, env)

    const resp = await doInstance.fetch(new Request('https://do/devices'))

    expect(resp.status).toBe(503)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('user space not initialized')
  })

  it('summarizes snapshot data for /data-status', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const storage = createMemoryStorage()
    storage.data.set('devices', { userName: 'alice', clients: {} })
    storage.data.set('list:snapshotInfo', {
      latest: 'l1',
      time: 111,
      list: ['l1', 'l0'],
      clients: {},
    })
    storage.data.set('dislike:snapshotInfo', {
      latest: null,
      time: 0,
      list: [],
      clients: {},
    })
    const { doInstance } = await initDo(env, storage)

    const resp = await doInstance.fetch(new Request('https://do/data-status'))

    expect(await resp.json()).toEqual({
      list: { latest: 'l1', time: 111, snapshotCount: 2 },
      dislike: null,
    })
  })

  it('unbinds every device but keeps the sync data', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const storage = createMemoryStorage()
    const key = newKey()
    seedDevice(storage, 'alice', 'c1', key)
    storage.data.set('list:snapshotInfo', {
      latest: 'l1',
      time: 1,
      list: ['l1'],
      clients: { c1: { snapshotKey: 'l1', lastSyncDate: 1 } },
    })
    storage.data.set('dislike:snapshotInfo', {
      latest: null,
      time: 0,
      list: [],
      clients: { c1: { snapshotKey: '', lastSyncDate: 1 } },
    })
    const { doInstance } = await initDo(env, storage)

    const resp = await doInstance.fetch(
      new Request('https://do/unbind-all', { method: 'POST' }),
    )

    expect(resp.status).toBe(204)
    const devices = storage.data.get('devices') as {
      clients: Record<string, unknown>
    }
    expect(devices.clients).toEqual({})
    const listInfo = storage.data.get('list:snapshotInfo') as {
      latest: string
      clients: Record<string, unknown>
    }
    expect(listInfo.latest).toBe('l1')
    expect(listInfo.clients).toEqual({})
  })

  it('purges all storage and resets the in-memory user space', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const storage = createMemoryStorage()
    seedDevice(storage, 'alice', 'c1', newKey())
    storage.data.set('list:snapshotInfo', {
      latest: 'l1',
      time: 1,
      list: ['l1'],
      clients: {},
    })
    const { doInstance } = await initDo(env, storage)

    const resp = await doInstance.fetch(
      new Request('https://do/purge', { method: 'POST' }),
    )

    expect(resp.status).toBe(204)
    expect(storage.data.size).toBe(0)
    const devices = await doInstance.fetch(new Request('https://do/devices'))
    expect(devices.status).toBe(503)
  })

  it('decodes a percent-encoded clientId when deleting a device', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const storage = createMemoryStorage()
    const clientId = 'abc/def=='
    seedDevice(storage, 'alice', clientId, newKey())
    const { doInstance } = await initDo(env, storage)

    const resp = await doInstance.fetch(
      new Request(`https://do/devices/${encodeURIComponent(clientId)}`, {
        method: 'DELETE',
      }),
    )

    expect(resp.status).toBe(204)
    const devices = storage.data.get('devices') as {
      clients: Record<string, unknown>
    }
    expect(devices.clients).toEqual({})
  })

  it('disposes the old user space so late writes cannot resurrect purged data', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const storage = createMemoryStorage()
    seedDevice(storage, 'alice', 'c1', newKey())
    storage.data.set('list:snapshotInfo', {
      latest: 'l1',
      time: 1,
      list: ['l1'],
      clients: {},
    })
    const { doInstance } = await initDo(env, storage)
    const oldSpace = getUserSpace('alice')

    const resp = await doInstance.fetch(
      new Request('https://do/purge', { method: 'POST' }),
    )

    expect(resp.status).toBe(204)
    expect(storage.data.size).toBe(0)
    expect(() => getUserSpace('alice')).toThrow()

    // A late socket-close flush, device removal or auth handler must be a no-op.
    await oldSpace.flush()
    await oldSpace.removeDevice('c1')
    await oldSpace.dataManage.saveClientKeyInfo({
      clientId: 'late',
      key: 'late-key',
      deviceName: 'late',
      isMobile: false,
      lastConnectDate: 0,
    })
    expect(storage.data.size).toBe(0)
  })

  it('kicks live sockets without unbinding devices', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'alice', password: 'pw12345678' }],
    })
    const storage = createMemoryStorage()
    seedDevice(storage, 'alice', 'c1', newKey())
    const { doInstance } = await initDo(env, storage)
    const close = vi.fn()
    ;(doInstance as any).sockets.add({
      keyInfo: { clientId: 'c1', isMobile: false },
      close,
    })

    const resp = await doInstance.fetch(
      new Request('https://do/kick', { method: 'POST' }),
    )

    expect(resp.status).toBe(204)
    expect(close).toHaveBeenCalled()
    const devices = storage.data.get('devices') as {
      clients: Record<string, unknown>
    }
    expect(Object.keys(devices.clients)).toEqual(['c1'])
  })
})

describe('connection limit (M1)', () => {
  it('rejects a new connection once the per-user limit is reached', () => {
    expect(isConnectionLimitReached(20, false)).toBe(true)
  })

  it('allows a same-clientId reconnect even at the limit', () => {
    expect(isConnectionLimitReached(20, true)).toBe(false)
  })

  it('allows connections below the limit', () => {
    expect(isConnectionLimitReached(19, false)).toBe(false)
  })
})

describe('ping interval lifecycle (M1)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts on mobile connect, pings only mobile, and stops when the last mobile leaves', async () => {
    vi.useFakeTimers({
      toFake: ['setInterval', 'clearInterval', 'setTimeout', 'Date'],
    })
    const { env } = await createTestEnv({ users: [] })
    const state = {
      storage: createMemoryStorage(),
      blockConcurrencyWhile: () => {},
    } as unknown as DurableObjectState
    const doInstance = new UserSyncDO(state, env) as any

    // 没有移动端连接时不启动定时器。
    doInstance.startPingInterval()
    expect(doInstance.pingInterval).toBeNull()

    const sent: string[] = []
    const mobile = {
      keyInfo: { clientId: 'm', isMobile: true },
      send: (data: string) => sent.push(data),
    }
    const desktop = {
      keyInfo: { clientId: 'd', isMobile: false },
      send: (data: string) => sent.push(data),
    }
    doInstance.sockets.add(mobile)
    doInstance.sockets.add(desktop)
    doInstance.startPingInterval()
    expect(doInstance.pingInterval).not.toBeNull()

    // 定时器 tick 只给移动端连接发 'ping'。
    vi.advanceTimersByTime(30 * 1000)
    expect(sent).toEqual(['ping'])

    // 最后一个移动端连接断开后停止定时器。
    doInstance.sockets.delete(mobile)
    doInstance.stopPingIntervalIfNoMobile()
    expect(doInstance.pingInterval).toBeNull()
  })
})
