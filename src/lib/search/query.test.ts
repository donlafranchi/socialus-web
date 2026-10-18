import { describe, it, expect } from 'vitest'
import { searchTsQuery, searchRaw } from './query'

// #916 — the box's words become one tsquery: each word OR its synonyms, all words required.
describe('searchTsQuery', () => {
  it('a single word stays itself', () => {
    expect(searchTsQuery('honey')).toBe('honey')
  })

  it('every word is required', () => {
    expect(searchTsQuery('sourdough  loaf')).toBe('sourdough & loaf')
  })

  it('a word with synonyms widens to an OR', () => {
    expect(searchTsQuery('flowers')).toBe('(flowers | florist | flower)')
  })

  it('a two-word synonym is a phrase', () => {
    expect(searchTsQuery('produce')).toContain('(farm <-> stand)')
  })

  it('matches synonyms whatever the case', () => {
    expect(searchTsQuery('Cafe')).toBe('(cafe | coffee)')
  })

  it('drops anything that is not a letter or digit, so nothing reaches to_tsquery as an operator', () => {
    expect(searchTsQuery("loaf!) | !:* & 'x")).toBe('loaf & x')
    expect(searchTsQuery('&|!()<->')).toBeNull()
  })

  it('is null for an empty box', () => {
    expect(searchTsQuery('   ')).toBeNull()
  })
})

describe('searchRaw', () => {
  it('is the words, lowercased and trimmed, for the typo fallback', () => {
    expect(searchRaw('  Flwers ')).toBe('flwers')
    expect(searchRaw('')).toBeNull()
  })
})
