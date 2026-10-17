import { afterEach, describe, expect, it, vi } from 'vitest'
import { sync } from './sync'

describe('list sync lock wait timeout (M7)', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('times out instead of polling forever when the lock is held', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const socket = {
      syncRefs: {
        list: { current: 'other-client' },
        dislike: { current: null },
      },
      keyInfo: { clientId: 'me' },
      onClose: () => () => {},
    } as unknown as LX.Socket

    const promise = sync(socket)
    const assertion = expect(promise).rejects.toThrow('sync lock wait timeout')
    await vi.advanceTimersByTimeAsync(151 * 1000)
    await assertion
  })
})
