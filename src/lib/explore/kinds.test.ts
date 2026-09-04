// T114 — kind vocabulary (F045 § "Kind pill selection filters results instantly").

import { describe, it, expect } from 'vitest'
import { KIND_FILTERS, parseKindParam, kindTabId } from './kinds'

describe('KIND_FILTERS', () => {
  it('lists All first, then only the kinds that have a detail page (T119)', () => {
    expect(KIND_FILTERS.map((k) => k.label)).toEqual([
      'All',
      'Events',
      'Products',
      'Services',
    ])
  })

  it('offers no pill for a withheld kind — a pill that can never return a result', () => {
    expect(KIND_FILTERS.map((k) => k.value)).not.toContain('wonder')
    expect(KIND_FILTERS.map((k) => k.value)).not.toContain('offer')
    expect(KIND_FILTERS.map((k) => k.value)).not.toContain('ask')
    expect(KIND_FILTERS.map((k) => k.value)).not.toContain('initiative')
  })

  it('maps UI labels to schema kinds', () => {
    expect(KIND_FILTERS.map((k) => k.value)).toEqual([
      null,
      'gathering',
      'product',
      'service',
    ])
  })
})

describe('parseKindParam', () => {
  it('accepts a known schema kind', () => {
    expect(parseKindParam('gathering')).toBe('gathering')
    expect(parseKindParam('product')).toBe('product')
  })

  it('falls back to All for missing, empty, or unknown values', () => {
    expect(parseKindParam(null)).toBeNull()
    expect(parseKindParam(undefined)).toBeNull()
    expect(parseKindParam('')).toBeNull()
    expect(parseKindParam('all')).toBeNull()
    expect(parseKindParam('Events')).toBeNull()
    expect(parseKindParam('initiative')).toBeNull()
  })
})

describe('kindTabId', () => {
  it('gives All a stable id', () => {
    expect(kindTabId(null)).toBe('kind-tab-all')
    expect(kindTabId('product')).toBe('kind-tab-product')
  })
})
