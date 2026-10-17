import { describe, expect, it } from 'vitest'
import {
  decryptMsg,
  isRawMessageTooLarge,
  MAX_RAW_MESSAGE_SIZE,
  PayloadTooLargeError,
  unGzip,
} from './compress'

const gzipBase64 = async (data: string): Promise<string> => {
  const bytes = new TextEncoder().encode(data)
  const stream = new CompressionStream('gzip')
  const writer = stream.writable.getWriter()
  await writer.write(bytes)
  await writer.close()
  const reader = stream.readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    total += value.length
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < result.length; i += step) {
    binary += String.fromCharCode(...result.subarray(i, i + step))
  }
  return btoa(binary)
}

describe('unGzip', () => {
  it('round-trips gzip data under the limit', async () => {
    const payload = 'hello world'
    expect(await unGzip(await gzipBase64(payload))).toBe(payload)
  })

  it('throws PayloadTooLargeError when output exceeds the limit', async () => {
    const big = 'a'.repeat(100 * 1024)
    await expect(unGzip(await gzipBase64(big), 1024)).rejects.toThrow(
      PayloadTooLargeError,
    )
  })
})

describe('decryptMsg', () => {
  it('decompresses cg_-prefixed messages', async () => {
    const payload = 'hello world'
    expect(await decryptMsg(null, `cg_${await gzipBase64(payload)}`)).toBe(
      payload,
    )
  })

  it('passes through uncompressed messages', async () => {
    expect(await decryptMsg(null, 'plain')).toBe('plain')
  })

  it('decompresses a large playlist-sized payload without false rejection', async () => {
    const payload = JSON.stringify({ songs: 'a'.repeat(1024 * 1024) })
    expect(await decryptMsg(null, `cg_${await gzipBase64(payload)}`)).toBe(
      payload,
    )
  })
})

describe('isRawMessageTooLarge', () => {
  it('allows a raw message at the cap and rejects one just over it', () => {
    expect(isRawMessageTooLarge('a'.repeat(MAX_RAW_MESSAGE_SIZE))).toBe(false)
    expect(isRawMessageTooLarge('a'.repeat(MAX_RAW_MESSAGE_SIZE + 1))).toBe(
      true,
    )
  })
})

describe('MAX_RAW_MESSAGE_SIZE', () => {
  it('is a positive cap used at the WebSocket entry', () => {
    expect(MAX_RAW_MESSAGE_SIZE).toBeGreaterThan(0)
  })
})
