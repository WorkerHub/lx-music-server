import { describe, expect, it } from 'vitest'
import { filterRules } from '../utils'
import { mergeDataFromSnapshot, mergeList } from './sync'

const socket = {} as LX.Socket

describe('filterRules (dislike)', () => {
  it('normalizes case and trims, dropping segments after the first "@"', () => {
    expect(Array.from(filterRules('  Foo@Bar  '))).toEqual(['foo@bar'])
    expect(Array.from(filterRules('Foo@Bar@Baz'))).toEqual(['foo@bar'])
  })

  it('keeps name-only and singer-only rules', () => {
    expect(Array.from(filterRules('Name\n@Singer'))).toEqual([
      'name',
      '@singer',
    ])
  })

  it('skips empty lines and deduplicates identical rules', () => {
    expect(Array.from(filterRules('A@B\n\nA@B\n A@B '))).toEqual(['a@b'])
  })

  it('returns an empty set for empty input', () => {
    expect(Array.from(filterRules(''))).toEqual([])
  })
})

describe('mergeList (dislike)', () => {
  it('concatenates and deduplicates source then target', () => {
    expect(mergeList(socket, 'A@B\nC@D', 'C@D\nE@F')).toBe('a@b\nc@d\ne@f')
  })

  it('handles an empty source', () => {
    expect(mergeList(socket, '', 'A@B')).toBe('a@b')
  })

  it('handles an empty target', () => {
    expect(mergeList(socket, 'A@B', '')).toBe('a@b')
  })
})

describe('mergeDataFromSnapshot (dislike)', () => {
  it('keeps rules added on both sides, deduplicated', () => {
    const result = mergeDataFromSnapshot('A@B\nC@D', 'C@D\nE@F', 'C@D')
    expect(result).toBe('a@b\nc@d\ne@f')
  })

  it('propagates a deletion on one side even when the other still has it', () => {
    // B@C was in the snapshot; source deleted it, target kept it.
    const result = mergeDataFromSnapshot('A@B', 'A@B\nB@C', 'A@B\nB@C')
    expect(result).toBe('a@b')
  })

  it('returns an empty string when both sides and snapshot are empty', () => {
    expect(mergeDataFromSnapshot('', '', '')).toBe('')
  })

  it('treats a rule present only in the snapshot as deleted', () => {
    expect(mergeDataFromSnapshot('', 'A@B', 'A@B')).toBe('')
  })
})
