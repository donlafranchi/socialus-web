import { describe, it, expect } from 'vitest'
import { locationLine, isMappable, LOCATION_SCALES } from './location'

// The scale is ratified product vocabulary, not component invention:
// surfaces.md § Distance is out gives "hood → metro → wider → online", item.md
// gives "address, neighbourhood, or Online". These tests pin that the code
// uses those terms and no others.

describe('LOCATION_SCALES', () => {
  it('is the ratified ladder, in the ratified order', () => {
    expect(LOCATION_SCALES).toEqual(['address', 'neighbourhood', 'metro', 'wider', 'online'])
  })
})

describe('locationLine', () => {
  it('shows the label when there is one', () => {
    expect(locationLine({ scale: 'address', label: '3117 Broadway' })).toBe('3117 Broadway')
    expect(locationLine({ scale: 'neighbourhood', label: 'Oak Park' })).toBe('Oak Park')
  })

  // The point of a required slot: there is never a gap where a line should be.
  it('never returns an empty string, for any scale', () => {
    for (const scale of LOCATION_SCALES) {
      expect(locationLine({ scale }).length).toBeGreaterThan(0)
      expect(locationLine({ scale, label: '' }).length).toBeGreaterThan(0)
      expect(locationLine({ scale, label: '   ' }).length).toBeGreaterThan(0)
      expect(locationLine({ scale, label: null }).length).toBeGreaterThan(0)
    }
  })

  // Online is a value, not an absence.
  it('says Online for something with no physical place', () => {
    expect(locationLine({ scale: 'online' })).toBe('Online')
  })
})

describe('isMappable', () => {
  // surfaces.md: "online Items never render on the map — no pin, no fallback
  // coordinate."
  it('refuses a pin for online, and allows one for every physical scale', () => {
    expect(isMappable({ scale: 'online' })).toBe(false)
    for (const scale of ['address', 'neighbourhood', 'metro', 'wider'] as const) {
      expect(isMappable({ scale })).toBe(true)
    }
  })
})
