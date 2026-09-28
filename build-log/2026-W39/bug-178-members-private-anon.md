# A member marked private is not handed to a stranger

*2026-09-27. bug · #178. Launch-blocking.*

## What was wrong

`members_public_read` (002) admitted every live member to every role,
`anon` included, and never read `stakeholder_visibility` — a column that has
defaulted to `'private'` since the same file. Every real signup is `'private'`
because nothing can change the default; every seeded showcase member is
`'public'`. So production served all 11 rows to a stranger, 3 of them private,
and every surface looked right against the seed.

## The fix

Shaped like F093's `page_posts` change: the policy is split by role.
`authenticated` keeps byte-for-byte what it had; `anon` additionally requires
`stakeholder_visibility = 'public'`. `community_only` is held back from anon
with `private` — the only value that names a stranger is `public`, so this
fails closed.

## How it was checked

`scripts/probe-anon-members.sh` takes the Supabase URL and publishable key out
of the JavaScript `www.socialus.org` serves and counts what an anonymous
caller gets. Run before the migration: **11 readable (private 3,
community_only 0, public 8), exit 1.** `tests/members-anon-rest.test.ts` asks
the same of a local instance over PostgREST: 3 red before, 5 green after.

## What it changes for a signed-out visitor

The "Founded by" line disappears from the 3 of 6 public Pages whose founder is
a real (private) member. Nothing else observed: those members' profile pages
already 404 for anon via `profile_visibility`, and none of them has an
individually-filed item. Latent: an individually-filed item by a non-public
member would 404 signed out, and `venue_hosted_items` would drop it.

## Not decided here (Don's)

Which columns a stranger sees on a public member (`home_location_id` still
reaches anon for them); what the three values mean to a signed-in viewer; how
`stakeholder_visibility` relates to `member_privacy.profile_visibility`, and
that no member can yet set either to public.
