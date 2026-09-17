// T159 (Issue #61) — the read-path helper every surface that projects a Page
// photo must call.
//
// Hiding is a projection concern, not a deletion. `photo_hidden_at` being
// non-null stops the app serving the URL on every surface; the storage object
// is untouched, which is precisely what makes a restore possible.
//
// REMOVAL NOW WORKS THE SAME WAY (2026-09-17). It used to null `photo_url`,
// which destroyed the URL and made a removal impossible to reverse — there was
// nothing to restore it *to*. `photo_removed_at` joins `photo_hidden_at` here,
// and neither the URL nor the bytes are touched by either.
//
// The earlier sentence "only the operator's remove for good deletes bytes" was
// never true: the media bucket's delete policy is "authenticated delete own
// folder", so the operator's key cannot remove another member's object. Nothing
// in this project deletes photo bytes today. See docs/purge-proposal.md.
//
// This ships ahead of its first consumer on purpose. `groups.photo_url` is
// read by nothing today — the render path is T145 (#26) — so the takedown
// path exists before the first upload is accepted, which is Rule 1.
//
// KNOWN LIMIT, now larger and worth stating plainly: hidden is not unreachable,
// and neither is removed. A direct link to the storage object still resolves
// for both, permanently. Reversibility requires it.
//
// For ordinary bad content that is the right trade. For illegal content it is
// not an acceptable end state, and "we kept it so it could be reversed" is the
// wrong answer to that. The irreversible path that closes it is specified in
// docs/purge-proposal.md and is deliberately not built — it needs a storage
// policy migration.

export interface PhotoProjection {
  photo_url: string | null
  /** Non-null means hidden. `pg` hands back a Date; a JSON projection, a string. */
  photo_hidden_at: Date | string | null
  /** Non-null means removed by the operator. Optional so older callers compile. */
  photo_removed_at?: Date | string | null
}

export function visiblePhotoUrl(group: PhotoProjection | null | undefined): string | null {
  if (!group) return null
  if (group.photo_hidden_at != null) return null
  if (group.photo_removed_at != null) return null
  return group.photo_url ?? null
}
