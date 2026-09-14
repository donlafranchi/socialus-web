// T159 (Issue #61) — the read-path helper every surface that projects a Page
// photo must call.
//
// Hiding is a projection concern, not a deletion. `photo_hidden_at` being
// non-null stops the app serving the URL on every surface; the storage object
// is untouched, which is precisely what makes a restore possible. Only the
// operator's "remove for good" (T122) deletes bytes.
//
// This ships ahead of its first consumer on purpose. `groups.photo_url` is
// read by nothing today — the render path is T145 (#26) — so the takedown
// path exists before the first upload is accepted, which is Rule 1.
//
// Known limit, recorded in #61 and worth repeating at the call site: hidden is
// not unreachable. A direct link to the storage object still resolves while a
// photo is merely hidden. Reversibility requires it.

export interface PhotoProjection {
  photo_url: string | null
  /** Non-null means hidden. `pg` hands back a Date; a JSON projection, a string. */
  photo_hidden_at: Date | string | null
}

export function visiblePhotoUrl(group: PhotoProjection | null | undefined): string | null {
  if (!group) return null
  if (group.photo_hidden_at != null) return null
  return group.photo_url ?? null
}
