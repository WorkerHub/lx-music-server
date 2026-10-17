// Runtime shape validation for dislike sync action payloads (see REVIEW M3).

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const isArray = (v: unknown): v is unknown[] => Array.isArray(v)

export const isValidDislikeAction = (
  action: unknown,
): action is LX.Sync.Dislike.ActionList => {
  if (!isObject(action) || typeof action.action !== 'string') return false
  switch (action.action) {
    case 'dislike_data_overwrite':
      return typeof action.data === 'string'
    case 'dislike_music_add':
      return isArray(action.data)
    case 'dislike_music_clear':
      return true
    default:
      return false
  }
}
