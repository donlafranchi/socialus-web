import { describe, it, expect } from 'vitest'
import { componentOn } from './page-components'

// Path: well-worn — Google Business Profile shows hours only for categories that
// have them; a component an owner can add (Don, 2026-10-04).
describe('hours and phone, as a component', () => {
  it('on by default for a business', () => {
    expect(componentOn('business', {}, 'contact')).toBe(true)
  })
  it('off by default for groups and organizations (#363: practice is a group now)', () => {
    for (const kind of ['interest', 'place', 'practice', 'event_anchored', 'family']) expect(componentOn(kind, {}, 'contact')).toBe(false)
  })
  it('an owner can add it to a group, or take it off a shop', () => {
    expect(componentOn('interest', { components: { contact: true } }, 'contact')).toBe(true)
    expect(componentOn('business', { components: { contact: false } }, 'contact')).toBe(false)
  })
})
