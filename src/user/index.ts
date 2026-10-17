import { DislikeEvent, type DislikeEventType } from '@/modules/dislike/event'
import { DislikeManage } from '@/modules/dislike/manage'
import { ListEvent, type ListEventType } from '@/modules/list/event'
import { ListManage } from '@/modules/list/manage'
import type { SnapshotInfo } from '@/modules/snapshotDataManage'
import { type DevicesInfo, UserDataManage } from './data'

export interface UserSpace {
  dataManage: UserDataManage
  listManage: ListManage
  dislikeManage: DislikeManage
  // Per-user event emitters. They were previously module-level globals
  // (`global.event_list` / `global.event_dislike`) shared across every DO that
  // runs in the same isolate, which let one user's listeners observe another
  // user's events (REVIEW M6). Each UserSpace now owns its own emitter.
  listEvent: ListEventType
  dislikeEvent: DislikeEventType
  getDevices: () => Promise<LX.Sync.KeyInfo[]>
  removeDevice: (clientId: string) => Promise<void>
  flush: () => Promise<void>
}

// Module-level context keyed by userName. This exists because a single isolate
// can host multiple users' DurableObjects over time, and the sync/event code
// resolves "the current user's space" from a userName string rather than an
// injected reference. Constraint: the map is only ever written by
// `setUserSpace` from the DO's `loadAndInit` path, and every entry belongs to a
// distinct userName. It is never mutated elsewhere; entries are intentionally
// not evicted because a DO isolate is short-lived and reused names simply
// overwrite the previous space (the old DO is no longer served).
const _userSpaceMap = new Map<string, UserSpace>()

export const setUserSpace = (name: string, userSpace: UserSpace) => {
  if (!name) return
  _userSpaceMap.set(name, userSpace)
}

export const getUserSpace = (name: string): UserSpace => {
  if (!name) throw new Error('userName required')
  const userSpace = _userSpaceMap.get(name)
  if (!userSpace) throw new Error(`UserSpace not initialized: ${name}`)
  return userSpace
}

export const createUserSpace = (
  devicesInfo: DevicesInfo,
  storage: DurableObjectStorage,
  listSnapshotInfo: SnapshotInfo,
  listData: LX.Sync.List.ListData,
  dislikeSnapshotInfo: SnapshotInfo,
  dislikeRules: LX.Dislike.DislikeRules,
  maxSnapshotNum: number,
): UserSpace => {
  const dataManage = new UserDataManage(devicesInfo, storage)
  const listManage = new ListManage(
    storage,
    listSnapshotInfo,
    listData,
    maxSnapshotNum,
  )
  const dislikeManage = new DislikeManage(
    storage,
    dislikeSnapshotInfo,
    dislikeRules,
    maxSnapshotNum,
  )

  const userSpace: UserSpace = {
    dataManage,
    listManage,
    dislikeManage,
    listEvent: new ListEvent(),
    dislikeEvent: new DislikeEvent(),
    async getDevices() {
      return this.dataManage.getAllClientKeyInfo()
    },
    async removeDevice(clientId) {
      await listManage.removeDevice(clientId)
      await dislikeManage.removeDevice(clientId)
      await dataManage.removeClientKeyInfo(clientId)
    },
    async flush() {
      await Promise.all([listManage.flush(), dislikeManage.flush()])
    },
  }
  return userSpace
}

export * from './data'
