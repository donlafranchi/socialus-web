import { describe, expect, it } from 'vitest'
import { COPY } from './copy'

// #1536 — the PM's wording, 2026-11-27: "Shows last updated 27 Nov, from Ace of Spades' own site".
describe('COPY.showsLastUpdated', () => {
  const now = new Date('2026-11-27T20:00:00Z')
  it('is the PM\'s wording, the day and month in Pacific time', () => {
    expect(COPY.showsLastUpdated('Ace of Spades', new Date('2026-11-27T14:20:00Z'), now)).toBe("Shows last updated 27 Nov, from Ace of Spades' own site")
    // 01:00 UTC on the 28th is still the 27th in Sacramento.
    expect(COPY.showsLastUpdated('Ace of Spades', new Date('2026-11-28T01:00:00Z'), now)).toBe("Shows last updated 27 Nov, from Ace of Spades' own site")
  })
  it('makes the name possessive the way it is written', () => {
    expect(COPY.showsLastUpdated('Harris Center', now, now)).toBe("Shows last updated 27 Nov, from Harris Center's own site")
    expect(COPY.showsLastUpdated('The Center for the Arts', now, now)).toBe("Shows last updated 27 Nov, from The Center for the Arts' own site")
    expect(COPY.showsLastUpdated("Harlow's", now, now)).toBe("Shows last updated 27 Nov, from Harlow's own site")
    expect(COPY.showsLastUpdated('Harlow’s', now, now)).toBe('Shows last updated 27 Nov, from Harlow’s own site')
  })
  it('names the year when it is not this year', () => {
    expect(COPY.showsLastUpdated('Ace of Spades', new Date('2025-12-30T20:00:00Z'), now)).toBe("Shows last updated 30 Dec 2025, from Ace of Spades' own site")
  })
})
