import { DislikeManage } from '@/modules/dislike/manage'
import { ListManage } from '@/modules/list/manage'
import { type DevicesInfo, UserDataManage } from './data'

export interface UserSpace {
  dataManage: UserDataManage
  listManage: ListManage
  dislikeManage: DislikeManage
  getDevices: () => Promise<LX.Sync.KeyInfo[]>
  removeDevice: (clientId: string) => Promise<void>
  flush: () => Promise<void>
}

// 模块级上下文，按 userName 隔离，避免多用户 DO 复用同一 isolate 时串号
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
  listSnapshotInfo: any,
  listData: LX.Sync.List.ListData,
  dislikeSnapshotInfo: any,
  dislikeRules: LX.Dislike.DislikeRules,
  userName: string,
  maxSnapshotNum: number,
): UserSpace => {
  const dataManage = new UserDataManage(devicesInfo, storage)
  const listManage = new ListManage(
    storage,
    listSnapshotInfo,
    listData,
    userName,
    maxSnapshotNum,
  )
  const dislikeManage = new DislikeManage(
    storage,
    dislikeSnapshotInfo,
    dislikeRules,
    userName,
    maxSnapshotNum,
  )

  const userSpace: UserSpace = {
    dataManage,
    listManage,
    dislikeManage,
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
