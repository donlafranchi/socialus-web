// T159 (#64) — tag normalization.
//
// The whole reason a tag has a `normalized` column: creators type freely, so
// "Sour Dough", "sour dough" and " SOUR  DOUGH " must be one tag rather than
// three. Getting this wrong fragments the vocabulary silently — search still
// works, it just finds a third of what it should.

import { describe, it, expect } from 'vitest'
import { normalizeTag, isValidTagLabel, TAG_MAX_LENGTH } from './tags'

describe('T159 — normalizeTag', () => {
  it('lowercases', () => {
    expect(normalizeTag('Sourdough')).toBe('sourdough')
  })

  it('trims', () => {
    expect(normalizeTag('  sourdough  ')).toBe('sourdough')
  })

  it('collapses internal whitespace, so spacing cannot fork a tag', () => {
    expect(normalizeTag('sour   dough')).toBe('sour dough')
    expect(normalizeTag('sour\tdough')).toBe('sour dough')
  })

  it('collapses casing, spacing and padding together', () => {
    expect(normalizeTag('  Sour   DOUGH ')).toBe('sour dough')
  })

  it('leaves an already-normal tag alone', () => {
    expect(normalizeTag('sourdough')).toBe('sourdough')
  })

  it('keeps characters people actually use in a trade name', () => {
    // Stripping these would merge distinct things and mangle real words.
    expect(normalizeTag("Farmer's Market")).toBe("farmer's market")
    expect(normalizeTag('Wood-fired')).toBe('wood-fired')
    expect(normalizeTag('Bread & Pastry')).toBe('bread & pastry')
  })
})

describe('T159 — isValidTagLabel', () => {
  it('accepts an ordinary tag', () => {
    expect(isValidTagLabel('sourdough')).toBe(true)
  })

  it('rejects empty and whitespace-only', () => {
    expect(isValidTagLabel('')).toBe(false)
    expect(isValidTagLabel('   ')).toBe(false)
  })

  it(`rejects longer than ${TAG_MAX_LENGTH} characters`, () => {
    expect(isValidTagLabel('a'.repeat(TAG_MAX_LENGTH))).toBe(true)
    expect(isValidTagLabel('a'.repeat(TAG_MAX_LENGTH + 1))).toBe(false)
  })

  it('measures length after trimming, not before', () => {
    expect(isValidTagLabel(`  ${'a'.repeat(TAG_MAX_LENGTH)}  `)).toBe(true)
  })

  it('rejects a label that normalizes to nothing', () => {
    expect(isValidTagLabel('\t\n ')).toBe(false)
  })
})
