import { SYNC_CLOSE_CODE } from '@/constants'
import { getUserSpace } from '@/user'
import { isValidDislikeAction } from '../validate'

const handleListAction = async (
  userName: string,
  payload: LX.Sync.Dislike.ActionList,
): Promise<string | null> => {
  // Skip malformed payloads instead of letting a TypeError crash the sync
  // handler (see REVIEW M3).
  if (!isValidDislikeAction(payload)) return null
  switch (payload.action) {
    case 'dislike_data_overwrite':
      await global.event_dislike.dislike_data_overwrite(
        userName,
        payload.data,
        true,
      )
      break
    case 'dislike_music_add':
      await global.event_dislike.dislike_music_add(userName, payload.data, true)
      break
    case 'dislike_music_clear':
      await global.event_dislike.dislike_music_clear(userName, true)
      break
    default:
      throw new Error('unknown dislike sync action')
  }
  const userSpace = getUserSpace(userName)
  const key = await userSpace.dislikeManage.createSnapshot()
  return key
}

const handler: LX.Sync.ServerSyncHandlerDislikeActions<LX.Socket> = {
  async onDislikeSyncAction(socket, action) {
    if (!socket.moduleReadys?.dislike) return
    const key = await handleListAction(socket.userInfo.name, action)
    if (key == null) return
    const userSpace = getUserSpace(socket.userInfo.name)
    await userSpace.dislikeManage.updateDeviceSnapshotKey(
      socket.keyInfo.clientId,
      key,
    )
    const currentUserName = socket.userInfo.name
    const currentId = socket.keyInfo.clientId
    socket.broadcast((client) => {
      if (
        client.keyInfo.clientId === currentId ||
        !client.moduleReadys?.dislike ||
        client.userInfo.name !== currentUserName
      )
        return
      void client.remoteQueueDislike
        .onDislikeSyncAction(action)
        .then(async () => {
          return userSpace.dislikeManage.updateDeviceSnapshotKey(
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
