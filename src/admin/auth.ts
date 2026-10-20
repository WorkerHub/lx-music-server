import { constantTimeEqual } from '@/utils/password'

export const ADMIN_COOKIE_NAME = 'lx_admin'
export const ADMIN_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60

const ADMIN_HASH_RE = /^[0-9a-f]{64}$/

/**
 * Admin credentials are completely separate from sync users: the admin never
 * speaks the LX Music protocol, so a plain SHA-256 of the password (delivered
 * as `LX_ADMIN_PASSWORD_HASH`) is enough. Returns null when the secret is
 * missing or malformed — the panel and every `/api/admin/*` route then 404.
 */
export const getAdminPasswordHash = (env: LX.Env): string | null => {
  const raw = env.LX_ADMIN_PASSWORD_HASH?.trim().toLowerCase()
  if (!raw || !ADMIN_HASH_RE.test(raw)) return null
  return raw
}

export const sha256Hex = async (text: string): Promise<string> => {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export const verifyAdminPassword = async (
  env: LX.Env,
  password: string,
): Promise<boolean> => {
  const hash = getAdminPasswordHash(env)
  if (!hash) return false
  return constantTimeEqual(await sha256Hex(password), hash)
}

const hexToBytes = (hex: string): Uint8Array =>
  Uint8Array.from(hex.match(/.{2}/g) ?? [], (byte) => parseInt(byte, 16))

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

const fromBase64Url = (text: string): Uint8Array =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (char) =>
    char.charCodeAt(0),
  )

const importSessionKey = (hash: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    'raw',
    hexToBytes(hash),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )

/**
 * Stateless session cookie: `base64url(expiresAt).base64url(HMAC-SHA256)`.
 * The signing key is derived from the admin password hash, so rotating the
 * secret invalidates every existing session.
 */
export const createAdminSession = async (
  env: LX.Env,
): Promise<{ token: string; maxAge: number } | null> => {
  const hash = getAdminPasswordHash(env)
  if (!hash) return null
  const payload = String(Date.now() + ADMIN_SESSION_TTL_SECONDS * 1000)
  const key = await importSessionKey(hash)
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload),
  )
  return {
    token: `${toBase64Url(new TextEncoder().encode(payload))}.${toBase64Url(new Uint8Array(signature))}`,
    maxAge: ADMIN_SESSION_TTL_SECONDS,
  }
}

export const verifyAdminSession = async (
  env: LX.Env,
  token: string | undefined,
): Promise<boolean> => {
  const hash = getAdminPasswordHash(env)
  if (!hash || !token) return false

  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart) return false

  let payload: string
  try {
    payload = new TextDecoder().decode(fromBase64Url(payloadPart))
  } catch {
    return false
  }
  const expiresAt = Number(payload)
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false

  try {
    const key = await importSessionKey(hash)
    return await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(signaturePart),
      new TextEncoder().encode(payload),
    )
  } catch {
    return false
  }
}
