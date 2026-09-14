### T143 — Where a Page appears is resolved, not stored

`resolvePagePlacements(groupId)` (`src/lib/groups/resolve-page-placement.ts`) — a single read-time function, no schema, no migration, no cache. Returns a typed list of placements (`{source, kind, label, lng, lat}`), one element today (the anchor: `kind='point'` for an address, `kind='area'` for a neighbourhood, the latter's label resolved via the existing `place_for_coords` reverse-geocode RPC). The appearance-precedence branch is present and structurally unreachable — `resolveAppearancePlacements` returns `[]` unconditionally, with a comment naming why, so the (not yet scenarioed) appearances ticket extends this function rather than rewriting it. Wired into `resolveShop()` → `ShopPublicPage.tsx` as a new "where you are now" line, visible to every viewer.

**One real gap fixed forward into T142:** the geocoder's resolved address text was computed for the composer's confirmation UI and never persisted — T143 needed it and it didn't exist. Added to the existing, previously-unused `locations.description` column (no migration — the column was already there).

**One architectural note, not a defect:** `resolvePagePlacements` uses the action-layer pg pool (raw `st_x`/`st_y` SQL) inside an otherwise Supabase-client-shaped resolver, because PostgREST doesn't expose geography-column math and a SQL-side RPC would have needed a migration this ticket's scope rules out. No access-control change results — `locations` already has public-read RLS.

**The return-type contract is tested, not just the runtime value:** a `@ts-expect-error` line asserts that destructuring the result as a single object (rather than iterating the list) fails to type-check — confirmed via `tsc --noEmit` that the suppression is genuine, not a no-op.

Tests: 10 new (the resolver's three shape cases + the contract assertion, `resolveShop`'s placement pass-through, `ShopPublicPage`'s render/non-render of the new line) plus 2 extending T142's action test for the `description` persistence. Full suite: same 2 pre-existing failing files as before (known signup red + ci-tooling timeouts) — no new regressions. tsc/eslint/action-layer clean.

**Deploy is not complete at merge.** No migration this ticket — nothing new to apply to production.
