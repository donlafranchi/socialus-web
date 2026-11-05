import { describe, it, expect } from 'vitest'
import { LABELS, FALLBACK_LABEL, MAX_PICKS } from './list'
import { INTEREST_VOCAB } from '@/lib/onboarding/interest-vocab'
import { normalizeTag } from '@/lib/groups/tags'
import { suggestLabels, listedUnder, toStoredTags, picksFromTags, isListLabel, topOf } from './match'

describe('#1180 — the shared list', () => {
  it('its top labels are the 12 interest labels, in their order', () => {
    expect(LABELS.map((t) => [t.tag, t.label])).toEqual(INTEREST_VOCAB.map((t) => [t.tag, t.label]))
  })

  it('has about 60 finer labels, every one with words', () => {
    const finer = LABELS.flatMap((t) => t.finer)
    expect(finer.length).toBeGreaterThanOrEqual(55)
    expect(finer.length).toBeLessThanOrEqual(70)
    for (const f of finer) expect(f.words.length).toBeGreaterThan(0)
  })

  it('no two labels share a name, top or finer', () => {
    const all = LABELS.flatMap((t) => [t.label, ...t.finer.map((f) => f.label)]).map(normalizeTag)
    expect(new Set(all).size).toBe(all.length)
  })

  it('names no kind of person (no sellers, vendors, creators)', () => {
    const all = LABELS.flatMap((t) => [t.label, ...t.finer.map((f) => f.label)]).join(' ').toLowerCase()
    expect(all).not.toMatch(/\b(sellers?|vendors?|creators?|merchants?)\b/)
  })

  it('the fallback is one of the 12', () => {
    expect(LABELS.map((t) => t.label)).toContain(FALLBACK_LABEL)
  })
})

describe('#1180 — suggestLabels: a word match on the post', () => {
  it('a bakery post lands under Food & drink, then Bakery', () => {
    expect(suggestLabels('Sourdough and croissants back Friday')).toEqual(['Food & drink', 'Bakery'])
  })

  it('matches whole words only', () => {
    expect(suggestLabels('Pieces of history')).toEqual(['Arts & culture', 'Museums & history'])
  })

  it('allows a plural', () => {
    expect(suggestLabels('Fresh eggs this week')).toEqual(['Farmers markets', 'Eggs & dairy'])
  })

  it('is case- and spacing-blind', () => {
    expect(suggestLabels('LIVE   MUSIC tonight')).toEqual(['Live music'])
  })

  it('keeps at most 3 labels: the top and its two strongest finer ones', () => {
    const got = suggestLabels('Coffee, sourdough bread, pastries, beer and a food truck')
    expect(got.length).toBeLessThanOrEqual(MAX_PICKS)
    expect(got[0]).toBe('Food & drink')
    expect(got[1]).toBe('Bakery')
  })

  it('a tie goes to the more specific label', () => {
    expect(suggestLabels('Pottery studio, local food')).toEqual(['Crafts & makers', 'Pottery'])
  })

  it('a longer phrase outweighs a word inside it', () => {
    expect(suggestLabels('Repair Cafe Regulars')).toEqual(['Sustainability', 'Repair & reuse'])
  })

  it('returns nothing when nothing matches', () => {
    expect(suggestLabels('Hello there')).toEqual([])
  })
})

describe('#1180 — listedUnder: the word match, then the Page, then the fallback', () => {
  it('the words win', () => {
    expect(listedUnder({ text: 'Pottery class Saturday', pageTags: ['Food & drink'] })).toEqual(['Crafts & makers', 'Pottery'])
  })

  it("no match: the Page's own labels", () => {
    expect(listedUnder({ text: 'See you there', pageTags: ['Food & drink', 'Bakery', 'sourdough'] })).toEqual(['Food & drink', 'Bakery'])
  })

  it('nothing at all: Neighborhood life', () => {
    expect(listedUnder({ text: 'See you there' })).toEqual([FALLBACK_LABEL])
  })
})

describe('#1180 — what is stored', () => {
  it('a finer pick carries its top label, before it', () => {
    expect(toStoredTags(['Bakery'])).toEqual(['Food & drink', 'Bakery'])
  })

  it('drops anything not on the list, and duplicates', () => {
    expect(toStoredTags(['sourdough', 'Bakery', 'food & drink', 'Bakery'])).toEqual(['Food & drink', 'Bakery'])
  })

  it('reads stored tags back as the list labels they are', () => {
    expect(picksFromTags(['food & drink', 'BAKERY', 'old free tag'])).toEqual(['Food & drink', 'Bakery'])
  })

  it('knows a list label, and which top it sits under', () => {
    expect(isListLabel('bakery')).toBe(true)
    expect(isListLabel('sourdough')).toBe(false)
    expect(topOf('Bakery')).toBe('Food & drink')
    expect(topOf('Gardening')).toBe('Gardening')
  })
})

describe('#1180 — Explore and its rows read these labels', () => {
  it("every shelf that narrows by label names one on the list, so a listed post lands in it", async () => {
    const { readFileSync } = await import('fs')
    const path = await import('path')
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261101200000_shelves.sql'), 'utf8')
    const tags = [...sql.matchAll(/"tags":\[([^\]]*)\]/g)].flatMap((m) => [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!))
    expect(tags.length).toBeGreaterThan(0)
    for (const t of tags) expect(isListLabel(t), t).toBe(true)
  })

  it("Explore's category filter is the list's 12 top labels", async () => {
    const { CATEGORY_TAGS } = await import('@/lib/browse/filters')
    expect(CATEGORY_TAGS).toEqual(LABELS.map((t) => normalizeTag(t.label)))
  })
})
