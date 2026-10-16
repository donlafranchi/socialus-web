// #619 / #621 (F092.2, F092.4) — the filter sheet writes its selection into the search box as plain
// lowercase words, the way Google writes one (the PM, 2026-10-11: no hashtags), and the box's reader
// understands every string the sheet can write. One grammar, two directions. The reader is built to
// grow: it takes the words it knows out of the box and leaves the rest as the free search.

import { describe, it, expect } from 'vitest'
import { writeBox, readBox, isReservedWord } from './box-text'
import { DATE_OPTIONS, DEFAULT_BROWSE_FILTERS, type BrowseFilters } from './filters'

const KNOWN = ['coffee', 'live music', 'sourdough', 'wood-fired', "farmer's market", 'live']
// Tags that are awkward to write as words: one inside another, hyphens, apostrophes.
const AWKWARD = [...KNOWN, 'live music night', 'wood']
const sel = (date: BrowseFilters['date'], ...tags: string[]): BrowseFilters => ({ ...DEFAULT_BROWSE_FILTERS, date, tags })

describe('writeBox', () => {
  // [guards F092.2 partial: plain lowercase words, tags first, the schedule last, no hashtags]
  it('writes tags and the schedule as plain words', () => {
    expect(writeBox(sel('weekend', 'coffee', 'live music'))).toBe('coffee live music this weekend')
    expect(writeBox(sel('week'))).toBe('this week')
    expect(writeBox(sel('any', 'coffee'))).toBe('coffee')
    expect(writeBox(sel('any'))).toBe('')
  })

  it('never writes a hashtag', () => {
    expect(writeBox(sel('weekend', 'coffee', 'live music'))).not.toContain('#')
  })

  it('keeps the words already typed in front of what the sheet writes', () => {
    expect(writeBox(sel('weekend', 'coffee'), 'bakery')).toBe('bakery coffee this weekend')
    expect(writeBox(sel('any'), '  bakery  ')).toBe('bakery')
  })

  it('writes each schedule option in the words of its label', () => {
    for (const o of DATE_OPTIONS) if (o.value !== 'any') expect(writeBox(sel(o.value))).toBe(o.label.toLowerCase())
  })
})

describe('readBox', () => {
  it('takes the schedule and the known tags out of the box, and leaves the rest as the search', () => {
    expect(readBox('bakery coffee this weekend', KNOWN)).toEqual({ filters: sel('weekend', 'coffee'), rest: 'bakery' })
  })

  it('reads by hand-typed text the same way, whatever the case or spacing', () => {
    expect(readBox('  Coffee   LIVE  Music This   Weekend ', KNOWN)).toEqual({ filters: sel('weekend', 'coffee', 'live music'), rest: '' })
  })

  it('a word it does not know stays in the search, never errors, never empties the box', () => {
    expect(readBox('pottery', KNOWN)).toEqual({ filters: sel('any'), rest: 'pottery' })
    expect(readBox('', KNOWN)).toEqual({ filters: sel('any'), rest: '' })
  })

  it('matches whole words only: "this weekend" is not "this week" plus "end"', () => {
    expect(readBox('this weekend', KNOWN).filters.date).toBe('weekend')
    expect(readBox('weekender', KNOWN)).toEqual({ filters: sel('any'), rest: 'weekender' })
    expect(readBox('coffeehouse', KNOWN)).toEqual({ filters: sel('any'), rest: 'coffeehouse' })
  })

  it('reads a tag that is a hashtag in an old link as the same plain word', () => {
    expect(readBox('#coffee', KNOWN)).toEqual({ filters: sel('any', 'coffee'), rest: '' })
  })
})

describe('the schedule words are the box\'s own', () => {
  it('a tag with exactly a schedule phrase is read as the schedule, and is not offered as a tag word', () => {
    expect(readBox('this weekend', [...KNOWN, 'this weekend'])).toEqual({ filters: sel('weekend'), rest: '' })
    expect(isReservedWord('This Weekend')).toBe(true)
    expect(isReservedWord('weekend')).toBe(false)
  })
})

describe('the round trip', () => {
  const tagSets = (tags: string[]): string[][] => tags.reduce<string[][]>((acc, t) => acc.concat(acc.map((s) => [...s, t])), [[]])

  // [guards F092.4]
  it('every selection the sheet can write is read back as the same selection', () => {
    let n = 0
    for (const schedule of ['any', 'weekend', 'week'] as const) {
      for (const tags of tagSets(AWKWARD)) {
        const selection = sel(schedule, ...[...tags].sort())
        const read = readBox(writeBox(selection), AWKWARD)
        expect(read.rest, JSON.stringify(selection)).toBe('')
        expect({ schedule: read.filters.date, tags: [...read.filters.tags].sort() }).toEqual({ schedule, tags: [...tags].sort() })
        n++
      }
    }
    expect(n).toBe(3 * 2 ** AWKWARD.length)
  })

  it('keeps the free words through a write and a read', () => {
    const read = readBox(writeBox(sel('week', 'coffee', 'live music'), 'near the river'), KNOWN)
    expect(read).toEqual({ filters: sel('week', 'coffee', 'live music'), rest: 'near the river' })
  })
})

describe('#796 — Updates is a word the box knows', () => {
  it('reads the old "updates" word as posts only', () => {
    const { filters, rest } = readBox('bread updates', [])
    // #876 — the old word reads as the posts-only Type, and is written as "posts" from then on.
    expect(filters.type).toBe('posts')
    expect(rest).toBe('bread')
    expect(writeBox({ ...filters }, rest)).toBe('bread posts')
    expect(readBox('bread', []).filters.type).toBe('all')
  })
})

