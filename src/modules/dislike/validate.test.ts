import { describe, expect, it } from 'vitest'
import { isValidDislikeAction } from './validate'

describe('isValidDislikeAction', () => {
  it('accepts dislike_data_overwrite with a string', () => {
    expect(
      isValidDislikeAction({ action: 'dislike_data_overwrite', data: 'rules' }),
    ).toBe(true)
  })

  it('accepts dislike_music_add with an array', () => {
    expect(
      isValidDislikeAction({
        action: 'dislike_music_add',
        data: [{ name: 'n', singer: 's' }],
      }),
    ).toBe(true)
  })

  it('accepts dislike_music_clear without a data payload', () => {
    expect(isValidDislikeAction({ action: 'dislike_music_clear' })).toBe(true)
  })

  it('rejects dislike_data_overwrite without a string data', () => {
    expect(isValidDislikeAction({ action: 'dislike_data_overwrite' })).toBe(
      false,
    )
    expect(
      isValidDislikeAction({ action: 'dislike_data_overwrite', data: 42 }),
    ).toBe(false)
  })

  it('rejects dislike_music_add without an array data', () => {
    expect(isValidDislikeAction({ action: 'dislike_music_add' })).toBe(false)
  })

  it('rejects an unknown action name', () => {
    expect(isValidDislikeAction({ action: 'nope', data: {} })).toBe(false)
  })
})
