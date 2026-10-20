// The registry lives in a single Durable Object instance so that name
// uniqueness checks and writes are serialized by the DO (no KV read-modify-write
// races). The name is reserved: user accounts may not start with `__`.
export const REGISTRY_DO_NAME = '__registry__'

// Mirrors the default the UserSyncDO passes into `setUsersContext`.
export const DEFAULT_MAX_SNAPSHOT_NUM = 20
export const DEFAULT_ADD_MUSIC_LOCATION_TYPE: LX.AddMusicLocationType = 'bottom'

export const REGISTRY_USERS_KEY = 'users'
export const REGISTRY_TOMBSTONES_KEY = 'tombstones'
export const REGISTRY_SETTINGS_KEY = 'settings'
export const REGISTRY_SEEDED_KEY = 'seeded'
