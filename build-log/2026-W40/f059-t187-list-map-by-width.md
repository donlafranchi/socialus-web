### F059 · T187 (#278) — Explore's list and map by screen width

F059 criterion 5, restated 2026-10-01 (Don chose option A; Airbnb's pattern). The inline List/Map toggle that sat between rows of cards is gone.

- **Under 1024px:** a floating pill at bottom centre, above the phone nav and the safe area, naming the view it switches to ("Map" over the list, "List" over the map).
- **1024px and up:** list and map side by side; the map column is sticky under the search row. A handle on the divider hides and restores the map.
- **1024–1439px with the owner panel open:** the map collapses and the List | Map tablist docks in the search row. Nothing opens an owner panel on Explore yet, so this is behind a prop (open question on the prop).
- **Signed out:** unchanged — no pins.
- **Map without a token:** BrowseMap renders a placeholder instead of letting Mapbox throw, since the map now mounts on every desktop load.

Tests: `BrowseSurface.layout.test.tsx` (8, all seen failing first) and `BrowseMap.test.tsx` (seen failing first); eval `F059-explore-list-and-map-by-width.spec.ts` (2, seen failing against the old Explore). Both marked `[guards F059.5 partial]`.
