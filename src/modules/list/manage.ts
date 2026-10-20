import { toMD5 } from '@/utils'
import { SnapshotDataManage, type SnapshotInfo } from '../snapshotDataManage'
import { ListDataManage } from './listDataManage'

export class ListManage {
  snapshotDataManage: SnapshotDataManage<LX.Sync.List.ListData>
  listDataManage: ListDataManage

  constructor(
    storage: DurableObjectStorage,
    preloadedSnapshotInfo: SnapshotInfo,
    preloadedListData: LX.Sync.List.ListData,
    maxSnapshotNum: number,
  ) {
    this.snapshotDataManage = new SnapshotDataManage(
      storage,
      'list',
      preloadedSnapshotInfo,
      maxSnapshotNum,
      (data) => JSON.parse(data) as LX.Sync.List.ListData,
    )
    this.listDataManage = new ListDataManage(preloadedListData)
  }

  createSnapshot = async () => {
    const listData = JSON.stringify(await this.getListData())
    const md5 = toMD5(listData)
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

  getListData = async () => {
    return await this.listDataManage.getListData()
  }
}
