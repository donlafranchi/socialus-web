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

  // #363 — two types (ruled 2026-10-05). The old family kind is a private
  // group now; privacy keeps it off the map, not its type.
  it('both types carry an address, appear on the map and publish links out', () => {
    for (const kind of GROUP_KINDS) {
      expect(controlsForKind(kind)).toEqual({ hasAddress: true, appearsOnMap: true, hasSocialLinks: true })
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
