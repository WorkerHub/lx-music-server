import { createMsg2call } from 'message2call'
import { SYNC_CLOSE_CODE, SYNC_CODE } from '@/constants'
import { aesDecrypt, aesEncrypt, rsaEncrypt, toMD5 } from '@/utils/crypto'
import { decryptMsg, encryptMsg } from '@/utils/compress'
import { callObj, sync } from '@/sync'
import { ListEvent } from '@/modules/list/event'
import { DislikeEvent } from '@/modules/dislike/event'
import { setUserSpace, createUserSpace, type UserSpace } from '@/user'
import { setUsersContext, getUserConfig, createClientKeyInfo } from '@/user/data'

const DEFAULT_SNAPSHOT_INFO = { latest: null as string | null, time: 0, list: [] as string[], clients: {} as Record<string, any> }

const IP_FAILURE_TTL_MS = 60 * 1000
const IP_FAILURE_LIMIT = 10
const PING_INTERVAL_MS = 30 * 1000

export class UserSyncDO implements DurableObject {
  private state: DurableObjectState
  private env: LX.Env
  private userName = ''
  private sockets = new Set<LX.Socket>()
  private ipFailures = new Map<string, { count: number; resetAt: number }>()
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private userSpace: UserSpace | null = null
  private readonly listSyncRef: { current: string | null } = { current: null }
  private readonly dislikeSyncRef: { current: string | null } = { current: null }

  constructor(state: DurableObjectState, env: LX.Env) {
    this.state = state
    this.env = env

    this.state.blockConcurrencyWhile(async() => {
      await this.initialize()
    })
  }

  private getUsers(): LX.User[] {
    try { return JSON.parse(this.env.LX_USERS || '[]') } catch { return [] }
  }

  private async loadAndInit(userName: string) {
    const users = this.getUsers()
    setUsersContext(users, 20)

    const devicesInfo = await this.state.storage.get<{ userName: string; clients: Record<string, LX.Sync.KeyInfo> }>('devices')
      ?? { userName, clients: {} }
    devicesInfo.userName = userName

    const listSnapshotInfo = await this.state.storage.get<any>('list:snapshotInfo') ?? { ...DEFAULT_SNAPSHOT_INFO, list: [], clients: {} }
    const dislikeSnapshotInfo = await this.state.storage.get<any>('dislike:snapshotInfo') ?? { ...DEFAULT_SNAPSHOT_INFO, list: [], clients: {} }

    const emptyListData = (): LX.Sync.List.ListData => ({ defaultList: [], loveList: [], userList: [] })
    let listData: LX.Sync.List.ListData = emptyListData()
    if (listSnapshotInfo.latest) {
      listData = await this.state.storage.get<LX.Sync.List.ListData>(`list:snap:${listSnapshotInfo.latest}`) ?? emptyListData()
    }
    let dislikeRules = ''
    if (dislikeSnapshotInfo.latest) {
      dislikeRules = await this.state.storage.get<string>(`dislike:snap:${dislikeSnapshotInfo.latest}`) ?? ''
    }

    const maxSnapshotNum = userName ? (() => {
      try { return getUserConfig(userName).maxSnapshotNum } catch { return 20 }
    })() : 20

    const userSpace = createUserSpace(
      devicesInfo,
      this.state.storage,
      listSnapshotInfo,
      listData,
      dislikeSnapshotInfo,
      dislikeRules,
      userName,
      maxSnapshotNum,
    )
    this.userSpace = userSpace
    setUserSpace(userSpace)

    if (!global.event_list) global.event_list = new ListEvent() as any
    if (!global.event_dislike) global.event_dislike = new DislikeEvent() as any
  }

  private async initialize() {
    const devicesInfo = await this.state.storage.get<{ userName: string; clients: Record<string, LX.Sync.KeyInfo> }>('devices')
    this.userName = devicesInfo?.userName ?? ''
    await this.loadAndInit(this.userName)
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/server-id') return this.handleGetServerId()
    if (url.pathname === '/auth') return this.handleAuth(request)
    if (url.pathname === '/ws') return this.handleWebSocketUpgrade(request)
    if (url.pathname === '/devices' && request.method === 'GET') return this.handleGetDevices()
    if (url.pathname.startsWith('/devices/') && request.method === 'DELETE') {
      const clientId = url.pathname.slice('/devices/'.length)
      return this.handleRemoveDevice(clientId)
    }

    return new Response('Not Found', { status: 404 })
  }

  private async handleGetServerId(): Promise<Response> {
    let serverId = await this.state.storage.get<string>('server:id')
    if (!serverId) {
      const bytes = crypto.getRandomValues(new Uint8Array(16))
      serverId = btoa(String.fromCharCode(...bytes))
      await this.state.storage.put('server:id', serverId)
    }
    return new Response(SYNC_CODE.idPrefix + serverId)
  }

