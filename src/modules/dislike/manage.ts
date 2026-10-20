import { toMD5 } from '@/utils'
import { SnapshotDataManage, type SnapshotInfo } from '../snapshotDataManage'
import { DislikeDataManage } from './dislikeDataManage'

export class DislikeManage {
  snapshotDataManage: SnapshotDataManage<LX.Dislike.DislikeRules>
  dislikeDataManage: DislikeDataManage

  constructor(
    storage: DurableObjectStorage,
    preloadedSnapshotInfo: SnapshotInfo,
    preloadedDislikeRules: LX.Dislike.DislikeRules,
    maxSnapshotNum: number,
  ) {
    this.snapshotDataManage = new SnapshotDataManage(
      storage,
      'dislike',
      preloadedSnapshotInfo,
      maxSnapshotNum,
      (data) => data,
    )
    this.dislikeDataManage = new DislikeDataManage(preloadedDislikeRules)
  }

  createSnapshot = async () => {
    const listData = await this.getDislikeRules()
    const md5 = toMD5(listData.trim())
    const snapshotInfo = await this.snapshotDataManage.getSnapshotInfo()
    if (snapshotInfo.latest === md5) return md5
    if (snapshotInfo.list.includes(md5)) {
      snapshotInfo.list.splice(snapshotInfo.list.indexOf(md5), 1)
    } else await this.snapshotDataManage.saveSnapshot(md5, listData)
    if (snapshotInfo.latest) snapshotInfo.list.unshift(snapshotInfo.latest)
    snapshotInfo.latest = md5
    snapshotInfo.time = Date.now()
    await this.snapshotDataManage.saveSnapshotInfo(snapshotInfo)
    return md5
  }

  getCurrentListInfoKey = async () => {
    const snapshotInfo = await this.snapshotDataManage.getSnapshotInfo()
    if (snapshotInfo.latest) return snapshotInfo.latest
    return this.createSnapshot()
  }

  getDeviceCurrentSnapshotKey = async (clientId: string) => {
    return this.snapshotDataManage.getDeviceCurrentSnapshotKey(clientId)
  }

  updateDeviceSnapshotKey = async (clientId: string, key: string) => {
    await this.snapshotDataManage.updateDeviceSnapshotKey(clientId, key)
  }

  removeDevice = async (clientId: string) => {
    this.snapshotDataManage.removeSnapshotInfo(clientId)
  }

  // Admin purge: stop every pending/future snapshot write for this user.
  dispose = () => {
    this.snapshotDataManage.dispose()
  }

  setMaxSnapshotNum = (value: number) => {
    this.snapshotDataManage.setMaxSnapshotNum(value)
  }

  flush = async (): Promise<void> => {
    await this.snapshotDataManage.flush()
  }

  getDislikeRules = async () => {
    return await this.dislikeDataManage.getDislikeRules()
  }
}
