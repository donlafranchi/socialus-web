import { describe, it, expect } from 'vitest'
import { placePillLabel, isPlacePrompt, NO_PLACE_CHOSEN_LABEL } from './place-label'

// The pill printed the resolved place name unconditionally. With nothing
// chosen, that name is "The Good Place" — a seeded stand-in for the IP
// geolocation deferred at b1 — so it asserted a locality to someone who had
// never named one.

describe('placePillLabel', () => {
  it('names the place when someone actually chose it', () => {
    expect(placePillLabel({ placeName: 'Sacramento', chosen: true })).toBe('Sacramento')
  })

  // #329 — PM, 2026-10-07: the pill is never blank. It names the member's
  // metro by default, chosen or not.
  it('names the default metro too, when nobody picked one', () => {
    expect(placePillLabel({ placeName: 'Sacramento-Roseville, CA', chosen: false })).toBe('Sacramento-Roseville, CA')
  })

  it('asks rather than asserts when there is no origin at all', () => {
    expect(placePillLabel(null)).toBe(NO_PLACE_CHOSEN_LABEL)
  })

  it('asks when the name is blank, rather than showing an empty pill', () => {
    expect(placePillLabel({ placeName: '   ', chosen: true })).toBe(NO_PLACE_CHOSEN_LABEL)
  })

  // Plain words a member would use — no invented locality, no jargon.
  it('uses words a member would recognise', () => {
    expect(NO_PLACE_CHOSEN_LABEL).toBe('Choose your area')
    expect(NO_PLACE_CHOSEN_LABEL).not.toMatch(/locality|metro|place_id|default|null/i)
  })

  it('marks only the no-metro case as a prompt', () => {
    expect(isPlacePrompt({ placeName: null, chosen: false })).toBe(true)
    expect(isPlacePrompt({ placeName: 'Sacramento', chosen: false })).toBe(false)
  })
})
