import { describe, expect, it } from 'vitest'
import { SnapshotDataManage, type SnapshotInfo } from '../snapshotDataManage'

const parseListData = (data: string): LX.Sync.List.ListData =>
  JSON.parse(data) as LX.Sync.List.ListData

const createStorage = () => {
  const data = new Map<string, unknown>()
  return {
    data,
    get: async <T>(key: string) => data.get(key) as T | undefined,
    put: async <T>(key: string, value: T) => {
      data.set(key, value)
    },
    delete: async (key: string) => {
      data.delete(key)
      return true
    },
  } as DurableObjectStorage & { data: Map<string, unknown> }
}

const emptyInfo = (): SnapshotInfo => ({
  latest: null,
  time: 0,
  list: [],
  clients: {},
})

describe('saveSnapshotInfo durability (M2)', () => {
  it('persists the snapshot index synchronously, not via the throttle timer', async () => {
    const storage = createStorage()
    const manage = new SnapshotDataManage(
      storage,
      'list',
      emptyInfo(),
      3,
      parseListData,
    )

    const info: SnapshotInfo = {
      latest: 'md5-1',
      time: 123,
      list: [],
      clients: {},
    }
    await manage.saveSnapshotInfo(info)

    // Without awaiting the write, the throttle would defer this 100ms and the
    // index would still be missing right here.
    expect(storage.data.get('list:snapshotInfo')).toEqual(info)
  })
})

describe('clearOldSnapshot (M8)', () => {
  const info = (list: string[], clients = {}): SnapshotInfo => ({
    latest: 'L',
    time: 0,
    list,
    clients,
  })

  it('prunes the oldest snapshots beyond maxSnapshotNum', async () => {
    const storage = createStorage()
    for (const key of ['k1', 'k2', 'k3', 'k4']) {
      storage.data.set(`list:snap:${key}`, `${key}-data`)
    }
    const manage = new SnapshotDataManage(
      storage,
      'list',
      info(['k1', 'k2', 'k3', 'k4']),
      2,
      parseListData,
    )

    await manage.clearOldSnapshot()

    // Newest two (k1, k2) survive; oldest (k3, k4) are removed.
    expect(storage.data.has('list:snap:k1')).toBe(true)
    expect(storage.data.has('list:snap:k2')).toBe(true)
    expect(storage.data.has('list:snap:k3')).toBe(false)
    expect(storage.data.has('list:snap:k4')).toBe(false)
    expect(
      (storage.data.get('list:snapshotInfo') as SnapshotInfo).list,
    ).toEqual(['k1', 'k2'])
  })

  it('keeps device-referenced snapshots even when they are old', async () => {
    const storage = createStorage()
    for (const key of ['k1', 'k2', 'k3']) {
      storage.data.set(`list:snap:${key}`, `${key}-data`)
    }
    const manage = new SnapshotDataManage(
      storage,
      'list',
      info(['k1', 'k2', 'k3'], {
        dev: { snapshotKey: 'k3', lastSyncDate: 0 },
      }),
      1,
      parseListData,
    )

    await manage.clearOldSnapshot()

    // Only k2 (the oldest non-referenced key) is removed; k3 stays alive.
    expect(storage.data.has('list:snap:k1')).toBe(true)
    expect(storage.data.has('list:snap:k2')).toBe(false)
    expect(storage.data.has('list:snap:k3')).toBe(true)
  })

  it('does nothing when the snapshot count is within the limit', async () => {
    const storage = createStorage()
    for (const key of ['k1', 'k2']) {
      storage.data.set(`list:snap:${key}`, `${key}-data`)
    }
    const manage = new SnapshotDataManage(
      storage,
      'list',
      info(['k1', 'k2']),
      3,
      parseListData,
    )

    await manage.clearOldSnapshot()

    expect(storage.data.has('list:snap:k1')).toBe(true)
    expect(storage.data.has('list:snap:k2')).toBe(true)
  })
})

describe('shared snapshot key reference counting (L3)', () => {
  it('keeps a snapshot alive while another device still references it', async () => {
    const storage = createStorage()
    storage.data.set('list:snap:K', 'k-data')
    storage.data.set('list:snap:X', 'x-data')
    const manage = new SnapshotDataManage(
      storage,
      'list',
      {
        latest: 'L',
        time: 0,
        list: ['K', 'X'],
        clients: {
          devA: { snapshotKey: 'K', lastSyncDate: 0 },
          devB: { snapshotKey: 'K', lastSyncDate: 0 },
        },
      },
      1,
      parseListData,
    )

    // devA moves off the shared key K; devB still references it.
    await manage.updateDeviceSnapshotKey('devA', 'K2')
    expect(manage.isIncludesDevice('K')).toBe(true)

    await manage.clearOldSnapshot()

    // K must survive because devB still points at it; a Set-based refcount
    // would have dropped K the moment devA moved away.
    expect(storage.data.has('list:snap:K')).toBe(true)
  })

  it('releases a key only once every referencing device moves away', async () => {
    const storage = createStorage()
    const manage = new SnapshotDataManage(
      storage,
      'list',
      {
        latest: 'L',
        time: 0,
        list: ['K'],
        clients: {
          devA: { snapshotKey: 'K', lastSyncDate: 0 },
          devB: { snapshotKey: 'K', lastSyncDate: 0 },
        },
      },
      2,
      parseListData,
    )

    await manage.updateDeviceSnapshotKey('devA', 'K2')
    expect(manage.isIncludesDevice('K')).toBe(true)

    await manage.removeSnapshotInfo('devB')
    expect(manage.isIncludesDevice('K')).toBe(false)
  })

  it('stays balanced when the same device re-syncs to the same key', async () => {
    const storage = createStorage()
    const manage = new SnapshotDataManage(
      storage,
      'list',
      {
        latest: 'L',
        time: 0,
        list: ['K'],
        clients: { devA: { snapshotKey: 'K', lastSyncDate: 0 } },
      },
      2,
      parseListData,
    )

    // Same-key update is decrement(K) then increment(K): net zero.
    await manage.updateDeviceSnapshotKey('devA', 'K')
    expect(manage.isIncludesDevice('K')).toBe(true)
    await manage.updateDeviceSnapshotKey('devA', 'K')
    expect(manage.isIncludesDevice('K')).toBe(true)
  })

  it('stays balanced across remove then re-add of the same key', async () => {
    const storage = createStorage()
    const manage = new SnapshotDataManage(
      storage,
      'list',
      { latest: 'L', time: 0, list: ['K'], clients: {} },
      2,
      parseListData,
    )

    await manage.updateDeviceSnapshotKey('devA', 'K')
    expect(manage.isIncludesDevice('K')).toBe(true)

    manage.removeSnapshotInfo('devA')
    expect(manage.isIncludesDevice('K')).toBe(false)

    await manage.updateDeviceSnapshotKey('devA', 'K')
    expect(manage.isIncludesDevice('K')).toBe(true)
  })
})
