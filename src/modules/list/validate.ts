// Runtime shape validation for list sync action payloads. The sync handler
// runs on untrusted client input, so a malformed payload must be skipped
// rather than crash the DO with a TypeError (see REVIEW M3).

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isArray = (v: unknown): v is unknown[] => Array.isArray(v)

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

const isMusicLocationType = (v: unknown): v is LX.AddMusicLocationType =>
  v === 'top' || v === 'bottom'

export const isValidListAction = (
  action: unknown,
): action is LX.Sync.List.ActionList => {
  if (!isObject(action) || typeof action.action !== 'string') return false
  switch (action.action) {
    case 'list_data_overwrite': {
      const d = action.data
      return (
        isObject(d) &&
        isArray(d.defaultList) &&
        isArray(d.loveList) &&
        isArray(d.userList)
      )
    }
    case 'list_create': {
      const d = action.data
      return (
        isObject(d) && typeof d.position === 'number' && isArray(d.listInfos)
      )
    }
    case 'list_remove':
      return isStringArray(action.data)
    case 'list_update':
      return isArray(action.data)
    case 'list_update_position': {
      const d = action.data
      return (
        isObject(d) && typeof d.position === 'number' && isStringArray(d.ids)
      )
    }
    case 'list_music_add': {
      const d = action.data
      return (
        isObject(d) &&
        typeof d.id === 'string' &&
        isArray(d.musicInfos) &&
        isMusicLocationType(d.addMusicLocationType)
      )
    }
    case 'list_music_move': {
      const d = action.data
      return (
        isObject(d) &&
        typeof d.fromId === 'string' &&
        typeof d.toId === 'string' &&
        isArray(d.musicInfos) &&
        isMusicLocationType(d.addMusicLocationType)
      )
    }
    case 'list_music_remove': {
      const d = action.data
      return isObject(d) && typeof d.listId === 'string' && isStringArray(d.ids)
    }
    case 'list_music_update':
      return (
        isArray(action.data) &&
        action.data.every(
          (item) =>
            isObject(item) &&
            typeof item.id === 'string' &&
            isObject(item.musicInfo),
        )
      )
    case 'list_music_update_position': {
      const d = action.data
      return (
        isObject(d) &&
        typeof d.listId === 'string' &&
        typeof d.position === 'number' &&
        isStringArray(d.ids)
      )
    }
    case 'list_music_overwrite': {
      const d = action.data
      return (
        isObject(d) && typeof d.listId === 'string' && isArray(d.musicInfos)
      )
    }
    case 'list_music_clear':
      return isStringArray(action.data)
    default:
      return false
  }
}
