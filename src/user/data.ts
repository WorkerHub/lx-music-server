export interface DevicesInfo {
  userName: string
  clients: Record<string, LX.Sync.KeyInfo>
}

// Module-level user context, written only by `setUsersContext` from the DO's
// `loadAndInit` path (REVIEW M6). It holds the whole LX_USERS roster plus the
// default snapshot cap, so `getUserConfig` can resolve a single user's config
// without a UserSpace. Constraint: every DO init rewrites it before any sync
// runs, and reads never escape the isolate, so it is safe as long as no code
// caches a `getUserConfig` result across an init.
let _users: LX.User[] = []
let _defaultMaxSnapshotNum = 10

export const setUsersContext = (
  users: LX.User[],
  defaultMaxSnapshotNum: number,
) => {
  _users = users
  _defaultMaxSnapshotNum = defaultMaxSnapshotNum
}

export interface UserConfig {
  maxSnapshotNum: number
  'list.addMusicLocationType': LX.AddMusicLocationType
}

export const getUserConfig = (userName: string): UserConfig => {
  const user = _users.find((u) => u.name === userName)
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

  constructor(devicesInfo: DevicesInfo, storage: DurableObjectStorage) {
    this.userName = devicesInfo.userName
    this.devicesInfo = devicesInfo
    this.storage = storage
  }

  private saveDevicesInfo = (): Promise<void> => {
    return this.storage.put('devices', this.devicesInfo)
  }

  getAllClientKeyInfo = (): LX.Sync.KeyInfo[] => {
    return Object.values(this.devicesInfo.clients).sort(
      (a, b) => (b.lastConnectDate ?? 0) - (a.lastConnectDate ?? 0),
    )
  }

  saveClientKeyInfo = async (keyInfo: LX.Sync.KeyInfo): Promise<void> => {
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
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.devicesInfo.clients[clientId]
    await this.saveDevicesInfo()
  }

  isIncludesClient = (clientId: string) => {
    return clientId in this.devicesInfo.clients
  }
}
