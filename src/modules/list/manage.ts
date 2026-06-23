import { toMD5 } from '@/utils'
import { ListDataManage } from './listDataManage'
import { SnapshotDataManage } from './snapshotDataManage'

export class ListManage {
  snapshotDataManage: SnapshotDataManage
  listDataManage: ListDataManage

  constructor(
    storage: DurableObjectStorage,
    preloadedSnapshotInfo: {
      latest: string | null
      time: number
      list: string[]
      clients: Record<string, LX.Sync.List.ListInfo>
    },
    preloadedListData: LX.Sync.List.ListData,
    userName: string,
    maxSnapshotNum: number,
  ) {
    this.snapshotDataManage = new SnapshotDataManage(
      storage,
      'list',
      preloadedSnapshotInfo,
      userName,
      maxSnapshotNum,
    )
    this.listDataManage = new ListDataManage(
      this.snapshotDataManage,
      preloadedListData,
    )
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
    this.snapshotDataManage.saveSnapshotInfo(snapshotInfo)
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

  flush = async (): Promise<void> => {
    await this.snapshotDataManage.flush()
  }

  getListData = async () => {
    return await this.listDataManage.getListData()
  }
}
