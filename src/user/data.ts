export interface DevicesInfo {
  userName: string
  clients: Record<string, LX.Sync.KeyInfo>
}

// Module-level per-user config, written only by `setUsersContext` from the DO's
// `loadAndInit`/WS-upgrade paths (REVIEW M6). It is a Map keyed by user name
// because a single isolate can host several UserSyncDOs: one user's init must
// never evict another user's config while that user's sync is running (each
// entry is upserted, not replaced wholesale).
const _users = new Map<string, LX.User>()
let _defaultMaxSnapshotNum = 10

export const setUsersContext = (
  users: LX.User[],
  defaultMaxSnapshotNum: number,
) => {
  for (const user of users) _users.set(user.name, user)
  _defaultMaxSnapshotNum = defaultMaxSnapshotNum
}

// Drops a purged/deleted user's config so a stale entry cannot leak into a
// later incarnation of the same name.
export const removeUserContext = (userName: string) => {
  _users.delete(userName)
}

export interface UserConfig {
  maxSnapshotNum: number
  'list.addMusicLocationType': LX.AddMusicLocationType
}

export const getUserConfig = (userName: string): UserConfig => {
  const user = _users.get(userName)
  if (!user) throw new Error(`user not found: ${userName}`)
  return {
    maxSnapshotNum: user.maxSnapshotNum ?? _defaultMaxSnapshotNum,
    'list.addMusicLocationType': user['list.addMusicLocationType'] ?? 'bottom',
  }
}

export const createClientKeyInfo = (
  deviceName: string,
  isMobile: boolean,
): LX.Sync.KeyInfo => {
  const randBytes = crypto.getRandomValues(new Uint8Array(16))
  const keyBytes = crypto.getRandomValues(new Uint8Array(16))
  const keyInfo: LX.Sync.KeyInfo = {
    clientId: btoa(String.fromCharCode(...randBytes)),
    key: btoa(String.fromCharCode(...keyBytes)),
    deviceName,
    isMobile,
    lastConnectDate: 0,
  }
  return keyInfo
}

// UserDataManage: DO storage 版本（由 UserSyncDO 持有并注入到 UserSpace）
export class UserDataManage {
  userName: string
  private storage: DurableObjectStorage
  devicesInfo: DevicesInfo
  // Purge support: an in-flight auth handler must not rewrite the device list
  // after the DO's storage was wiped.
  private disposed = false

  constructor(devicesInfo: DevicesInfo, storage: DurableObjectStorage) {
    this.userName = devicesInfo.userName
    this.devicesInfo = devicesInfo
    this.storage = storage
  }

  private saveDevicesInfo = (): Promise<void> => {
    if (this.disposed) return Promise.resolve()
    return this.storage.put('devices', this.devicesInfo)
  }

  dispose = () => {
    this.disposed = true
  }

  getAllClientKeyInfo = (): LX.Sync.KeyInfo[] => {
    return Object.values(this.devicesInfo.clients).sort(
      (a, b) => (b.lastConnectDate ?? 0) - (a.lastConnectDate ?? 0),
    )
  }

  saveClientKeyInfo = async (keyInfo: LX.Sync.KeyInfo): Promise<void> => {
    if (this.disposed) return
    if (
      this.devicesInfo.clients[keyInfo.clientId] == null &&
      Object.keys(this.devicesInfo.clients).length >= 100
    )
      throw new Error('max keys')
    this.devicesInfo.clients[keyInfo.clientId] = keyInfo
    await this.saveDevicesInfo()
  }

  getClientKeyInfo = (clientId: string | null): LX.Sync.KeyInfo | null => {
    if (!clientId) return null
    return this.devicesInfo.clients[clientId] ?? null
  }

  removeClientKeyInfo = async (clientId: string): Promise<void> => {
    if (this.disposed) return
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.devicesInfo.clients[clientId]
    await this.saveDevicesInfo()
  }

  isIncludesClient = (clientId: string) => {
    return clientId in this.devicesInfo.clients
  }
}
