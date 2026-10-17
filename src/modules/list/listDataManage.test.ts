import { describe, expect, it } from 'vitest'
import { ListDataManage } from './listDataManage'

const music = (id: string): LX.Music.MusicInfo =>
  ({
    id,
    name: id,
    singer: 's',
    source: 'kw',
    interval: null,
    meta: {},
  }) as LX.Music.MusicInfo

const listData = (): LX.Sync.List.ListData => ({
  defaultList: [],
  loveList: [],
  userList: [
    {
      id: 'a',
      name: 'A',
      locationUpdateTime: 0,
      list: [music('a1'), music('a2'), music('a3')],
    },
    { id: 'b', name: 'B', locationUpdateTime: 0, list: [music('b1')] },
    { id: 'c', name: 'C', locationUpdateTime: 0, list: [music('c1')] },
  ],
})

describe('userListsUpdatePosition (unknown list id)', () => {
  it('skips unknown ids instead of throwing', async () => {
    const manage = new ListDataManage(listData())
    await expect(
      manage.userListsUpdatePosition(1, ['unknown', 'b']),
    ).resolves.toBeUndefined()
    const result = await manage.getListData()
    expect(result.userList.map((l) => l.id)).toEqual(['a', 'b', 'c'])
  })

  it('still moves known ids to the requested position', async () => {
    const manage = new ListDataManage(listData())
    await manage.userListsUpdatePosition(0, ['c'])
    const result = await manage.getListData()
    expect(result.userList.map((l) => l.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('listMusicUpdatePosition (unknown music id)', () => {
  it('skips unknown ids and does not push undefined entries', async () => {
    const manage = new ListDataManage(listData())
    await expect(
      manage.listMusicUpdatePosition('a', 1, ['unknown', 'a3']),
    ).resolves.toEqual(['a'])
    const musics = await manage.getListMusics('a')
    expect(musics.map((m) => m.id)).toEqual(['a1', 'a3', 'a2'])
  })

  it('returns the list id even when every requested id is unknown', async () => {
    const manage = new ListDataManage(listData())
    await manage.listMusicUpdatePosition('a', 0, ['nope1', 'nope2'])
    const musics = await manage.getListMusics('a')
    expect(musics.map((m) => m.id)).toEqual(['a1', 'a2', 'a3'])
  })
})
