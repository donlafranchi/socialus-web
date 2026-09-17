import { describe, it, expect } from 'vitest'
import { controlsForKind, appearsOnMap, hasSocialLinks, GROUP_KINDS } from './kind-controls'

// Don's ruling, 2026-09-16: "Vendors go. Those are now absorbed by page types.
// And the page types gets its various type of control. E.g. map and address
// control"
//
// The second half is the one that shapes code. A control is a property of the
// Page kind, not a global surface every Page passes through. The vendor funnel
// had it the other way round — one "business" shape with an address, and
// everything else bolted on.
//
// This is the smallest honest expression of that: one place that answers "what
// does this kind carry", which the map reads today and the composer can read
// next. It is not the whole design — kind-owned controls is a larger change,
// and this does not pretend to be it.

describe('controlsForKind', () => {
  it('answers for every kind the schema allows — no kind falls through', () => {
    for (const kind of GROUP_KINDS) {
      expect(controlsForKind(kind)).toBeDefined()
    }
  })

  it('a kind with premises carries an address and appears on the map', () => {
    expect(controlsForKind('business')).toMatchObject({ hasAddress: true, appearsOnMap: true })
    expect(controlsForKind('place')).toMatchObject({ hasAddress: true, appearsOnMap: true })
  })

  // CORRECTION. The first version of this file asserted that interest and
  // practice carried no address. That contradicts the ratified mapping in
  // ops-pattern `product/systems/page-kind-tools.md` § The mapping, whose
  // Location anchor row is ● for place, interest, practice, event_anchored and
  // business, and ✕ for family alone. A run club meets somewhere.
  it('a community kind still has a place — it is a social group, not a homeless one', () => {
    for (const kind of ['interest', 'practice', 'event_anchored'] as const) {
      expect(controlsForKind(kind)).toMatchObject({ hasAddress: true, appearsOnMap: true })
    }
  })

  // family is the community set with privacy on: "every tool it loses, it loses
  // because nobody outside can see it, not because a family cannot do it".
  it('family carries nothing public — not the map, not links out', () => {
    expect(controlsForKind('family')).toEqual({
      hasAddress: false,
      appearsOnMap: false,
      hasSocialLinks: false,
    })
  })

  it('every kind but family publishes links out', () => {
    for (const kind of GROUP_KINDS) {
      expect(controlsForKind(kind).hasSocialLinks).toBe(kind !== 'family')
    }
  })

  it('an unknown kind carries no links, same as it gets no pin', () => {
    expect(hasSocialLinks('something_new_from_a_migration')).toBe(false)
  })

  it('appearsOnMap tolerates an unknown kind by withholding the pin', () => {
    // A kind added to the schema and not to this table must not silently land
    // on the map with whatever default an object lookup returns.
    expect(appearsOnMap('something_new_from_a_migration')).toBe(false)
  })
})
