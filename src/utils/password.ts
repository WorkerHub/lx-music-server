import { toMD5 } from './crypto'

const MD5_HEX_RE = /^[0-9a-f]{32}$/i

/**
 * Normalize a user's stored credential to the 32-char lowercase hex MD5 digest
 * that the LX Music sync protocol derives its AES key from.
 *
 * Supported storage forms (see README):
 * - `passwordHash`: precomputed 32-char hex MD5 of the plaintext password.
 * - `password`:     plaintext password (legacy); hashed to MD5 on the fly.
 *
 * This MUST remain an *unsalted* MD5: the client derives its AES key from
 * `MD5(password)`, so the server has to hold that exact value to authenticate.
 * `passwordHash` therefore removes the plaintext password from config while
 * remaining password-equivalent for this service (see the security notes in
 * README for the tradeoff).
 */
export const resolveMD5 = (user: LX.User): string | null => {
  const hash = (user as { passwordHash?: string }).passwordHash
  if (typeof hash === 'string' && MD5_HEX_RE.test(hash.trim())) {
    return hash.trim().toLowerCase()
  }
  if (typeof user.password === 'string') {
    return toMD5(user.password)
  }
  return null
}

/**
 * AES key seed used by the LX Music auth protocol: the first 16 hex chars of
 * `MD5(password)`. Must stay byte-for-byte identical to the client's key
 * derivation, or existing clients can no longer authenticate.
 */
export const getKeySeed = (user: LX.User): string | null => {
  const md5Hex = resolveMD5(user)
  return md5Hex ? md5Hex.substring(0, 16) : null
}

/**
 * Constant-time string equality. The loop always runs max(a.length, b.length)
 * iterations, so content cannot leak through early exit. Intended for
 * fixed-length MD5 hex digests (both sides are always 32 chars), where any
 * length difference is a protocol invariant rather than a timing signal.
 */
export const constantTimeEqual = (a: string, b: string): boolean => {
  const maxLen = Math.max(a.length, b.length)
  let diff = a.length ^ b.length
  for (let i = 0; i < maxLen; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  }
  return diff === 0
}
