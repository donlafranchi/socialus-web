import { describe, it, expect } from 'vitest'
import { PAGE_CATEGORIES, isPageCategory } from './page-categories'

describe('PAGE_CATEGORIES', () => {
  it('has exactly twelve terms', () => {
    expect(PAGE_CATEGORIES).toHaveLength(12)
  })

  it('matches the spec list exactly, in order', () => {
    expect(PAGE_CATEGORIES).toEqual([
      'Food & Drink',
      'Growing',
      'Home & Body',
      'Textiles & Craft',
      'Wood, Metal & Repair',
      'Art & Music',
      'Classes & Workshops',
      'Sport & Outdoors',
      'Community & Mutual Aid',
      'Music & Nightlife',
      'Family & Kids',
      'Faith & Culture',
    ])
  })
})

describe('isPageCategory', () => {
  it('accepts every term in the vocabulary', () => {
    for (const term of PAGE_CATEGORIES) {
      expect(isPageCategory(term)).toBe(true)
    }
  })

  it('rejects anything outside the vocabulary, including near-misses', () => {
    expect(isPageCategory('Food and Drink')).toBe(false)
    expect(isPageCategory('')).toBe(false)
    expect(isPageCategory('food & drink')).toBe(false)
  })
})
