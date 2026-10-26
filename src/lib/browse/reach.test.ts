import { describe, it, expect } from 'vitest'
import { parseReach, reachLine, widerReach, REACH_CAP } from './reach'

describe('#922 — Explore’s reach', () => {
  it('reads a ring or the whole area from a link, and nothing else', () => {
    expect(parseReach('30')).toBe(30)
    expect(parseReach('all')).toBe('all')
    expect(parseReach('20')).toBeNull()
    expect(parseReach('')).toBeNull()
    expect(parseReach(null)).toBeNull()
  })

  it('"Show more nearby" widens one ring, then to the whole area past the cap, then stops', () => {
    expect(widerReach(15)).toBe(30)
    expect(widerReach(45)).toBe(60)
    expect(REACH_CAP).toBe(60)
    expect(widerReach(60)).toBe('all')
    expect(widerReach('all')).toBeNull()
  })

  it('says how far in plain words, never a distance on a card', () => {
    expect(reachLine(15, null, true)).toBe('Within 15 minutes of you')
    expect(reachLine(60, null, true)).toBe('Within an hour of you')
    expect(reachLine(30, 'Sacramento', false)).toBe('Within 30 minutes of Sacramento')
    expect(reachLine(30, null, false)).toBe('Within 30 minutes')
    expect(reachLine('all', null, true)).toBe('Across the whole area')
  })
})
