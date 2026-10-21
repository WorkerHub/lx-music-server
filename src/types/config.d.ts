declare namespace LX {
  type AddMusicLocationType = 'top' | 'bottom'

  interface User {
    name: string
    password?: string
    passwordHash?: string
    maxSnapshotNum?: number
    'list.addMusicLocationType'?: AddMusicLocationType
  }

  type RegistrationMode = 'closed' | 'open' | 'approval'
  type UserStatus = 'active' | 'pending' | 'disabled'
  type UserSource = 'imported' | 'self' | 'admin'

  // A user as stored in the registry DO. `passwordHash` is the unsalted MD5 the
  // LX Music protocol derives its AES key from, so it is always present here.
  interface RegistryUser extends User {
    status: UserStatus
    source: UserSource
    createdAt: number
  }

  // Tombstone left behind when an account is deleted: the sync data stays in
  // the user's DO, and the name is reserved until the admin restores the
  // account or purges the data.
  interface RegistryTombstone {
    name: string
    deletedAt: number
    source: UserSource
  }

  interface RegistrySettings {
    registrationMode: RegistrationMode
  }

  interface RegistryUserInput {
    name: string
    passwordHash: string
    status: UserStatus
    source: UserSource
    maxSnapshotNum?: number
    'list.addMusicLocationType'?: AddMusicLocationType
  }

  interface RateLimiterBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }

  interface Env {
    USER_SYNC: DurableObjectNamespace
    USER_REGISTRY: DurableObjectNamespace
    KV: KVNamespace
    LX_USERS?: string
    LX_ADMIN_PASSWORD_HASH?: string
    SERVER_NAME: string
    RATE_LIMITER?: RateLimiterBinding
    // Public build metadata injected by the deploy workflow (see
    // `.github/workflows/deploy.yml`), surfaced by GET /api/admin/build-info.
    BUILD_VERSION?: string
    BUILD_COMMIT?: string
    BUILD_TIME?: string
  }
}
