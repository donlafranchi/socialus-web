// Home is PAUSED — off the site, not deleted. Don's ruling, 2026-09-17.
//
// `/` used to render LocalityFeed. It now redirects to Explore so nobody lands
// on a surface we have stopped maintaining.
//
// NOTHING BEHIND IT IS DELETED. `LocalityFeed`, `ScopePicker`,
// `MakeThisYoursBanner` and the `locality_feed_items` RPC all stay exactly
// where they are. They carry the only place-scoping and interest-ordering in
// the app, and that capability is likely moving to Explore — deleting it would
// mean rebuilding it. Kept, and kept out of the member's way.
//
// The decision about Home's future is deferred, not made. See
// ops-pattern/DECISIONS.md 2026-09-17.

import { redirect } from 'next/navigation'

export default function RootPage() {
  redirect('/explore')
}
