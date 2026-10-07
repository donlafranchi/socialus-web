import { describe, it, expect } from 'vitest'
import { browseQueryString } from './query'
import { parseBrowseFilters } from './filters'

describe('T156 — browseQueryString', () => {
  it('is empty for the bare surface', () => {
    expect(browseQueryString({})).toBe('')
  })

  it('carries metro, search and tags', () => {
    expect(browseQueryString({ metro: 'sacramento-roseville-ca', q: 'sourdough', tags: ['local food'] })).toBe(
      'metro=sacramento-roseville-ca&q=sourdough&category=local+food',
    )
  })

  it('leaves the default schedule out', () => {
    expect(browseQueryString({ schedule: 'any' })).toBe('')
    expect(browseQueryString({ schedule: 'weekend' })).toBe('schedule=weekend')
  })

  it('round-trips through parseBrowseFilters', () => {
    const qs = browseQueryString({ q: 'x', tags: ['art', 'local food'], schedule: 'week' })
    expect(parseBrowseFilters(new URLSearchParams(qs))).toEqual({
      schedule: 'week',
      tags: ['art', 'local food'],
    })
  })
})

describe('#476 — the neighbourhood is in the link', () => {
  it('carries ?area= when one is picked, and nothing when not', () => {
    expect(browseQueryString({ metro: 'sac', area: 'place-1' })).toBe('metro=sac&area=place-1')
    expect(browseQueryString({ metro: 'sac', area: null })).toBe('metro=sac')
  })
})
