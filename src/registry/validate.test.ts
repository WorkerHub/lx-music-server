import { describe, expect, it } from 'vitest'
import {
  isAddMusicLocationType,
  isRegistrationMode,
  isReservedName,
  isValidMaxSnapshotNum,
  validatePassword,
  validateUsername,
} from './validate'

describe('validateUsername', () => {
  it('accepts 3-32 characters of letters, digits, underscore and hyphen', () => {
    expect(validateUsername('abc')).toBeNull()
    expect(validateUsername('user_name-1')).toBeNull()
    expect(validateUsername('a'.repeat(32))).toBeNull()
  })

  it('rejects too short, too long and disallowed characters', () => {
    expect(validateUsername('ab')).not.toBeNull()
    expect(validateUsername('a'.repeat(33))).not.toBeNull()
    expect(validateUsername('bad name')).not.toBeNull()
    expect(validateUsername('中文名')).not.toBeNull()
    expect(validateUsername('')).not.toBeNull()
  })
})

describe('isReservedName', () => {
  it('reserves every double-underscore name', () => {
    expect(isReservedName('__server__')).toBe(true)
    expect(isReservedName('__registry__')).toBe(true)
    expect(isReservedName('_user')).toBe(false)
    expect(isReservedName('user')).toBe(false)
  })
})

describe('validatePassword', () => {
  it('enforces the 8-128 length window', () => {
    expect(validatePassword('1234567')).not.toBeNull()
    expect(validatePassword('12345678')).toBeNull()
    expect(validatePassword('123456789012345')).toBeNull()
    expect(validatePassword('a'.repeat(128))).toBeNull()
    expect(validatePassword('a'.repeat(129))).not.toBeNull()
  })
})

describe('other guards', () => {
  it('validates registration modes and snapshot limits', () => {
    expect(isRegistrationMode('closed')).toBe(true)
    expect(isRegistrationMode('approval')).toBe(true)
    expect(isRegistrationMode('open')).toBe(true)
    expect(isRegistrationMode('sometimes')).toBe(false)

    expect(isValidMaxSnapshotNum(1)).toBe(true)
    expect(isValidMaxSnapshotNum(100)).toBe(true)
    expect(isValidMaxSnapshotNum(0)).toBe(false)
    expect(isValidMaxSnapshotNum(101)).toBe(false)
    expect(isValidMaxSnapshotNum(1.5)).toBe(false)
    expect(isValidMaxSnapshotNum('20')).toBe(false)
  })

  it('validates addMusicLocationType', () => {
    expect(isAddMusicLocationType('top')).toBe(true)
    expect(isAddMusicLocationType('bottom')).toBe(true)
    expect(isAddMusicLocationType('middle')).toBe(false)
  })
})
