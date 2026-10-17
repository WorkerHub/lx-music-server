import { beforeEach, describe, expect, it } from 'vitest'
import { setUsersContext } from '@/user/data'
import { mergeList, mergeListDataFromSnapshot, overwriteList } from './sync'

const music = (id: string): LX.Music.MusicInfo =>
  ({
    id,
    name: id,
    singer: 's',
    source: 'kw',
    interval: null,
    meta: {},
  }) as LX.Music.MusicInfo

const ids = (list: LX.Music.MusicInfo[]) => list.map((m) => m.id)

const userListInfo = (
  id: string,
  list: string[],
  locationUpdateTime: number | null = 0,
): LX.List.UserListInfoFull => ({
  id,
  name: `L${id}`,
  locationUpdateTime,
  list: list.map(music),
})

const listData = (
  defaultList: string[],
  loveList: string[],
  userList: LX.List.UserListInfoFull[] = [],
): LX.Sync.List.ListData => ({
  defaultList: defaultList.map(music),
  loveList: loveList.map(music),
  userList,
})

const socketFor = (name: string): LX.Socket =>
  ({ userInfo: { name } }) as unknown as LX.Socket

const configureUser = (addMusicLocationType: LX.AddMusicLocationType) => {
  setUsersContext(
    [{ name: 'u', 'list.addMusicLocationType': addMusicLocationType }],
    20,
  )
}

describe('mergeListDataFromSnapshot (list)', () => {
  it('keeps items added on both sides, dropping only duplicates', () => {
    // snapshot=[A], source added B, target added C.
    const result = mergeListDataFromSnapshot(
      [music('A'), music('B')],
      [music('A'), music('C')],
      [music('A')],
      'bottom',
    )
    expect(ids(result)).toEqual(['A', 'B', 'C'])
  })

  it('propagates a deletion on one side even when the other side still has it', () => {
    // B was in the snapshot; source deleted it, target still holds it.
    const result = mergeListDataFromSnapshot(
      [music('A')],
      [music('A'), music('B')],
      [music('A'), music('B')],
      'bottom',
    )
    expect(ids(result)).toEqual(['A'])
  })

  it('orders target-only items first for "top" and last for "bottom"', () => {
    const source = [music('A'), music('B')]
    const target = [music('A'), music('B'), music('C')]
    const snapshot = [music('A'), music('B')]

    expect(
      ids(mergeListDataFromSnapshot(source, target, snapshot, 'bottom')),
    ).toEqual(['A', 'B', 'C'])
    expect(
      ids(mergeListDataFromSnapshot(source, target, snapshot, 'top')),
    ).toEqual(['C', 'A', 'B'])
  })

  it('returns an empty list for empty source/target/snapshot', () => {
    expect(ids(mergeListDataFromSnapshot([], [], [], 'bottom'))).toEqual([])
  })

  it('treats an item present only in the snapshot as deleted', () => {
    const result = mergeListDataFromSnapshot(
      [],
      [music('A')],
      [music('A')],
      'bottom',
    )
    expect(ids(result)).toEqual([])
  })

  it('deduplicates repeated ids within a single side', () => {
    const result = mergeListDataFromSnapshot(
      [music('A'), music('A'), music('B')],
      [music('B'), music('C')],
      [],
      'bottom',
    )
    expect(ids(result)).toEqual(['A', 'B', 'C'])
  })
})

describe('overwriteList (list)', () => {
  it('uses source lists and merges target-only user lists', () => {
    const source = listData(['A', 'B'], ['L1'], [userListInfo('1', ['m1'])])
    const target = listData(['X'], ['L9'], [userListInfo('2', ['m2'])])
    const result = overwriteList(source, target)

    expect(ids(result.defaultList)).toEqual(['A', 'B'])
    expect(ids(result.loveList)).toEqual(['L1'])
    expect(result.userList.map((l) => l.id)).toEqual(['1', '2'])
  })

  it('ignores target user lists that source already has', () => {
    const source = listData([], [], [userListInfo('1', ['m1'])])
    const target = listData([], [], [userListInfo('1', ['m2'])])
    const result = overwriteList(source, target)

    expect(result.userList.map((l) => l.id)).toEqual(['1'])
    expect(ids(result.userList[0].list)).toEqual(['m1'])
  })

  it('returns source unchanged when target is empty', () => {
    const source = listData(['A'], ['L'], [userListInfo('1', ['m1'])])
    const result = overwriteList(source, listData([], [], []))

    expect(ids(result.defaultList)).toEqual(['A'])
    expect(result.userList.map((l) => l.id)).toEqual(['1'])
  })

  it('splices target-only lists by index when they have an update time, else pushes', () => {
    const source = listData([], [], [userListInfo('1', ['m1'], 0)])
    const target = listData(
      [],
      [],
      [userListInfo('2', ['m2'], 100), userListInfo('3', ['m3'], 0)],
    )
    const result = overwriteList(source, target)

    // list 2 has an update time → inserted at index 0; list 3 → appended.
    expect(result.userList.map((l) => l.id)).toEqual(['2', '1', '3'])
  })
})

describe('mergeList (list)', () => {
  beforeEach(() => configureUser('bottom'))

  it('merges default/love lists with dedupe (bottom: source first)', () => {
    const result = mergeList(
      socketFor('u'),
      listData(['A', 'B'], ['L1']),
      listData(['B', 'C'], ['L2']),
    )
    expect(ids(result.defaultList)).toEqual(['A', 'B', 'C'])
    expect(ids(result.loveList)).toEqual(['L1', 'L2'])
  })

  it('merges default lists with "top" placing target-only items first', () => {
    configureUser('top')
    const result = mergeList(
      socketFor('u'),
      listData(['A', 'B'], []),
      listData(['B', 'C'], []),
    )
    expect(ids(result.defaultList)).toEqual(['C', 'A', 'B'])
  })

  it('appends target-only user lists when their update time is falsy', () => {
    const result = mergeList(
      socketFor('u'),
      listData([], [], [userListInfo('1', ['m1'], 0)]),
      listData([], [], [userListInfo('2', ['m2'], 0)]),
    )
    expect(result.userList.map((l) => l.id)).toEqual(['1', '2'])
  })

  it('inserts target-only user lists by index when they have an update time', () => {
    const result = mergeList(
      socketFor('u'),
      listData([], [], [userListInfo('1', ['m1'], 0)]),
      listData(
        [],
        [],
        [userListInfo('2', ['m2'], 100), userListInfo('3', ['m3'], 0)],
      ),
    )
    expect(result.userList.map((l) => l.id)).toEqual(['2', '1', '3'])
  })

  it('merges the song list of a user list present on both sides', () => {
    const result = mergeList(
      socketFor('u'),
      listData([], [], [userListInfo('1', ['m1'], 0)]),
      listData([], [], [userListInfo('1', ['m2'], 0)]),
    )
    expect(result.userList.map((l) => l.id)).toEqual(['1'])
    expect(ids(result.userList[0].list)).toEqual(['m1', 'm2'])
  })

  it('returns the target when source is empty', () => {
    const target = listData(['A'], ['L'], [userListInfo('1', ['m1'], 0)])
    const result = mergeList(socketFor('u'), listData([], [], []), target)
    expect(ids(result.defaultList)).toEqual(['A'])
    expect(result.userList.map((l) => l.id)).toEqual(['1'])
  })
})
