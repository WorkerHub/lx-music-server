import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserSyncDO } from '@/durable/UserSyncDO'
import { transitionUser, updateSettings, updateUser } from '@/registry/client'
import {
  addTestUser,
  createMemoryStorage,
  createTestEnv,
} from '@/test/registryEnv'
import { aesEncrypt, toMD5 } from '@/utils/crypto'
import { getKeySeed } from '@/utils/password'
import app from './auth'
import registerApp from './register'

// Node's Response rejects status 101 and has no `webSocket` field, so the
// upgrade path is exercised with a thin shim that mirrors what workerd does.
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

  send() {}

  close() {
    if (this.closed) return
    this.closed = true
    this.emit('close')
  }

  emit(type: string, event?: unknown) {
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }
}

const toBase64 = (bytes: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))

const authMessage = async (password: string, deviceName = 'dev') => {
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

const routeToDo = (env: LX.Env, dos: Map<string, UserSyncDO>): void => {
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

const createDo = async (
  env: LX.Env,
  dos: Map<string, UserSyncDO>,
  name: string,
): Promise<UserSyncDO> => {
  let init: Promise<void> = Promise.resolve()
  const state = {
    storage: createMemoryStorage(),
    blockConcurrencyWhile: (fn: () => Promise<void>) => {
      init = fn()
      return init
    },
  } as unknown as DurableObjectState
  const instance = new UserSyncDO(state, env)
  await init
  dos.set(name, instance)
  return instance
}

const openSocket = async (
  env: LX.Env,
  name: string,
  password: string,
): Promise<{ status: number; clientId: string; server: FakeWebSocket }> => {
  const { m, privateKey } = await authMessage(password, `${name}-dev`)
  const authRes = await app.request('/ah', { headers: { m } }, env)
  expect(authRes.status).toBe(200)

  const encrypted = await authRes.text()
  const decrypted = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    Uint8Array.from(atob(encrypted), (char) => char.charCodeAt(0)),
  )
  const { clientId, key } = JSON.parse(new TextDecoder().decode(decrypted)) as {
    clientId: string
    key: string
  }

  const server = new FakeWebSocket()
  const client = new FakeWebSocket()
  vi.stubGlobal('WebSocketPair', function WebSocketPair() {
    return { 0: client, 1: server }
  })
  vi.stubGlobal('Response', UpgradeResponse)

  const token = aesEncrypt('lx-music connect', key)
  const res = await env.USER_SYNC.get(env.USER_SYNC.idFromName(name)).fetch(
    `https://do/ws?i=${encodeURIComponent(clientId)}&t=${encodeURIComponent(token)}`,
  )
  return { status: res.status, clientId, server }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('three account sources complete /ah + WebSocket upgrade', () => {
  it('accepts an env-seeded, an admin-created and a self-registered account', async () => {
    const { env } = await createTestEnv({
      users: [{ name: 'importeduser', password: 'imported-pass-1' }],
    })
    await addTestUser(env, {
      name: 'adminuser',
      password: 'admin-pass-1',
      source: 'admin',
    })
    // Self registration in the default approval mode, then an admin approval.
    await updateSettings(env, 'approval')
    const registered = await registerApp.request(
      '/api/register',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'selfuser',
          password: 'self-pass-1',
        }),
      },
      env,
    )
    expect(registered.status).toBe(201)
    expect(await registered.json()).toEqual({ status: 'pending' })
    await transitionUser(env, 'selfuser', 'active', ['pending'])

    const dos = new Map<string, UserSyncDO>()
    routeToDo(env, dos)

    const sources: Array<[string, string]> = [
      ['importeduser', 'imported-pass-1'],
      ['adminuser', 'admin-pass-1'],
      ['selfuser', 'self-pass-1'],
    ]

    for (const [name, password] of sources) {
      await createDo(env, dos, name)
      const { status, clientId, server } = await openSocket(env, name, password)
      expect(status).toBe(101)
      expect(clientId).toBeTruthy()
      // Closing the server side lets message2call clear its pending timers.
      server.close()
      vi.unstubAllGlobals()
    }
  })

  it('applies an admin snapshot-limit change on the next upgrade', async () => {
    const { env } = await createTestEnv()
    await addTestUser(env, { name: 'capuser', password: 'cap-pass-1' })
    const dos = new Map<string, UserSyncDO>()
    routeToDo(env, dos)
    const instance = await createDo(env, dos, 'capuser')
    await updateUser(env, 'capuser', { maxSnapshotNum: 7 })

    const { status, server } = await openSocket(env, 'capuser', 'cap-pass-1')

    expect(status).toBe(101)
    expect(
      (instance as any).userSpace.listManage.snapshotDataManage.maxSnapshotNum,
    ).toBe(7)
    server.close()
  })
})
