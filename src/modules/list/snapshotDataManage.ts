import { throttle } from '@/utils/common'

interface SnapshotInfo {
  latest: string | null
  time: number
  list: string[]
  clients: Record<string, LX.Sync.List.ListInfo>
}

export class SnapshotDataManage {
  private storage: DurableObjectStorage
  private prefix: 'list' | 'dislike'
  private maxSnapshotNum: number
  snapshotInfo: SnapshotInfo
  clientSnapshotKeys: Set<string>
  private readonly saveSnapshotInfoThrottle: () => void

  isIncludesDevice = (key: string) => {
    return this.clientSnapshotKeys.has(key)
  }

  clearOldSnapshot = async () => {
    if (!this.snapshotInfo) return
    const snapshotList = this.snapshotInfo.list.filter(
      (key) => !this.isIncludesDevice(key),
    )
    const requiredSave = snapshotList.length > this.maxSnapshotNum
    while (snapshotList.length > this.maxSnapshotNum) {
      const name = snapshotList.pop()
      if (name) {
        await this.removeSnapshot(name)
        this.snapshotInfo.list.splice(this.snapshotInfo.list.indexOf(name), 1)
      } else break
    }
    if (requiredSave) this.saveSnapshotInfo(this.snapshotInfo)
  }

  updateDeviceSnapshotKey = async (clientId: string, key: string) => {
    let client = this.snapshotInfo.clients[clientId]
    if (!client)
      client = this.snapshotInfo.clients[clientId] = {
        snapshotKey: '',
        lastSyncDate: 0,
      }
    if (client.snapshotKey) this.clientSnapshotKeys.delete(client.snapshotKey)
    client.snapshotKey = key
    client.lastSyncDate = Date.now()
    this.clientSnapshotKeys.add(key)
    this.saveSnapshotInfoThrottle()
  }

  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    const client = this.snapshotInfo.clients[clientId]
    return client?.snapshotKey
  }

  getSnapshotInfo = async (): Promise<SnapshotInfo> => {
    return this.snapshotInfo
  }

  saveSnapshotInfo = (info: SnapshotInfo) => {
    this.snapshotInfo = info
    this.saveSnapshotInfoThrottle()
  }

  removeSnapshotInfo = (clientId: string) => {
    const client = this.snapshotInfo.clients[clientId]
    if (!client) return
    if (client.snapshotKey) this.clientSnapshotKeys.delete(client.snapshotKey)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.snapshotInfo.clients[clientId]
    this.saveSnapshotInfoThrottle()
  }

  getSnapshot = async (name: string): Promise<LX.Sync.List.ListData | null> => {
    try {
      const data = await this.storage.get<LX.Sync.List.ListData>(
        `${this.prefix}:snap:${name}`,
      )
      return data ?? null
    } catch (err) {
      console.error(err)
      return null
    }
  }

  saveSnapshot = async (name: string, data: string) => {
    await this.storage.put(`${this.prefix}:snap:${name}`, JSON.parse(data))
  }

  removeSnapshot = async (name: string) => {
    await this.storage.delete(`${this.prefix}:snap:${name}`)
  }

  flush = async (): Promise<void> => {
    await this.storage.put(`${this.prefix}:snapshotInfo`, this.snapshotInfo)
  }

  constructor(
    storage: DurableObjectStorage,
    prefix: 'list' | 'dislike',
    preloadedSnapshotInfo: SnapshotInfo,
    _userName: string,
    maxSnapshotNum: number,
  ) {
    this.storage = storage
    this.prefix = prefix
    this.maxSnapshotNum = maxSnapshotNum
    this.snapshotInfo = preloadedSnapshotInfo

    this.saveSnapshotInfoThrottle = throttle(() => {
      void this.storage
        .put(`${this.prefix}:snapshotInfo`, this.snapshotInfo)
        .then(() => {
          return this.clearOldSnapshot()
        })
        .catch((err) => console.error(err))
    })

    this.clientSnapshotKeys = new Set(
      Object.values(this.snapshotInfo.clients)
        .map((device) => device.snapshotKey)
        .filter((k) => k),
    )
  }
}
