// What the server hands the client body.
//
// It lives here rather than beside `loadBrowse` on purpose. `load.ts` imports
// the cookie-bound Supabase client, which reaches `next/headers`; a client
// component importing this shape from there would be one dropped `type`
// keyword away from pulling server code into the bundle. The shape is data,
// so it lives with the other data.

import type { BrowseResult } from '@/lib/feed/browse-feed'
import type { FeedMetro } from '@/lib/feed/feed-metro'

export interface BrowseSnapshot {
  results: BrowseResult[]
  /** Null when no metro resolves at all — the no-scope state. */
  metro: FeedMetro | null
  /** Did a person pick this metro, or did it fall out of a default? */
  chosen: boolean
  metros: FeedMetro[]
  signedIn: boolean
  /** The read failed. Distinct from "nothing matched", which is `[]`. */
  failed: boolean
}
