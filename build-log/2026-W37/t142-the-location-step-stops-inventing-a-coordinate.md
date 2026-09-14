### T142 — The location step stops inventing a coordinate

A shared `<LocationPlaceFields>` component (address combobox via the existing forward geocoder, or a "rather give a neighbourhood?" toggle into a real `<select>` of `places` rows) now lives inside the "Add a new Location" drawer in the Sell walkthrough, the Product composer, and the Service composer. `sellCreateLocationAction`'s hard-coded downtown-Sacramento fallback point is deleted — its input is now a compile-time-enforced discriminated union (`{address}` or `{neighborhoodId}`, never neither), backed by a runtime refusal for any caller that bypasses the type. Neighbourhood mode derives a deterministic point via `deriveInteriorPoint` (`src/lib/geo/interior-point.ts`, a small FNV-1a hash), drawn toward the polygon's interior so five hand-drawn-rectangle neighbourhood outlines don't drop a Page in the river.

**Gathering composer was not touched** — confirmed in code it has no location-creation step at all (Location pre-attached via a prop). The ticket's "four composers" framing was wrong; only three composers create Locations inline. Flagged in DEVIATIONS as Type A.

**Two real gaps logged, not silently dropped:** the non-business-Page "neighbourhood only" branch has no composer to attach to yet (T139's `/you/create` collects no address at all) — decision stub filed. The address combobox's keyboard pattern is Tab-reachable but not the full ARIA 1.2 pattern (no arrow-key nav / `aria-activedescendant`) — decision stub filed, alongside an unmeasured contrast check (no browser in this session).

**M2 found and fixed one real bug:** the debounced geocoder call had no cancellation on unmount. **M3 found and fixed one gap:** suggestion buttons and toggle links were under the 44px touch-target minimum.

Tests: 20 new (interior-point math, the action's address/neighbourhood/refusal paths, `<LocationPlaceFields>` in isolation, plus new flows added to all three composers' existing suites — including updating `SellWalkthrough.test.tsx`'s one test that exercised the now-dead label-only save path). Full suite: same 2 pre-existing failing files as before T120/T141 (known signup red + ci-tooling timeouts) — no new regressions. tsc/eslint/action-layer clean.

**Deploy is not complete at merge.** No migration this ticket (M4 confirmed N/A) — nothing new to apply to production.
