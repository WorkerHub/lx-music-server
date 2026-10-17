declare namespace LX {
  type AddMusicLocationType = 'top' | 'bottom'

  interface User {
    name: string
    password?: string
    passwordHash?: string
    maxSnapshotNum?: number
    'list.addMusicLocationType'?: AddMusicLocationType
  }

  interface RateLimiterBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>
  }

  interface Env {
    USER_SYNC: DurableObjectNamespace
    KV: KVNamespace
    LX_USERS: string
    SERVER_NAME: string
    RATE_LIMITER?: RateLimiterBinding
  }
}
