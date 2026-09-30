### F093 · T173 (#252) — the signed-out front door

F093 criterion 8, amended 2026-09-30 (ops-pattern #45, Don approved). A signed-out visitor sees a Page's name, default photo, description and the withheld card, "Sign up to see what's happening". There is no location, tags or founder. The Page keeps its location for metro scoping and the map; tags show signed in only.

- **Direct reads:** `anon` loses `locations` (every column), `groups.anchor_location_id`, `page_tags` and `tags`. The location detail tables' public reads, and the tag reads, are for `authenticated`.
- **Explore:** `browse_feed` runs as its owner, with the RLS it relied on written out: posts go to signed-in callers only, and Pages must be listed and active, as before. Signed out, a Page row carries no location id, label or tags. A tag filter is ignored, since filtering would reveal tags. The pin is the Page's Place centroid, never its stored point (open question on #252).
- **`group_url_prefixes`:** runs as its owner, over the Pages the caller could see.
- **Page view:** `resolveShop` asks for the anchor on its own, as the caller. Signed out it is refused, so the address, and the local-owner badge that is derived from it, are not resolved.
- **Item pages:** an item's location label is read on its own (`itemLocationLabel`), so a signed-out item page resolves without one instead of failing.
- **Card:** the ask comes from `COPY.withheldCta`.
- **Not reachable signed out now:** a venue page (`/p/…/l/<slug>`), which is a location, returns not found.

Tests: `tests/front-door-db.test.ts` (`[guards F093.8 partial]`), 10 against Postgres 17.6.1.166 built from every migration; 4 seen failing before this migration. The unit tests for the anchor probe, item locations and the card's wording were seen failing first. Explore's own suite now reads as a signed-in caller.

**Migration: `20260930210000_front_door_signed_out.sql`.** Apply after #254 merges and after ops-pattern #45 merges.
