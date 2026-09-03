// T114 — Explore URL state (F045 § "Filter state persists in URL").

import { describe, it, expect } from 'vitest'
import { exploreQueryString } from './query'

describe('exploreQueryString', () => {
  it('is empty for the default view', () => {
    expect(exploreQueryString({})).toBe('')
  })

  it('serializes the kind selection so the filter is shareable', () => {
    expect(exploreQueryString({ kind: 'gathering' })).toBe('kind=gathering')
  })

  it('omits kind when All is selected', () => {
    expect(exploreQueryString({ kind: null })).toBe('')
  })

  it('composes kind with the secondary filters', () => {
    expect(exploreQueryString({ q: 'honey', kind: 'product', category: 'food', view: 'map' })).toBe(
      'q=honey&kind=product&category=food&view=map',
    )
  })

  it('leaves the list view implicit', () => {
    expect(exploreQueryString({ view: 'list' })).toBe('')
  })
})
