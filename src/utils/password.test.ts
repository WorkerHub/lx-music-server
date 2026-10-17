import { describe, expect, it } from 'vitest'
import { constantTimeEqual, getKeySeed, resolveMD5 } from './password'

describe('resolveMD5', () => {
  it('hashes a plaintext password', () => {
    expect(resolveMD5({ name: 'a', password: 'password' })).toBe(
      '5f4dcc3b5aa765d61d8327deb882cf99',
    )
  })

  it('uses a precomputed passwordHash verbatim (case-insensitive)', () => {
    expect(
      resolveMD5({
        name: 'a',
        passwordHash: '5F4DCC3B5AA765D61D8327DEB882CF99',
      }),
    ).toBe('5f4dcc3b5aa765d61d8327deb882cf99')
  })

  it('prefers passwordHash over plaintext password', () => {
    expect(
      resolveMD5({
        name: 'a',
        password: 'other',
        passwordHash: '5f4dcc3b5aa765d61d8327deb882cf99',
      }),
    ).toBe('5f4dcc3b5aa765d61d8327deb882cf99')
  })

  it('returns null when neither field is present', () => {
    expect(resolveMD5({ name: 'a' })).toBeNull()
  })

  it('rejects a malformed passwordHash and falls back to nothing', () => {
    expect(resolveMD5({ name: 'a', passwordHash: 'not-a-md5' })).toBeNull()
  })
})

describe('getKeySeed', () => {
  it('returns the first 16 hex chars of the MD5', () => {
    expect(getKeySeed({ name: 'a', password: 'password' })).toBe(
      '5f4dcc3b5aa765d6',
    )
  })

  it('returns null for a user with no credential', () => {
    expect(getKeySeed({ name: 'a' })).toBeNull()
  })
})

describe('constantTimeEqual', () => {
  it('matches equal strings', () => {
    expect(constantTimeEqual('abc', 'abc')).toBe(true)
  })

  it('rejects different strings of equal length', () => {
    expect(constantTimeEqual('abc', 'abd')).toBe(false)
  })

  it('rejects different lengths in both orders', () => {
    expect(constantTimeEqual('abc', 'ab')).toBe(false)
    expect(constantTimeEqual('ab', 'abc')).toBe(false)
  })

  it('compares full MD5 hex digests', () => {
    const a = '5f4dcc3b5aa765d61d8327deb882cf99'
    const b = '5f4dcc3b5aa765d61d8327deb882cf98'
    expect(constantTimeEqual(a, a)).toBe(true)
    expect(constantTimeEqual(a, b)).toBe(false)
  })
})
