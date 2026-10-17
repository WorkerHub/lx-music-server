import { describe, expect, it } from 'vitest'
import { aesEncrypt } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import { UserSyncDO } from './UserSyncDO'

const createStorage = () => {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      data.set(key, value)
    },
    delete: async (key: string) => {
      data.delete(key)
      return true
    },
  } as DurableObjectStorage & { data: Map<string, unknown> }
}

const authText = (deviceName = 'dev') =>
  `lx-music auth::\n<publickey>\n${deviceName}\n`

describe('UserSyncDO first-auth trusts the routed userName (M4)', () => {
  it('rejects a message that only another user can decrypt', async () => {
    const users: LX.User[] = [
      { name: 'alice', password: 'aaa' },
      { name: 'bob', password: 'bbb' },
    ]
    const storage = createStorage()
    let initPromise: Promise<void> = Promise.resolve()
    const state = {
      storage,
      blockConcurrencyWhile: (fn: () => Promise<void>) => {
        initPromise = fn()
        return initPromise
      },
    } as unknown as DurableObjectState
    const env = { LX_USERS: JSON.stringify(users) } as unknown as LX.Env

    const doInstance = new UserSyncDO(state, env)
    await initPromise

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
    const users: LX.User[] = [{ name: 'alice', password: 'aaa' }]
    const storage = createStorage()
    const state = {
      storage,
      blockConcurrencyWhile: async (fn: () => Promise<void>) => {
        await fn()
      },
    } as unknown as DurableObjectState
    const env = { LX_USERS: JSON.stringify(users) } as unknown as LX.Env

    const doInstance = new UserSyncDO(state, env)

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
    const users: LX.User[] = [{ name: 'alice', password: 'aaa' }]
    const keyBytes = crypto.getRandomValues(new Uint8Array(16))
    const key = btoa(String.fromCharCode(...keyBytes))
    const clientId = 'client-1'
    const deviceName = 'dev1'
    const storage = createStorage()
    storage.data.set('devices', {
      userName: 'alice',
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
    let initPromise: Promise<void> = Promise.resolve()
    const state = {
      storage,
      blockConcurrencyWhile: (fn: () => Promise<void>) => {
        initPromise = fn()
        return initPromise
      },
    } as unknown as DurableObjectState
    const env = { LX_USERS: JSON.stringify(users) } as unknown as LX.Env

    const doInstance = new UserSyncDO(state, env)
    await initPromise

    const encryptedMsg = aesEncrypt(`lx-music auth::${deviceName}`, key)
    const resp = await doInstance.fetch(
      new Request('https://do/auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ encryptedMsg, clientId, serverName: 'test' }),
      }),
    )

    expect(resp.status).toBe(200)
  })
})
