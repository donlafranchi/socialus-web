// What the server hands the client body.
//
// It lives here rather than beside `loadBrowse` on purpose. `load.ts` imports
// the cookie-bound Supabase client, which reaches `next/headers`; a client
// component importing this shape from there would be one dropped `type`
// keyword away from pulling server code into the bundle. The shape is data,
// so it lives with the other data.

import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { FeedMetro } from '@/lib/feed/feed-metro'
import type { MixedResult } from '@/lib/map/mix'

/** F091 — the rows under "What's happening…". Empty for a signed-out reader. */
export interface HappeningSnapshot {
  today: BrowseResult[]
  thisWeek: BrowseResult[]
  thisWeekend: BrowseResult[]
}

export interface BrowseSnapshot {
  results: BrowseResult[]
  /**
   * Announcements from Pages this member gets updates from (F059 criterion 2b).
   *
   * Always `[]` for a signed-out reader, and `[]` is a real state rather than a
   * fallback: the row HIDES when this is empty, never renders empty. Nothing
   * downstream may distinguish "signed out" from "follows nothing" — both are
   * an absent row, which is the point.
   */
  following: BrowseResult[]
  happening: HappeningSnapshot
  /** #331 — the default map's pins: a tunable mix of four buckets. Always `[]` signed out (no pins). */
  map: MixedResult[]
  /** Null when no metro resolves at all — the no-scope state. */
  metro: FeedMetro | null
  /** #476 — the neighbourhood the member narrowed to, or null for the whole metro. */
  area: { id: string; name: string } | null
  /** Did a person pick this metro, or did it fall out of a default? */
  chosen: boolean
  metros: FeedMetro[]
  signedIn: boolean
  /** The read failed. Distinct from "nothing matched", which is `[]`. */
  failed: boolean
}
