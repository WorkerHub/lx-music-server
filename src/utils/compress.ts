// Decompressed-size cap to stop gzip-bomb DoS (see REVIEW H1). 16 MiB of JSON
// is far beyond any legitimate sync payload while small enough to bound memory.
export const MAX_DECOMPRESSED_SIZE = 16 * 1024 * 1024

// Raw cap applied at the WebSocket message entry, before any base64/gzip work.
export const MAX_RAW_MESSAGE_SIZE = 16 * 1024 * 1024

export class PayloadTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadTooLargeError'
  }
}

const streamToBytes = async (
  readable: ReadableStream<Uint8Array>,
  maxBytes?: number,
): Promise<Uint8Array> => {
  const reader = readable.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.length
    if (maxBytes !== undefined && total > maxBytes) {
      throw new PayloadTooLargeError(
        `decompressed size exceeds limit of ${maxBytes} bytes`,
      )
    }
    chunks.push(value)
  }
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

const gzip = async (data: string): Promise<string> => {
  const bytes = new TextEncoder().encode(data)
  const stream = new CompressionStream('gzip')
  const writer = stream.writable.getWriter()
  await writer.write(bytes)
  await writer.close()
  const result = await streamToBytes(stream.readable)
  return bytesToBase64(result)
}

export const unGzip = async (
  data: string,
  maxBytes: number = MAX_DECOMPRESSED_SIZE,
): Promise<string> => {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const stream = new DecompressionStream('gzip')
  const writer = stream.writable.getWriter()

  // Pump input concurrently with reading output. DecompressionStream applies
  // backpressure, so awaiting writer.close() before reading would deadlock on
  // any output larger than the stream's internal buffer. Reading as we write
  // also lets us count decompressed bytes as they stream through (the limit).
  const writeDone = (async () => {
    await writer.write(bytes)
    await writer.close()
  })()

  try {
    const result = await streamToBytes(stream.readable, maxBytes)
    await writeDone
    return new TextDecoder().decode(result)
  } catch (err) {
    // The writer may still be blocked on backpressure; aborting it can itself
    // block, so just swallow any eventual rejection and let the stream be
    // garbage-collected (the reader already stopped consuming).
    writeDone.catch(() => {})
    throw err
  }
}

// Note: messages are gzip-compressed only; per-device AES encryption is not yet implemented
// (_keyInfo is reserved for future use)
export const encryptMsg = async (
  _keyInfo: LX.Sync.KeyInfo | null,
  msg: string,
): Promise<string> => {
  return msg.length > 1024 ? `cg_${await gzip(msg)}` : msg
}

export const decryptMsg = async (
  _keyInfo: LX.Sync.KeyInfo | null,
  enMsg: string,
): Promise<string> => {
  return enMsg.substring(0, 3) === 'cg_'
    ? await unGzip(enMsg.replace('cg_', ''))
    : enMsg
}
