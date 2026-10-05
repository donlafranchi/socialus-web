# change #347 — boundary data for the Sacramento MSA

- Migration `20261004100000_boundaries`: a `boundaries` table (layer, source id, name, simplified polygon, pin, county, MSA, source, source URL, licence, vintage), readable by anyone and written only by the loader. `places.boundary_id` links a synced place back to its source.
- `scripts/boundaries/load.ts <metro>`, configured in `metros.ts`, loads:
  - Census TIGER/Line 2025 counties, places (incorporated and CDP) and tracts;
  - City of Sacramento and West Sacramento neighbourhoods.
  It then syncs counties, cities and neighbourhoods into `places`, updating existing rows in place, and retires hand-drawn shapes nothing replaced (soft-deleted, so Locations keep their breadcrumbs). Tracts stay in `boundaries`, so `place_for_coords` breadcrumbs don't change.
- Locally: 4 counties, 88 cities and places, 563 tracts, 165 neighbourhoods. Re-runs give the same counts and remove anything a source dropped.
- The "Boundaries" workflow runs it against production, after the migration is applied.
- tests/boundaries-db.test.ts: anyone reads, no one but the loader writes (seen failing with an open update policy), every pin is inside its shape.
