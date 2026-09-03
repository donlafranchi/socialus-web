// T114/T115 — Explore URL state (F045 § "Filter state persists in URL").

import { describe, it, expect } from 'vitest'
import { exploreQueryString } from './query'
import { DEFAULT_SECONDARY } from './filters'

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
    expect(exploreQueryString({ q: 'honey', kind: 'product', categories: ['food'] })).toBe(
      'q=honey&kind=product&category=food',
    )
  })

  it('never carries the list/map view — F044 makes it ephemeral session state', () => {
    expect(exploreQueryString({ kind: 'product' })).not.toContain('view')
  })

  it('writes every secondary filter the bottom sheet can set', () => {
    expect(
      exploreQueryString({
        kind: 'gathering',
        distance: 5,
        schedule: 'weekend',
        categories: ['food', 'repair'],
        sort: 'nearest',
      }),
    ).toBe('kind=gathering&category=food%2Crepair&distance=5&schedule=weekend&sort=nearest')
  })

  it('keeps the secondary defaults out of the URL', () => {
    expect(exploreQueryString({ ...DEFAULT_SECONDARY })).toBe('')
  })
})
