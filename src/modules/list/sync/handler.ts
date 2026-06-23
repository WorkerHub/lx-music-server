import { SYNC_CLOSE_CODE } from '@/constants'
import { getUserSpace } from '@/user'

const handleListAction = async (
  userName: string,
  { action, data }: LX.Sync.List.ActionList,
) => {
  switch (action) {
    case 'list_data_overwrite':
      await global.event_list.list_data_overwrite(userName, data, true)
      break
    case 'list_create':
      await global.event_list.list_create(
        userName,
        data.position,
        data.listInfos,
        true,
      )
      break
    case 'list_remove':
      await global.event_list.list_remove(userName, data, true)
      break
    case 'list_update':
      await global.event_list.list_update(userName, data, true)
      break
    case 'list_update_position':
      await global.event_list.list_update_position(
        userName,
        data.position,
        data.ids,
        true,
      )
      break
    case 'list_music_add':
      await global.event_list.list_music_add(
        userName,
        data.id,
        data.musicInfos,
        data.addMusicLocationType,
        true,
      )
      break
    case 'list_music_move':
      await global.event_list.list_music_move(
        userName,
        data.fromId,
        data.toId,
        data.musicInfos,
        data.addMusicLocationType,
        true,
      )
      break
    case 'list_music_remove':
      await global.event_list.list_music_remove(
        userName,
        data.listId,
        data.ids,
        true,
      )
      break
    case 'list_music_update':
      await global.event_list.list_music_update(userName, data, true)
      break
    case 'list_music_update_position':
      await global.event_list.list_music_update_position(
        userName,
        data.listId,
        data.position,
        data.ids,
        true,
      )
      break
    case 'list_music_overwrite':
      await global.event_list.list_music_overwrite(
        userName,
        data.listId,
        data.musicInfos,
        true,
      )
      break
    case 'list_music_clear':
      await global.event_list.list_music_clear(userName, data, true)
      break
    default:
      throw new Error('unknown list sync action')
  }
  const userSpace = getUserSpace(userName)
  const key = await userSpace.listManage.createSnapshot()
  return key
}

const handler: LX.Sync.ServerSyncHandlerListActions<LX.Socket> = {
  async onListSyncAction(socket, action) {
    if (!socket.moduleReadys?.list) return
    const key = await handleListAction(socket.userInfo.name, action)
    const userSpace = getUserSpace(socket.userInfo.name)
    await userSpace.listManage.updateDeviceSnapshotKey(
      socket.keyInfo.clientId,
      key,
    )
    const currentUserName = socket.userInfo.name
    const currentId = socket.keyInfo.clientId
    socket.broadcast((client) => {
      if (
        client.keyInfo.clientId === currentId ||
        !client.moduleReadys?.list ||
        client.userInfo.name !== currentUserName
      )
        return
      void client.remoteQueueList
        .onListSyncAction(action)
        .then(async () => {
          return userSpace.listManage.updateDeviceSnapshotKey(
            client.keyInfo.clientId,
            key,
          )
        })
        .catch((err) => {
          client.close(SYNC_CLOSE_CODE.failed)
          console.error(err.message)
        })
    })
  },
}

export default handler
