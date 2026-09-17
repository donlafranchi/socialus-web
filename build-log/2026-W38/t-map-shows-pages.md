# the map shows Pages

**Kind:** bug/chore. **Closes:** the map half of #94's fallout.
**Ruling:** `ops-pattern/DECISIONS.md` 2026-09-16 — vendors retired, controls
belong to the Page kind.

## What was wrong

`useMapBusinesses` queried `.from('businesses')`. **That table does not exist
and never did** (#94). PostgREST returned an error, the hook discarded it
silently, `setBusinesses` was never called, and the map rendered an empty
basemap — indistinguishable from "no Pages near you". The map has never shown
anything.

## What it does now

`useMapPages` reads `groups` joined to `locations` through
`anchor_location_id`, filtered to `lifecycle_state = 'active'` and
`discoverability = 'listed'` — the read path does not lean on RLS alone to hide
a draft. `locations.geography` comes back as EWKB and is decoded with the same
`decodeEwkbPoint` browse already uses; a point that will not decode loses its
pin, never the map.

**Bounds are applied client-side.** `geography` is a PostGIS column and
PostgREST cannot express a bbox filter over one without an RPC — which is a
migration. A working map today beats a better query next week; the 500-row cap
is what keeps that honest, and the RPC is the upgrade path when it bites.

A Page's canonical URL is `/p/[…place]/g/[slug]`, so the place path is resolved
separately through `fetchGroupPrefixes`. A failure there costs the link, not the
pin.

## Controls belong to the kind

`src/lib/groups/kind-controls.ts` answers one question in one place: what does
this Page kind carry. `business`, `place` and `event_anchored` have premises, so
they have an address and appear on the map; `interest`, `practice` and `family`
have neither — an address control on an interest group invites a home address
onto a public map.

The map asks that module rather than deciding for itself. **This is the smallest
honest expression of the ruling, not the whole of it** — making every control
kind-owned is a design change across the composer, and this does not pretend to
be it.

Unknown kinds withhold the pin. A kind added to the schema and not to that table
must not reach a public map by default: the failure of omission should be
invisibility, not exposure.

## Gone

`BusinessDetailCard` (ownership tier, the `supports` table, `/business/[slug]`
— all vendor-era) is replaced by `PageDetailCard`: photo, name, category,
location, and a link to the Page. `useMapBusinesses` is deleted.

Pins were coloured by ownership tier. One colour for every Page now; colouring
by kind is a `design-language.md` call, not a rewire's.

## #119 stays at three

Tested directly: removing the `Map.tsx` suppression still fails
`react-hooks/immutability` — it is the `updateMarkers` hoisting, which the
rewire does not touch. The line moved (115 → 111); the finding did not.

## Verification

`tsc` clean · lint 0 errors (31 warnings, two new ones from the rewire, none an
error) · build succeeds · full suite 1959 passed with 13 failures, all the
local-DB "cannot run" gate.

**Not verified: that a pin actually appears.** That needs `DATABASE_URL` set and
at least one active, listed Page with an anchor location — neither of which
exists yet. The query shape is tested; the round trip is not.
