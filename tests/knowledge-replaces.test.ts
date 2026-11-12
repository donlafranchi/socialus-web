import { describe, it, expect } from 'vitest'
import { replacesTagNames } from '../scripts/knowledge/import'

// #1282: a ruling gone from socialus-plan retires against the newer ruling
// whose `[replaces …]` names it, by the old ruling's date or by the scenario
// it sat in (socialus-ops process/ABSOLUTES.md § newer-decision-wins).

const gone = {
  decided_on: '2026-09-30',
  source: 'planning/scenario-F093.md:66',
  answer: 'Signed-out visitors see no map pins. A Page\'s stored location is used only for metro scoping when signed out.',
}

describe('which ruling a [replaces …] tag names', () => {
  it('names it by date, with its words or a clause of them', () => {
    expect(replacesTagNames('[replaces 2026-09-30: Signed-out visitors see no map pins.]', gone)).toBe(true)
    expect(replacesTagNames('[replaces 2026-10-01: Signed-out visitors see no map pins.]', gone)).toBe(false)
  })

  it('names it by the scenario it sat in, with its words or a clause of them', () => {
    expect(replacesTagNames('[replaces F093: Signed-out visitors see no map pins.]', gone)).toBe(true)
    expect(replacesTagNames(`[replaces F093: ${gone.answer}]`, gone)).toBe(true)
    // Another scenario's file, or F0930's, is not this one.
    expect(replacesTagNames('[replaces F091: Signed-out visitors see no map pins.]', gone)).toBe(false)
    expect(replacesTagNames('[replaces F0930: Signed-out visitors see no map pins.]', { ...gone, source: 'planning/scenario-F093.md:66' })).toBe(false)
    expect(replacesTagNames('[replaces F093: Signed-out visitors see the map.]', gone)).toBe(false)
    expect(replacesTagNames('[replaces F093: Signed-out visitors see no map pins.]', { ...gone, source: null })).toBe(false)
  })

  it('a path or none names no ruling', () => {
    expect(replacesTagNames('[replaces planning/scenario-F093.md]', gone)).toBe(false)
    expect(replacesTagNames('[replaces none]', gone)).toBe(false)
  })
})
