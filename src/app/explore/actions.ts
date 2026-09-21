'use server'

// Refetching Browse without leaving the surface.
//
// Changing metro goes through here rather than through a navigation, for one
// reason that is not performance: the metro stays SERVER-resolved. A client
// that refetched for itself would need the scope rules — precedence, the
// stale-slug fallback, whether anybody chose it — duplicated in the browser,
// and the two copies would drift. The surface keeps showing the previous page
// until this resolves, so a metro change reads as a change of scope rather
// than as a page load.

import { loadBrowse, type BrowseSnapshot } from './load'

export async function browseFeedAction(metroSlug: string | null): Promise<BrowseSnapshot> {
  return loadBrowse(metroSlug)
}
