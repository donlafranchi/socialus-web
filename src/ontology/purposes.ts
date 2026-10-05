// A Page's PURPOSE — what it mainly accomplishes (Don ruled A, 2026-10-05:
// purpose first, type for listing). Not a noun and not a column list: each
// value points at the loops in socialus-plan product/needs/member-journey.md
// it serves, so the purpose a Page is given stays tied to what a member does
// with it. Later loops (Share/Ask, Pooling, Federation) get purposes when built.
//
// The type a purpose implies (business or social group) is the code's
// TYPE_FOR_PURPOSE in src/lib/groups/page-kind.ts; a test keeps the two in step.
// A Member has no purpose and no type: these describe Pages only.

import type { PageKind, Purpose } from '../lib/groups/page-kind'

export interface PagePurpose {
  value: Purpose
  /** The loops it serves, by number in member-journey.md's table. */
  loops: readonly number[]
  journey: string
  /** The type it implies by default; the owner can change it. */
  defaultType: PageKind
  ruled: string
}

const JOURNEY = 'socialus-plan product/needs/member-journey.md § What the loops currently run on'

export const PAGE_PURPOSES: readonly PagePurpose[] = [
  { value: 'gather', loops: [1, 4, 5, 6, 7], journey: JOURNEY, defaultType: 'group', ruled: '2026-10-05' },
  { value: 'sell', loops: [9], journey: JOURNEY, defaultType: 'business', ruled: '2026-10-05' },
  { value: 'offer', loops: [8, 11], journey: JOURNEY, defaultType: 'business', ruled: '2026-10-05' },
  { value: 'create', loops: [5, 6, 9], journey: JOURNEY, defaultType: 'group', ruled: '2026-10-05' },
]
