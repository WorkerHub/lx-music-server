import { afterEach, describe, expect, it, vi } from 'vitest'
import { sync } from './sync'

describe('dislike sync lock wait timeout (M7)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out instead of polling forever when the lock is held', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const syncRef = { current: 'other-client' }
    const socket = {
      syncRefs: { list: { current: null }, dislike: syncRef },
      keyInfo: { clientId: 'me' },
      onClose: () => () => {},
    } as unknown as LX.Socket

    const promise = sync(socket)
    const assertion = expect(promise).rejects.toThrow('sync lock wait timeout')
    await vi.advanceTimersByTimeAsync(151 * 1000)
    await assertion

    // 等待者从未拿到锁，超时后不能清掉持有者的 syncRef。
    expect(syncRef.current).toBe('other-client')
  })

  it('throws disconnected instead of timing out when the socket closes mid-wait', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const syncRef = { current: 'other-client' }
    let closeHandler: (err: Error) => void = () => {}
    const socket = {
      syncRefs: { list: { current: null }, dislike: syncRef },
      keyInfo: { clientId: 'me' },
      onClose: (h: (err: Error) => void) => {
        closeHandler = h
        return () => {}
      },
    } as unknown as LX.Socket

    const promise = sync(socket)
    const assertion = expect(promise).rejects.toThrow('disconnected')
    closeHandler(new Error('closed'))
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })
})
