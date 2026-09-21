# Browse renders Pages

*2026-09-21. F059 · T156 · #53. The query shipped on 2026-09-19 and nothing
called it. This is the caller.*

## What was actually wrong

`public.browse_feed` was live in production **with no caller at all**. Browse
was still a client component reading `discoverable_items` — the Item-grain
view — through `createBrowserClient`, and four tested helpers
(`resolveFollowedPageIds`, `getBrowseFeed`, `resolveFeedMetro`,
`listFeedMetros`) had no non-test callers between them. The work was wiring,
not building, and the temptation worth naming is rebuilding what already
existed.

## Server-side is the prerequisite, not a refactor

F059 criterion 2c says the signed-in half is **withheld server-side, never
rendered and hidden**. While Browse fetched its own rows in the browser that
was not a property anyone could add later — every row the surface held had
already been shipped to the reader. Moving the read to the server component is
what makes withholding verifiable at all.

The seam is `src/app/explore/load.ts`: it resolves auth, the member's derived
home metro, the active metro and the rows, and hands the client body results +
auth state + metro list. Everything under `@/lib/browse` stays a pure function
of the rows it is given, which is why those modules test without a database.

## This ships the public half only

`audience` stays `public`. Announcements from Pages a person follows (criterion
2b) is **its own ticket after this one**, deliberately, so Don judges one PR at
a time. `getBrowseFeed` already takes the follow set and the SQL already
withholds on it; the only missing piece is a caller passing it. Nothing here
changes shape when it lands.

## The pill row is gone, and nothing replaced it

Ruled 2026-09-12: zero filter pills outside the filter view, at every viewport
width. `KindFilterPills` and `ActiveFilterChips` are deleted, not relocated.
Free-text search stays on the results surface, because search is for finding
something specific and a lens is for being shown something.

**What replaces the pill row is deliberately not decided here.** Curated lenses
(criterion 4) are a research pass that has not landed, and picking a shape in a
build ticket would answer by implementation a question recorded as open.

## What went, and why each one could not stay

- **Sort.** Ordering is the server's. A client control re-sorting the fetched
  page would re-order a subset and present it as the order.
- **Distance.** It measured from a locality centroid Browse no longer resolves.
  "Within 1 mile of the metro centroid" is a coordinate, not a neighbourhood —
  and hood-band ranking inside the metro is explicitly *Not this* in F059.
- **'Recurring'.** It read `fetchRecurringGatheringIds`, which is Item-grain.
- **`src/lib/explore/items.ts`.** The `discoverable_items` reader lost its last
  consumer with `ExplorePage`. Deleting it is the honest bookkeeping of "there
  are no Items", not extra scope.

## Pin grouping is new work

Under the Page model a Page appears at its own location *and* each post at the
post's own address, so **one Page can produce several pins** — and several rows
at one address must still produce one. The key is the Page **plus** the place;
keying on the Page alone would drop a market's Saturday stall at a different
address, which is the thing someone opens the map to find. Rows with no point
are dropped rather than pinned at a fallback coordinate.

## Two spec lines in #53 that no longer describe the repo

- **`src/lib/groups/page-categories.ts` does not exist.** `PAGE_CATEGORIES` and
  its twelve fixed terms were retired by T159 (#64, ruled 2026-09-13) —
  creators make their own tags. The filter vocabulary is tags, from the result
  set, normalised through `normalizeTag`.
- **`/?place=<metro-slug>`** is from the rescinded merge. #53 itself says build
  in place at `/explore`, so the metro rides `?metro=` on `/explore`.

## One accepted deviation, named rather than laundered

`ExploreSearchBar` is `sticky top-0`, against `design-language.md` principle 8
("no top-anchored toolbars or search fields"). Accepted for one release; the
follow-on chrome scenario is the remedy. An accepted deviation and an
unnoticed one look identical in git and completely different in an audit.

## M3 — what the accessibility pass changed

Two findings, both inherited from the surface this replaces rather than
introduced here, and both now asserted by tests so a later port cannot undo
them quietly:

- **`--color-accent` is #0fab8e — 2.9:1 on white.** Short of AA at any text
  size, and the old empty state used it for "Clear filters". Those controls are
  charcoal-900 (14.16:1) now, the same resolution the filter sheet's "Clear
  all" already took. The token's on-white contrast is an app-wide question and
  this surface does not settle it.
- **Bare text buttons were under the target floor.** `min-h-11` on every one.

One deviation stands, ruled by #53 rather than chosen here: the view tablist
carries `aria-controls` pointing at a `role="region"`, not a `tabpanel`. #53
requires the container be a region; a `tab` controlling a non-`tabpanel` is
irregular ARIA. Recorded, not laundered.

## Checks

`tsc` clean · conformance clean · `next build` passes · 19 surface tests plus
44 across the browse lib, including that filtering never re-sorts, that a slow
earlier metro response cannot overwrite a newer one, and that the distance,
sort and kind controls are **absent** rather than merely untested.
