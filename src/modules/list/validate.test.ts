import { describe, expect, it } from 'vitest'
import { isValidListAction } from './validate'

describe('isValidListAction', () => {
  it('accepts a well-formed list_update_position action', () => {
    expect(
      isValidListAction({
        action: 'list_update_position',
        data: { position: 1, ids: ['a', 'b'] },
      }),
    ).toBe(true)
  })

  it('accepts a well-formed list_music_update_position action', () => {
    expect(
      isValidListAction({
        action: 'list_music_update_position',
        data: { listId: 'a', position: 0, ids: ['a1'] },
      }),
    ).toBe(true)
  })

  it('accepts list_remove with a string array', () => {
    expect(isValidListAction({ action: 'list_remove', data: ['a'] })).toBe(true)
  })

  it('rejects a missing data payload', () => {
    expect(isValidListAction({ action: 'list_update_position' })).toBe(false)
  })

  it('rejects a non-string id array', () => {
    expect(
      isValidListAction({
        action: 'list_update_position',
        data: { position: 1, ids: [42] },
      }),
    ).toBe(false)
  })

  it('rejects a non-object action', () => {
    expect(isValidListAction('list_update_position')).toBe(false)
    expect(isValidListAction(null)).toBe(false)
  })

  it('rejects an unknown action name', () => {
    expect(isValidListAction({ action: 'not_an_action', data: {} })).toBe(false)
  })

  it('rejects list_update entries without a string id', () => {
    expect(
      isValidListAction({ action: 'list_update', data: [{ name: 'A' }] }),
    ).toBe(false)
    expect(isValidListAction({ action: 'list_update', data: [null] })).toBe(
      false,
    )
  })

  it('accepts list_update entries with a string id', () => {
    expect(
      isValidListAction({
        action: 'list_update',
        data: [{ id: 'a', name: 'A', locationUpdateTime: 0 }],
      }),
    ).toBe(true)
  })

  it('rejects list_create with a listInfos entry missing a string id', () => {
    expect(
      isValidListAction({
        action: 'list_create',
        data: { position: 0, listInfos: [{ name: 'A' }] },
      }),
    ).toBe(false)
  })
})
