### change #329 + #330 + #328 + #476 — Explore remembers the metro, opens on it, one bottom control, neighbourhood search

- **Pill never blank (#329).** `placePillLabel` names the metro whether picked or defaulted (PM, 2026-10-07). A pick via the pill is remembered: device cookie `su_metro` for anyone, `members.default_metro_id` when signed in. Scope precedence: `?metro=` → remembered slug (signed out only) → member default → zip-derived → platform default.
- **Default metro on You (#330).** Metro row on `/you` is now a select of open metros (`DefaultMetro`); it replaces the read-only waitlist-metro row. **Migration `20261007170000_member_default_metro.sql`** adds `members.default_metro_id`. Not applied by this lane.
- **Map opens on the metro (#330).** `FeedMetro.center` decodes `metro_polygons.centroid`; `BrowseMap` starts there, re-centres when the metro changes with nothing pinned, never on the US middle. Signed-out fallback: the default metro (Sacramento), the one metro running.
- **Bottom control (#328).** `ExploreDock` replaces `ViewPill` under 1024px: one button bottom-right, opens to search / filter / metro / list-map, shrinks after a choice. The metro pill stays at the top.
- **Neighbourhood search (#476).** Explore had none (metro picker only). `AreaPicker` searches neighbourhoods as you type (reusing #413's `searchNeighborhoods`); `?area=<placeId>` scopes the feed, happening rows, withheld cards and map to that place. Only Sacramento's boundaries are loaded, so only it has a list (`METRO_MSA`).
- **Not built:** #475 (area markers) waits on the PM's A/B/C.
