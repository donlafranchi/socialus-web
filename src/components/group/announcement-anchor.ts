// bug #211 — the fragment that names ONE announcement on its Page.
//
// A browse card carries an announcement, and before this its link carried only
// the Page. You landed at the top and hunted for the one you tapped — and if
// you owned the Page you landed on the composer instead, because that renders
// between the heading and the list.
//
// One constant, for the same reason ANNOUNCE_ANCHOR is one constant: #185 was
// two string literals written three PRs apart, only one of which ever existed.
// The feed writes this and the Page reads it, so a rename has to move both or
// neither.
//
// The id is the announcement's `page_posts.id`. It is a uuid — not guessable,
// and not an address: a fragment is never sent to the server, so this reveals
// nothing to anyone who could not already read the row. When an announcement
// gets its own URL and public id, that replaces this, and this constant is the
// single place that changes.
export const ANNOUNCEMENT_ANCHOR_PREFIX = 'announcement-'

export function announcementAnchor(postId: string): string {
  return `${ANNOUNCEMENT_ANCHOR_PREFIX}${postId}`
}

/** The announcement id a fragment names, or null if it names something else. */
export function announcementIdFromHash(hash: string | null | undefined): string | null {
  if (!hash) return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (!raw.startsWith(ANNOUNCEMENT_ANCHOR_PREFIX)) return null
  const id = raw.slice(ANNOUNCEMENT_ANCHOR_PREFIX.length)
  return id.length > 0 ? id : null
}
