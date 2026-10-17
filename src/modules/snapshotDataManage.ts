import { throttle } from '@/utils/common'

// A snapshot entry tracked per device. The list and dislike snapshot managers
// were near-identical (REVIEW L4); the only real difference is the type of the
// snapshot payload they store. `LX.Sync.List.ListInfo` and
// `LX.Sync.Dislike.ListInfo` are structurally identical, so this file models
// them with a single `SnapshotListInfo` and makes the class generic over the
// stored payload `TData` instead of duplicating the whole manager per feature.
export interface SnapshotListInfo {
  lastSyncDate?: number
  snapshotKey: string
}

export interface SnapshotInfo {
  latest: string | null
  time: number
  list: string[]
  clients: Record<string, SnapshotListInfo>
}

export class SnapshotDataManage<TData> {
  private storage: DurableObjectStorage
  private prefix: 'list' | 'dislike'
  private maxSnapshotNum: number
  snapshotInfo: SnapshotInfo
  // Reference count per snapshot key. Multiple devices can share the same
  // snapshot key, so a plain Set would drop the protection the moment one
  // device moves on — leaving the other device's snapshot free to be cleared
  // (see REVIEW L3). A count only releases a key when every referrer is gone.
  private clientSnapshotKeys = new Map<string, number>()
  private readonly saveSnapshotInfoThrottle: () => void
  // Converts the serialized payload (a JSON string for list snapshots, the raw
  // rules string for dislike) into the value actually stored in DO storage.
  private readonly parseSnapshotData: (data: string) => TData

  private incrementRef = (key: string) => {
    if (!key) return
    this.clientSnapshotKeys.set(
      key,
      (this.clientSnapshotKeys.get(key) ?? 0) + 1,
    )
  }

  private decrementRef = (key: string) => {
    if (!key) return
    const count = (this.clientSnapshotKeys.get(key) ?? 0) - 1
    if (count <= 0) this.clientSnapshotKeys.delete(key)
    else this.clientSnapshotKeys.set(key, count)
  }

  isIncludesDevice = (key: string) => {
    return this.clientSnapshotKeys.has(key)
  }

  clearOldSnapshot = async () => {
    if (!this.snapshotInfo) return
    const snapshotList = this.snapshotInfo.list.filter(
      (key) => !this.isIncludesDevice(key),
    )
    if (snapshotList.length <= this.maxSnapshotNum) return
    // `list` is ordered newest-first, so everything past the first
    // `maxSnapshotNum` entries is the oldest and safe to remove.
    for (const name of snapshotList.slice(this.maxSnapshotNum)) {
      await this.removeSnapshot(name)
      const index = this.snapshotInfo.list.indexOf(name)
      if (index >= 0) this.snapshotInfo.list.splice(index, 1)
    }
    // The pruned index is critical — persist it directly (not throttled).
    await this.persistSnapshotInfo()
  }

  updateDeviceSnapshotKey = async (clientId: string, key: string) => {
    let client = this.snapshotInfo.clients[clientId]
    if (!client)
      client = this.snapshotInfo.clients[clientId] = {
        snapshotKey: '',
        lastSyncDate: 0,
      }
    if (client.snapshotKey) this.decrementRef(client.snapshotKey)
    client.snapshotKey = key
    client.lastSyncDate = Date.now()
    this.incrementRef(key)
    // The per-device snapshotKey rebuilds the reference count on restart, so it
    // must not sit behind the throttle timer (REVIEW M2): write through now.
    // Pruning still runs on the next createSnapshot (via saveSnapshotInfo).
    await this.persistSnapshotInfo()
  }

  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    const client = this.snapshotInfo.clients[clientId]
    return client?.snapshotKey
  }

  getSnapshotInfo = async (): Promise<SnapshotInfo> => {
    return this.snapshotInfo
  }

  // Critical path: called right after a snapshot is created. The snapshot
  // index (latest/list/time) must survive a DO eviction, so it is written
  // directly and awaited instead of relying on the throttle timer (REVIEW M2).
  saveSnapshotInfo = async (info: SnapshotInfo) => {
    this.snapshotInfo = info
    await this.persistSnapshotInfo()
    await this.clearOldSnapshot()
  }

  removeSnapshotInfo = (clientId: string) => {
    const client = this.snapshotInfo.clients[clientId]
    if (!client) return
    if (client.snapshotKey) this.decrementRef(client.snapshotKey)
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.snapshotInfo.clients[clientId]
    this.saveSnapshotInfoThrottle()
  }

  getSnapshot = async (name: string): Promise<TData | null> => {
    try {
      const data = await this.storage.get<TData>(`${this.prefix}:snap:${name}`)
      return data ?? null
    } catch (err) {
      console.error(err)
      return null
    }
  }

  saveSnapshot = async (name: string, data: string) => {
    await this.storage.put(
      `${this.prefix}:snap:${name}`,
      this.parseSnapshotData(data),
    )
  }

  removeSnapshot = async (name: string) => {
    await this.storage.delete(`${this.prefix}:snap:${name}`)
  }

  persistSnapshotInfo = async (): Promise<void> => {
    await this.storage.put(`${this.prefix}:snapshotInfo`, this.snapshotInfo)
  }

  flush = async (): Promise<void> => {
    await this.persistSnapshotInfo()
  }

  constructor(
    storage: DurableObjectStorage,
    prefix: 'list' | 'dislike',
    preloadedSnapshotInfo: SnapshotInfo,
    maxSnapshotNum: number,
    parseSnapshotData: (data: string) => TData,
  ) {
    this.storage = storage
    this.prefix = prefix
    this.maxSnapshotNum = maxSnapshotNum
    this.snapshotInfo = preloadedSnapshotInfo
    this.parseSnapshotData = parseSnapshotData

    // Only device removal is throttled now. Its write can only over-protect a
    // snapshot if lost (the stale entry still references the key), never drop
    // data. snapshotKey updates and the snapshot index persist eagerly.
    this.saveSnapshotInfoThrottle = throttle(() => {
      void this.persistSnapshotInfo()
        .then(() => {
          return this.clearOldSnapshot()
        })
        .catch((err) => console.error(err))
    })

    for (const device of Object.values(this.snapshotInfo.clients)) {
      if (device.snapshotKey) this.incrementRef(device.snapshotKey)
    }
  }
}
