import { describe, it, expect } from 'vitest'
import { pillSummary, toggleKind, withWhen } from './search-pill'

const TAGS = ['music', 'food']

describe('pillSummary (Airbnb-style pill, Don 2026-11-01)', () => {
  it('idle, it reads Anything · Anywhere nearby · Any time', () => {
    expect(pillSummary('', TAGS, null)).toEqual({ what: 'Anything', where: 'Anywhere nearby', when: 'Any time' })
  })

  it('names the words, the area and the day the box holds', () => {
    expect(pillSummary('bakery this weekend', TAGS, 'Midtown')).toEqual({ what: 'bakery', where: 'Midtown', when: 'This weekend' })
  })

  it('with no words, the kinds and tags stand for What', () => {
    expect(pillSummary('events music', TAGS, null).what).toBe('music, Events')
  })

  it('a picked day reads as a date', () => {
    expect(pillSummary('2026-11-07', TAGS, null).when).toMatch(/Nov 7/)
  })
})

describe('the panel writes the same box text', () => {
  it('toggles a kind word in and out, keeping the rest', () => {
    const on = toggleKind('bakery today', TAGS, 'event')
    expect(on).toBe('bakery events today')
    expect(toggleKind(on, TAGS, 'event')).toBe('bakery today')
  })

  it('sets and clears When', () => {
    expect(withWhen('bakery', TAGS, 'weekend')).toBe('bakery this weekend')
    expect(withWhen('bakery this weekend', TAGS, 'week')).toBe('bakery this week')
    expect(withWhen('bakery this week', TAGS, 'any')).toBe('bakery')
    expect(withWhen('', TAGS, '2026-11-07')).toBe('2026-11-07')
  })
})