  private async handleGetDevices(): Promise<Response> {
    if (!this.userSpace) return new Response('[]', { headers: { 'content-type': 'application/json' } })
    const devices = await this.userSpace.getDevices()
    // key is the per-device AES symmetric key — never expose it over the management API
    const safeDevices = devices.map(({ key: _key, ...rest }) => rest)
    return new Response(JSON.stringify(safeDevices), { headers: { 'content-type': 'application/json' } })
  }

  private async handleRemoveDevice(clientId: string): Promise<Response> {
    if (!this.userSpace) return new Response(null, { status: 404 })
    // kick off live WebSocket if connected
    for (const socket of this.sockets) {
      if (socket.keyInfo.clientId === clientId) {
        socket.close(SYNC_CLOSE_CODE.normal)
      }
    }
    await this.userSpace.removeDevice(clientId)
    void this.userSpace.flush()
    return new Response(null, { status: 204 })
  }

  private async handleAuth(request: Request): Promise<Response> {
    const body = await request.json<{ encryptedMsg: string; clientId?: string; serverName: string }>()
    const { encryptedMsg, clientId, serverName } = body

    // 已知设备重新认证
    if (clientId) {
      if (!this.userSpace) return new Response(null, { status: 404 })
      const keyInfo = this.userSpace.dataManage.getClientKeyInfo(clientId)
      if (!keyInfo) return new Response(null, { status: 404 })
      let text: string
      try { text = aesDecrypt(encryptedMsg, keyInfo.key) } catch { return new Response(null, { status: 401 }) }
      if (!text.startsWith(SYNC_CODE.authMsg)) return new Response(null, { status: 401 })
      const deviceName = text.replace(SYNC_CODE.authMsg, '') || 'Unknown'
      if (deviceName !== keyInfo.deviceName) {
        keyInfo.deviceName = deviceName
        await this.userSpace.dataManage.saveClientKeyInfo(keyInfo)
      }
      return new Response(aesEncrypt(SYNC_CODE.helloMsg, keyInfo.key))
    }

    // 新设备首次认证
    const users = this.getUsers()
    for (const userInfo of users) {
      const key = btoa(toMD5(userInfo.password).substring(0, 16))
      let text: string
      try { text = aesDecrypt(encryptedMsg, key) } catch { continue }
      if (!text.startsWith(SYNC_CODE.authMsg)) continue

      const data = text.split('\n')
      const publicKey = `-----BEGIN PUBLIC KEY-----\n${data[1]}\n-----END PUBLIC KEY-----`
      const deviceName = data[2] || 'Unknown'
      const isMobile = data[3] === 'lx_music_mobile'
      const keyInfo = createClientKeyInfo(deviceName, isMobile)

      // 首次认证时建立 userName（先设置再 await，防止并发双重初始化）
      if (!this.userName) {
        const name = userInfo.name
        this.userName = name
        await this.loadAndInit(name)
      }

      this.userSpace!.dataManage.devicesInfo.userName = userInfo.name
      await this.userSpace!.dataManage.saveClientKeyInfo(keyInfo)

      const encrypted = await rsaEncrypt(
        JSON.stringify({ clientId: keyInfo.clientId, key: keyInfo.key, serverName }),
        publicKey,
      )
      return new Response(JSON.stringify({ encrypted, clientId: keyInfo.clientId, userName: userInfo.name }), {
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(null, { status: 401 })
  }

  private async handleWebSocketUpgrade(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const clientId = url.searchParams.get('i')
    const token = url.searchParams.get('t')
    if (!clientId || !token) return new Response('Bad Request', { status: 400 })

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
    const now = Date.now()
    const failureEntry = this.ipFailures.get(ip)
    if (failureEntry && now < failureEntry.resetAt && failureEntry.count >= IP_FAILURE_LIMIT) {
      return new Response(SYNC_CODE.msgBlockedIp, { status: 403 })
    }

    const recordIpFailure = () => {
      const entry = this.ipFailures.get(ip)
      if (!entry || now >= entry.resetAt) {
        this.ipFailures.set(ip, { count: 1, resetAt: now + IP_FAILURE_TTL_MS })
      } else {
        entry.count++
      }
    }

    if (!this.userSpace) {
      recordIpFailure()
      return new Response(SYNC_CODE.msgAuthFailed, { status: 401 })
    }

    const keyInfo = this.userSpace.dataManage.getClientKeyInfo(clientId)
    if (!keyInfo) {
      recordIpFailure()
      return new Response(SYNC_CODE.msgAuthFailed, { status: 401 })
    }

    let text: string
    try { text = aesDecrypt(token, keyInfo.key) } catch {
      recordIpFailure()
      return new Response(SYNC_CODE.msgAuthFailed, { status: 401 })
    }
    if (text !== SYNC_CODE.msgConnect) {
      recordIpFailure()
      return new Response(SYNC_CODE.msgAuthFailed, { status: 401 })
    }

    this.ipFailures.delete(ip)

    const users = this.getUsers()
    const user = users.find(u => u.name === this.userName)
    if (!user) return new Response(SYNC_CODE.msgAuthFailed, { status: 401 })

    keyInfo.lastConnectDate = Date.now()
    await this.userSpace.dataManage.saveClientKeyInfo(keyInfo)

    const [client, server] = Object.values(new WebSocketPair())
    server.accept()

    const socket = this.createSocket(server, keyInfo, user)
    this.sockets.add(socket)

    // 踢掉同一 clientId 的旧连接
    for (const existing of this.sockets) {
      if (existing !== socket && existing.keyInfo.clientId === clientId) {
        existing.isReady = false
        existing.moduleReadys.list = false
        existing.moduleReadys.dislike = false
        existing.close(SYNC_CLOSE_CODE.normal)
      }
    }

    sync(socket).then(() => {
      socket.isReady = true
    }).catch(err => {
      console.warn('sync error:', err?.message)
      socket.close(SYNC_CLOSE_CODE.failed)
    })

    this.startPingInterval()

    return new Response(null, { status: 101, webSocket: client })
  }

  private startPingInterval() {
    if (this.pingInterval !== null) return
    this.pingInterval = setInterval(() => {
      for (const socket of this.sockets) {
        if (socket.keyInfo.isMobile) {
          socket.send('ping')
        }
      }
    }, PING_INTERVAL_MS)
  }

  private createSocket(ws: WebSocket, keyInfo: LX.Sync.KeyInfo, user: LX.User): LX.Socket {
    let disconnected = false
    const closeHandlers: Array<(err: Error) => void> = []

    const msg2call = createMsg2call<LX.Sync.ClientSyncActions>({
      funcsObj: callObj,
      timeout: 120 * 1000,
      sendMessage: (data) => {
        if (disconnected) throw new Error('disconnected')
        void encryptMsg(keyInfo, JSON.stringify(data)).then(encrypted => {
          ws.send(encrypted)
        }).catch(err => {
          console.error('encrypt error:', err)
          ws.close(SYNC_CLOSE_CODE.failed)
        })
      },
      onCallBeforeParams: (rawArgs) => [socket, ...rawArgs],
      onError: (error, path, groupName) => {
        console.error(`sync call ${user.name} ${keyInfo.deviceName} ${groupName ?? ''} ${path.join('.')}:`, error)
      },
    })

    const socket: LX.Socket = {
      keyInfo,
      userInfo: user,
      isReady: false,
      moduleReadys: { list: false, dislike: false },
      feature: { list: false, dislike: false },
      syncRefs: { list: this.listSyncRef, dislike: this.dislikeSyncRef },
      remote: msg2call.remote as any,
      remoteQueueList: msg2call.createQueueRemote('list') as any,
      remoteQueueDislike: msg2call.createQueueRemote('dislike') as any,
      broadcast: (handler) => {
        for (const s of this.sockets) handler(s)
      },
      onClose: (handler) => {
        closeHandlers.push(handler)
        return () => { closeHandlers.splice(closeHandlers.indexOf(handler), 1) }
      },
      send: (data, cb) => {
        try { ws.send(data); cb?.() } catch (err: any) { cb?.(err) }
      },
      close: (code) => { ws.close(code) },
    }

    ws.addEventListener('message', (event) => {
      if (typeof event.data !== 'string') return
      void decryptMsg(keyInfo, event.data).then(data => {
        let parsed: any
        try { parsed = JSON.parse(data) } catch { ws.close(SYNC_CLOSE_CODE.failed); return }
        msg2call.message(parsed)
      }).catch(err => {
        console.error('decrypt error:', err)
        ws.close(SYNC_CLOSE_CODE.failed)
      })
    })

    ws.addEventListener('close', () => {
      disconnected = true
      msg2call.destroy()
      this.sockets.delete(socket)
      if (this.sockets.size === 0) {
        if (this.pingInterval !== null) {
          clearInterval(this.pingInterval)
          this.pingInterval = null
        }
        // Flush any throttle-deferred snapshot writes before DO may hibernate
        void this.userSpace?.flush()
      }
      const err = new Error('closed')
      for (const h of closeHandlers) { try { h(err) } catch {} }
      console.log('disconnected', user.name, keyInfo.deviceName)
    })

    return socket
  }

}
