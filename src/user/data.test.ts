import { describe, expect, it } from 'vitest'
import { getUserConfig, removeUserContext, setUsersContext } from './data'

describe('per-user config context', () => {
  it('keeps one user config when another DO initializes in the same isolate', () => {
    setUsersContext(
      [
        {
          name: 'alice',
          maxSnapshotNum: 5,
          'list.addMusicLocationType': 'top',
        },
      ],
      20,
    )
    setUsersContext(
      [{ name: 'bob', 'list.addMusicLocationType': 'bottom' }],
      20,
    )

    expect(getUserConfig('alice')).toEqual({
      maxSnapshotNum: 5,
      'list.addMusicLocationType': 'top',
    })
    expect(getUserConfig('bob')).toEqual({
      maxSnapshotNum: 20,
      'list.addMusicLocationType': 'bottom',
    })
  })

  it('drops a purged user instead of leaving a stale entry', () => {
    setUsersContext([{ name: 'carol', maxSnapshotNum: 3 }], 20)
    removeUserContext('carol')

    expect(() => getUserConfig('carol')).toThrow('user not found: carol')
  })
})
