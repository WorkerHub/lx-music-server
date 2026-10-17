declare namespace LX {
  interface Socket {
    keyInfo: LX.Sync.KeyInfo
    userInfo: LX.User
    isReady: boolean
    moduleReadys: { list: boolean; dislike: boolean }
    feature: {
      list: false | LX.Sync.ListConfig
      dislike: false | LX.Sync.DislikeConfig
    }
    remote: LX.Sync.ClientSyncActions
    remoteQueueList: LX.Sync.ClientSyncListActions
    remoteQueueDislike: LX.Sync.ClientSyncDislikeActions
    syncRefs: {
      list: { current: string | null }
      dislike: { current: string | null }
    }
    broadcast: (handler: (client: LX.Socket) => void) => void
    onClose: (handler: (err: Error) => void) => () => void
    send: (data: string, cb?: (err?: Error) => void) => void
    close: (code?: number) => void
  }

  interface SocketServer {
    clients: Set<LX.Socket>
  }
}

// MakeOptional utility
type MakeOptional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

// WarpPromiseRecord（sync_common.d.ts 中使用）
type WarpPromiseRecord<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : T[K]
}
