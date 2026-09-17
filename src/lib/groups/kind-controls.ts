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
  /** Does this kind publish links out — Instagram, a website? */
  hasSocialLinks: boolean
}

// Source of truth: ops-pattern `product/systems/page-kind-tools.md` § The
// mapping. That table is ratified and this mirrors it — it does not decide.
//
// CORRECTION (2026-09-17): the first version of this file had `interest` and
// `practice` carrying no address, which contradicts that table's Location
// anchor row (● for place, interest, practice, event_anchored, business; ✕ for
// family only). A run club meets somewhere. Fixed here.
//
// `family` is the community set with privacy on — "one BEFORE INSERT trigger
// defaulting it to private". Every tool it loses, it loses because nobody
// outside can see it, not because a family cannot do it. That is why it is the
// single ✕ on both rows below.
const CONTROLS: Record<GroupKind, KindControls> = {
  business: { hasAddress: true, appearsOnMap: true, hasSocialLinks: true },
  place: { hasAddress: true, appearsOnMap: true, hasSocialLinks: true },
  interest: { hasAddress: true, appearsOnMap: true, hasSocialLinks: true },
  practice: { hasAddress: true, appearsOnMap: true, hasSocialLinks: true },
  event_anchored: { hasAddress: true, appearsOnMap: true, hasSocialLinks: true },
  family: { hasAddress: false, appearsOnMap: false, hasSocialLinks: false },
}

const WITHOUT_PREMISES: KindControls = {
  hasAddress: false,
  appearsOnMap: false,
  hasSocialLinks: false,
}

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

/** Social links for a kind that arrived as a string. Unknown kinds carry none. */
export function hasSocialLinks(kind: string): boolean {
  return CONTROLS[kind as GroupKind]?.hasSocialLinks ?? WITHOUT_PREMISES.hasSocialLinks
}
