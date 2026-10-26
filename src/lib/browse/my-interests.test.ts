import { describe, it, expect } from 'vitest'
import { DEFAULT_BROWSE_FILTERS, CATEGORY_TAGS, applyBrowseFilters, feedOptsFor, hasBrowseFilters, serverFilters, type BrowseFilters } from './filters'
import { readBox, writeBox } from './box-text'
import { INTEREST_VOCAB, interestPageTags } from '@/lib/onboarding/interest-vocab'
import type { BrowseResult } from '@/lib/feed/browse-feed'

// #892 — "My interests" in Explore's Category filter: a filter over the member's own tags, never a ranking.

const F = (over: Partial<BrowseFilters> = {}): BrowseFilters => ({ ...DEFAULT_BROWSE_FILTERS, ...over })
const now = new Date('2026-10-18T12:00:00Z')

const row = (id: string, tags: string[]): BrowseResult =>
  ({ resultKind: 'page', resultId: id, groupId: `g-${id}`, name: id, description: null, body: null, tags, startsAt: null, endsAt: null, sortAt: '2026-10-01T00:00:00Z' }) as unknown as BrowseResult

describe('#892 — the member’s tags map to the Page tags', () => {
  it('maps each interest to the Category tag Pages carry, and drops anything outside the 12', () => {
    expect(interestPageTags(['live-music', 'farmers-market', 'running'])).toEqual(['farmers markets', 'live music'])
    expect(interestPageTags(INTEREST_VOCAB.map((t) => t.tag))).toEqual(CATEGORY_TAGS)
  })
})

describe('#892 — My interests filters, it does not rank', () => {
  const rows = [row('a', ['Gardening']), row('b', ['coffee']), row('c', ['live music', 'arts & culture']), row('d', []), row('e', ['Live Music'])]

  // The filter keeps the server order: a filter, never a ranking.
  it('shows only Pages carrying one of the member’s tags, in the order they came', () => {
    const out = applyBrowseFilters(rows, F({ mine: true }), { now, myTags: ['live music', 'gardening'] })
    expect(out.map((r) => r.resultId)).toEqual(['a', 'c', 'e'])
  })

  it('adds to any Category the member also picked', () => {
    const out = applyBrowseFilters(rows, F({ mine: true, tags: ['coffee'] }), { now, myTags: ['gardening'] })
    expect(out.map((r) => r.resultId)).toEqual(['a', 'b'])
  })

  it('with no interests chosen, matches nothing rather than everything', () => {
    expect(applyBrowseFilters(rows, F({ mine: true }), { now, myTags: [] })).toEqual([])
    expect(applyBrowseFilters(rows, F({ mine: true }), { now })).toEqual([])
  })

  it('counts as a filter, but is never sent to the server read: the list keeps its own order', () => {
    expect(hasBrowseFilters(F({ mine: true }))).toBe(true)
    expect(hasBrowseFilters(serverFilters(F({ mine: true, tags: ['coffee'] })))).toBe(false)
    expect(feedOptsFor(serverFilters(F({ mine: true, tags: ['coffee'], date: 'week' })), now)).toEqual(feedOptsFor(F({ date: 'week' }), now))
    expect(serverFilters(F({ tags: ['coffee'] }))).toEqual(F({ tags: ['coffee'] }))
  })
})

describe('#892 — the box carries the words, never the member’s tags', () => {
  it('writes "my interests" and reads it back', () => {
    const text = writeBox(F({ mine: true }), 'bread')
    expect(text).toBe('bread my interests')
    expect(readBox(text, CATEGORY_TAGS)).toEqual({ filters: F({ mine: true }), rest: 'bread' })
  })

  // A shared link must not say what the sender is into: it carries the words, and each reader's own tags apply.
  it('a selection made from My interests puts none of the member’s tags in the link', () => {
    const text = writeBox(F({ mine: true }))
    for (const t of CATEGORY_TAGS) expect(text).not.toContain(t)
  })
})
