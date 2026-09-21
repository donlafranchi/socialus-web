### bug #175 — A Page a member created now has an address

**The reported symptom was a dead card. The cause was that a Page's address was derived from a column nothing populates.**

`group_url_prefixes` builds a Page's URL from `locations.place_id`. That column was added by T075 with a comment saying its population would land in a later ticket, and the ticket never landed — the only `insert into public.locations` in the tree writes six columns and not that one. Every seeded Page sets it, so every local run and every demo looked right, and only the Pages made through the running app were dead. `getOwnPages` handed back `href: null`, `TileCard` rendered a card with no link inside it, and **the owner bar — Edit, Announce, the entire creator surface — lives on the Page**, so an unreachable Page is an unreachable creator surface.

**The fix is not to populate that column.** Don ruled the address itself on 2026-09-21 (`ops-pattern planning/URL-IDENTITY.md`), on two constraints of his own: *"addresses/locations will evolve … right now we're using metros but one day may use neighborhoods"*, and *"I'm concerned about a URL being downstream of a member. I want to keep members safe from people with bad intentions."* A place path in a canonical address violates the first by construction.

**A Page's canonical URL is now `/g/<slug>-<id>`** — a cosmetic slug and a six-character Crockford base32 id, minted per row from pgcrypto's CSPRNG and never derived from a member id, a group id, a timestamp or a sequence. The id resolves; the slug is read for display and ignored on lookup, so a Page can be renamed without breaking a link anybody already sent. **No geography in the address, and no member derivable from it.**

**One address, and every other shape redirects.** `/p/<place>/g/<slug>` was rendering Pages inline, which is why `/p/ca/sacramento/g/mayas-bakery` and `/p/ny/albany/g/mayas-bakery` were both live and neither was canonical — the place segments were peeled off and never validated. The place path is an index now: it resolves the Page and `permanentRedirect`s to the canonical address. So does a stale slug, and so does an address typed in upper case.

**One ambiguity in the scheme, found by a test and left visible rather than papered over.** `mayas-bakery` splits as slug `mayas` plus id `bakery`, because `bakery` is six characters and all of them are in the alphabet. No parser can tell that from a real handle. `resolvePageByHandle` therefore tries the id and falls back to the whole handle as a slug — which is also what carries every address shared before this shipped.

**The edit surface moved with it,** from `/manage/<slug>` to `/g/<slug>-<id>/edit`. It was a parallel top-level route only because the old address lived under a catch-all and Next.js refuses a static segment after one. `/manage/<slug>` is kept as a redirect.

**`browse_feed`'s `place_path` is untouched** — breadcrumbs and place scoping still want it, and populating `locations.place_id` for those is #180, not this. Browse's card href now comes from one primary-key read of `groups.public_id` rather than from the null that made every card dead.

**`groups.slug` stays globally unique for now.** The ruling says uniqueness on a cosmetic field should be dropped, and it should — but the slug-shaped redirect needs it to be unambiguous for as long as anybody's links point at one. Said out loud in the migration rather than left as a TODO.

Tests: 37 new (the handle parser including the Crockford folds and the ambiguity above; the resolver's redirect rules; the migration's shape and its generator's distribution against a real database — 32 distinct characters, 2000 ids with no collision, uniform within ±8σ). Full suite green against local Postgres: 2311 passed, 0 failed. `tsc`, `eslint`, `check:action-layer` and `next build` all clean.

**Deploy is not complete at merge — this carries a migration.** `20260921200710_page_public_id.sql` adds `groups.public_id` with a backfill, a unique index, a default and a shape CHECK. It must be applied before the deploy serves a request.
