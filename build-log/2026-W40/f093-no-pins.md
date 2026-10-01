### F093 (#252) — signed out, no map pins at all

Don, 2026-09-30, answering #252: no pins for signed-out visitors. #255's migration carried that, but #258's `20260930220000` recreated `browse_feed` and ran in production a minute before the change reached it, so production gave signed-out callers a pin at each Page's neighbourhood (3 of 6 Pages on 2026-09-30).

`20260930230000_front_door_no_pins.sql` replaces the function in place: same arguments and return type, so grants and comment stay. Signed out, `location_geography` is null. The stored location still scopes the Page to the metro.

Tests: `tests/front-door-db.test.ts` "puts no pin on the map" fails on #258's tree (production's state) and passes with this migration.
