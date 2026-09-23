-- bug #205 — the place onboarding depends on comes from a migration, not a seed.
--
-- THE DEFECT, PLAINLY. `src/app/onboarding/actions.ts` writes
-- DEFAULT_HOME_PLACE_ID = '10000000-0000-4000-8000-000000000003' as every new
-- Member's primary_home. That row was created only by
-- `supabase/seeds/the-good-place.sql`. `member_place_interests.place_id` is a
-- foreign key, so on any database that has run migrations and NOT that seed —
-- which is what `supabase db reset` without seeding gives you, and what a
-- fresh clone on a second machine gives you — completing onboarding fails with
-- an FK violation. Production happens to have the row, so nothing was visibly
-- wrong there; a clean development database could not onboard a Member at all.
--
-- Code may depend on a migration. Code may not depend on a seed. That is the
-- whole of what this fixes.
--
-- WHAT THIS IS NOT. It is not a ruling that a fictional default home is the
-- right product answer — that is the other half of #205 and it is Don's
-- (item 7 on his list, alongside whether a Member picks their own home place).
-- This makes the current behaviour work everywhere it is supposed to work. It
-- does not make it correct, and the row it creates still says `fictional:true`
-- because it still is.
--
-- ON CONFLICT DO NOTHING, NOT DO UPDATE, DELIBERATELY.
-- The seed keeps `do update` and stays the owner of this content: it is where
-- the demo data is curated and where a change to it belongs. This migration
-- only asserts the row EXISTS, so re-running the seed after it still
-- reconciles, and applying this to production — which already has all three
-- rows, verified against its own REST endpoint — changes nothing.
--
-- ONE STATEMENT PER TIER. `places_set_ancestor_state_id` is a BEFORE trigger
-- that SELECTs the parent row, and a row inserted earlier in the SAME
-- multi-row INSERT is not reliably visible to it. Migration 017 and the seed
-- both split for this reason; this is not a style choice.
--
-- ONLY THE CHAIN THE CODE NEEDS: state -> county -> city. The three
-- neighbourhoods under it are demo content, not a code dependency, and they
-- stay in the seed where they belong.

-- Tier 1 — state.
insert into public.places (id, parent_id, slug, display_name, kind, iso_country_code, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000001', null,
   'tgp', 'The Good Place', 'state', 'US', null,
   ST_GeomFromText('MULTIPOLYGON(((-122.05 39.12, -121.70 39.12, -121.70 39.40, -122.05 39.40, -122.05 39.12)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do nothing;

-- Tier 2 — county.
insert into public.places (id, parent_id, slug, display_name, kind, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'good-county', 'Good County', 'county', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-122.00 39.15, -121.75 39.15, -121.75 39.37, -122.00 39.37, -122.00 39.15)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do nothing;

-- Tier 3 — the city, and the one the code actually names.
insert into public.places (id, parent_id, slug, display_name, kind, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   'the-good-place', 'The Good Place', 'city', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-121.95 39.20, -121.80 39.20, -121.80 39.32, -121.95 39.32, -121.95 39.20)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do nothing;

-- Derived centroid, same rule as migration 026 and the seed: the polygon stays
-- source of truth. `resolve_home_metro` reads the centroid, so without this the
-- rows exist and the Member's home metro resolves to nothing.
-- Scoped to rows that have no centroid yet, so this cannot disturb production.
update public.places p
   set centroid = case
         when ST_Contains(p.geography::geometry, ST_Centroid(p.geography::geometry))
           then ST_Centroid(p.geography::geometry)::geography
         else ST_PointOnSurface(p.geography::geometry)::geography
       end
 where p.id in (
   '10000000-0000-4000-8000-000000000001',
   '10000000-0000-4000-8000-000000000002',
   '10000000-0000-4000-8000-000000000003'
 )
   and p.centroid is null
   and p.geography is not null;
