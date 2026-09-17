# fix — a member can see the Pages they made

**Kind:** bug. **Scenario:** none.

## The bug

Don created "SacRiver Floaters" and "Stare at the stars" on 2026-09-16. Both are
`lifecycle_state=active`, `discoverability=listed`, with a real
`anchor_location_id` — verified in production. He could see neither, anywhere.

**Not a regression, and not data.** No surface has ever listed a member's own
Pages. `SellCta` calls `getDraftGroup`, which finds a **draft** to resume; an
active Page falls straight through it and is never mentioned again. The vendor
tabs that used to occupy `/you` read tables that never existed, so nothing was
lost when they went — there was simply never anything there.

Geometry was ruled out separately: four Place polygons contain his anchor
location, so `browse_pages`' `st_intersects` join has plenty to match.

## The fix

`src/lib/member/own-pages.ts` — `getOwnPages(supabase, memberId)`, reading
`founder_member_id`. Rendered at `/you` under **Your Pages**, using `CardGrid` +
`TileCard` rather than a new card, so it reflows and holds uniform height for
free.

Three decisions worth stating:

- **Drafts are included.** RLS already admits a founder's own draft, and a
  half-finished Page vanishing until published is the same bug again. Each card
  says which it is — a draft and a live Page look identical otherwise, and that
  difference is the whole question its author is asking.
- **A draft gets no link.** Its public URL 404s for its own author, which is a
  worse answer than no link.
- **Scale comes from `locations.kind`**, not a guess: `area` → neighbourhood,
  otherwise address.

## A new location value, and it is not the ratified ladder

`none` — "No location yet". A Page with no anchor is a real draft state, and it
is a **different fact** from `online`: online is a deliberate answer that a
thing has no physical place, and saying it about a half-finished draft would be
a claim its author never made. It sorts last, after the ratified
`address → neighbourhood → metro → wider → online`, appears on this one surface,
and never gets a map pin. Flagged for Don rather than slipped in.

## Verification

16 tests. `tsc` clean · lint 0 errors · build succeeds.

**Not verified against production data** — the query shape is tested with a
mocked client; whether his two rows come back is what the deploy will show.
