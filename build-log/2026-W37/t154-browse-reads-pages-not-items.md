### T154 (#51) — Browse reads Pages, not Items

`public.browse_pages(p_place_id, p_category, p_limit)` plus `getBrowsePages`. Pages whose anchor Location falls inside a Place, most recently updated first, optionally filtered to one category. Projects identity, category, description for free-text search, and the anchor geography for map pins; the URL prefix stays with T119's batched `attachGroupPrefixes` rather than being duplicated in SQL.

**Not a projection change — a grain change.** T127 widened `locality_feed_items` by three columns. The columns were right; `discoverable_items` is keyed `unique_idx_discoverable_items (item_id)`, one row per Item, and there are no Items. `locality_feed_items` is untouched — the venue surface still needs place-grain Item reads.

**No interest-tag boost, and the absence is tested twice.** Browse is complete and is not ranked by the member's interests (ruled 2026-09-12). The function takes no `p_tags` and the helper's call shape has no such key — asserted in both layers, so adding one quietly would have to edit a test that names the ruling.

**The predicate is the browse policy; RLS is the access boundary.** `groups_select_active_or_own_draft` admits a founder's own draft — correct for their own Page view, wrong for a public index where a draft must not appear even to its author. So the function carries `active` + `listed` + not-dissolved itself.

**One test was passing vacuously and was caught before the PR, not after.** "Runs and returns rows shaped as declared" iterated zero rows, because `groups` is empty on a fresh local database — precisely the shape T150 exists to remove. Replaced with a behaviour suite that seeds four Pages (live, draft, unlisted, dissolved) inside a transaction, asserts what comes back, and rolls back. **It writes, so it takes T151's write-safe gate**, unlike the read-only introspection suite beside it. Confirmed afterwards that `groups` and `locations` are both back to zero.

**A bad point loses its pin, never the Page.** A decode failure on one geography returns null lon/lat rather than throwing — letting it throw turns one malformed row into an empty browse surface, a worse answer to "what is near me" than a result with no pin.

**Posts are absent by necessity, not design.** Browse indexes them too, flat (ruled 2026-09-12), but `page_posts` does not exist. That source is its own migration once the post mechanism lands. **#51 stays open for it.**

Verified: `local Postgres` — the migration applies via `supabase db push --local`, and both DB suites run green against it (9 introspection, 5 behaviour). `scripts/check-migration-drift.sh` needs a linked remote project and cannot run from this worktree; CI runs it on the PR. Tests: 24 new. Full suite: **133 files, 1577 tests, all passing, nothing skipped.** tsc/eslint at baseline.

**Deploy is not complete at merge.** This ticket adds a migration; it reaches production through the migrations workflow on merge to main.
