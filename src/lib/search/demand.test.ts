import { describe, it, expect } from 'vitest'
import { normalizeSearchQuery, demandKey, SEARCH_QUERY_MAX } from './demand'

describe('normalizeSearchQuery (#909)', () => {
  it('lowercases, trims and collapses spaces', () => {
    expect(normalizeSearchQuery('  Sourdough   BREAD ')).toBe('sourdough bread')
  })

  it('ignores anything under 2 characters', () => {
    expect(normalizeSearchQuery('a')).toBeNull()
    expect(normalizeSearchQuery('   ')).toBeNull()
    expect(normalizeSearchQuery('ab')).toBe('ab')
  })

  it('caps the text at 80 characters, on a word where it can', () => {
    const q = normalizeSearchQuery('vintage '.repeat(20))!
    expect(q.length).toBeLessThanOrEqual(SEARCH_QUERY_MAX)
    expect(q.endsWith('vintage')).toBe(true)
    expect(normalizeSearchQuery('x'.repeat(200))!.length).toBe(SEARCH_QUERY_MAX)
  })

  it('strips email addresses and phone numbers, keeping the rest', () => {
    expect(normalizeSearchQuery('plumber jo@example.com')).toBe('plumber')
    expect(normalizeSearchQuery('tacos (916) 555-0123')).toBe('tacos')
    expect(normalizeSearchQuery('tacos 916.555.0123')).toBe('tacos')
    expect(normalizeSearchQuery('call +1 916 555 0123 now')).toBe('call now')
  })

  it('drops the search when nothing meaningful remains', () => {
    expect(normalizeSearchQuery('jo@example.com')).toBeNull()
    expect(normalizeSearchQuery('916-555-0123')).toBeNull()
    expect(normalizeSearchQuery('!!! ???')).toBeNull()
  })

  it('keeps ordinary numbers that are not phone numbers', () => {
    expect(normalizeSearchQuery('95816 coffee')).toBe('95816 coffee')
    expect(normalizeSearchQuery('2 bedroom')).toBe('2 bedroom')
  })
})

describe('demandKey (#909)', () => {
  it('is stable for one searcher and query, differs across either, and carries neither in the clear', () => {
    const k = demandKey('member-1', 'tacos')
    expect(k).toBe(demandKey('member-1', 'tacos'))
    expect(k).not.toBe(demandKey('member-2', 'tacos'))
    expect(k).not.toBe(demandKey('member-1', 'pizza'))
    expect(k).not.toMatch(/member|tacos/)
  })
})
