// What a Page kind carries — Don's ruling, 2026-09-16:
//
//   "Vendors go. Those are now absorbed by page types. And the page types gets
//    its various type of control. E.g. map and address control"
//
// The vendor funnel had this backwards: one "business" shape that owned the
// address and the map pin, with every other kind of Page bolted around it. The
// control belongs to the kind.
//
// This is the smallest honest expression of that rule, not the whole design. It
// answers one question — what does this kind carry — in one place, which the
// map reads now and the composer can read next. Making every control
// kind-owned is a larger change and this does not pretend to be it.

import { GROUP_KINDS, type GroupKind } from '@/actions/group/constants'

export { GROUP_KINDS }
export type { GroupKind }

export interface KindControls {
  /** Does this kind have premises — a street address or a pinned point? */
  hasAddress: boolean
  /** Does a Page of this kind belong on the map? */
  appearsOnMap: boolean
}

// Premises decide it, not the noun. `nouns.md`: "having premises decides it,
// not the Page kind" — which is the same rule stated from the other side: the
// kinds below are the ones that have premises.
const CONTROLS: Record<GroupKind, KindControls> = {
  business: { hasAddress: true, appearsOnMap: true },
  place: { hasAddress: true, appearsOnMap: true },
  // An event happens somewhere, so the Page anchored to it has a point.
  event_anchored: { hasAddress: true, appearsOnMap: true },
  // People, not premises. An address control here invites a home address onto
  // a public map, which is exactly what the address rule exists to prevent.
  interest: { hasAddress: false, appearsOnMap: false },
  practice: { hasAddress: false, appearsOnMap: false },
  family: { hasAddress: false, appearsOnMap: false },
}

const WITHOUT_PREMISES: KindControls = { hasAddress: false, appearsOnMap: false }

export function controlsForKind(kind: GroupKind): KindControls {
  return CONTROLS[kind]
}

/**
 * Map membership for a kind that arrived as a string — a database row, a URL.
 *
 * Unknown kinds withhold the pin. A kind added to the schema and not to the
 * table above must not land on a public map by default; the failure of
 * omission should be invisibility, not exposure.
 */
export function appearsOnMap(kind: string): boolean {
  return CONTROLS[kind as GroupKind]?.appearsOnMap ?? WITHOUT_PREMISES.appearsOnMap
}
