-- ─────────────────────────────────────────────────────────────────────────
-- "The Good Place" — public showcase seed.
--
-- A wholly fictional locality, populated end-to-end across every b1 primitive
-- so the platform can be demonstrated (and built against) without waiting for
-- real members. Everything here is fake and is meant to be publicly visible.
--
-- WHAT IT CREATES
--   places      6   state → county → city → 3 neighborhoods  (URL: /p/tgp/the-good-place)
--   members     8   bakers, a mechanic, a potter, a gardener, a tutor, organizers
--   locations   4   a Saturday market, a commons, a community kitchen, a library
--   groups      3   business Shop + interest Circle + event-anchored club
--   items      16   4 products · 4 services · 3 gatherings · 2 wonders
--                   · 1 offer · 1 ask · 1 initiative
--   plus memberships, item↔venue attachments, tags, hashtags, responses,
--   place interests, follows, a self-attested local-owner claim, and the
--   append-only event-log rows for each entity.
--
-- IDEMPOTENT. Every row carries a hard-coded UUID and upserts. Re-running is
-- safe and refreshes the gathering dates so the demo calendar stays in the
-- future.
--
-- HOW TO RUN
--   Supabase SQL Editor (runs as `postgres`), or:
--     psql "$SUPABASE_DB_URL" -f supabase/seeds/the-good-place.sql
--   Requires the owner role — it toggles two triggers we own (see below).
--
-- TWO TRIGGERS ARE TOGGLED, BOTH OURS, BOTH RE-ENABLED BEFORE COMMIT
--   1. public.members.members_assert_id_in_auth_users (T047 / ADR-15)
--      Real Members exist only downstream of an auth.users row. Showcase
--      Members deliberately have NO auth.users row: nobody can log in as
--      them, they never appear in the Auth dashboard, and they cost nothing
--      in MAU. That means the invariant must stand down for this insert.
--      NOTE: the ALTER takes an ACCESS EXCLUSIVE lock on public.members for
--      the length of the transaction (sub-second at this row count).
--   2. public.item_events.trg_refresh_discoverable_items (T057)
--      It runs REFRESH MATERIALIZED VIEW CONCURRENTLY, which cannot execute
--      inside a transaction block. The seed refreshes the view itself, using
--      the plain (non-concurrent) form, just before COMMIT.
--
-- IDENTIFYING THE DEMO DATA
--   Every row with a jsonb column carries {"demo_seed": "the-good-place"} in
--   metadata / ambient_extras. UUID prefixes are reserved per entity:
--     places 1000…  members 2000…  locations 3000…  groups 4000…  items a00000…
--   A teardown block is at the bottom of this file, commented out.
-- ─────────────────────────────────────────────────────────────────────────

begin;

alter table public.members     disable trigger members_assert_id_in_auth_users;
alter table public.item_events disable trigger trg_refresh_discoverable_items;

-- Event-log partitions for the current month (idempotent no-ops if present).
select public.rotate_place_events_partitions();
select public.rotate_member_events_partitions();
select public.rotate_location_events_partitions();
select public.rotate_group_events_partitions();
select public.rotate_item_events_partitions();


------------------------------------------------------------
-- 1. Places
--
-- A self-contained fictional tree so nothing pollutes the real California
-- hierarchy. Its polygons sit in an empty pocket of the northern Sacramento
-- Valley (lon -122.05…-121.70, lat 39.12…39.40) — disjoint from every
-- polygon seeded by migration 026, so the reverse-geocoder can never
-- confuse a real Sacramento coordinate for a demo one.
--
-- URL shape (county is skipped when a city of the same state matches):
--   /p/tgp                             The Good Place (state)
--   /p/tgp/the-good-place              The Good Place (city)
--   /p/tgp/the-good-place/market-square
------------------------------------------------------------

-- Inserted one tier at a time. The places_set_ancestor_state_id BEFORE trigger
-- SELECTs the parent row, and a row inserted earlier in the SAME multi-row
-- INSERT is not reliably visible to it — migration 017 splits its seed for the
-- same reason. One statement per tier keeps the parent walk correct.

insert into public.places (id, parent_id, slug, display_name, kind, iso_country_code, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000001', null,
   'tgp', 'The Good Place', 'state', 'US', null,
   ST_GeomFromText('MULTIPOLYGON(((-122.05 39.12, -121.70 39.12, -121.70 39.40, -122.05 39.40, -122.05 39.12)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do update set
  parent_id = excluded.parent_id, slug = excluded.slug, display_name = excluded.display_name,
  kind = excluded.kind, iso_country_code = excluded.iso_country_code, msa_code = excluded.msa_code,
  geography = excluded.geography, metadata = excluded.metadata, deleted_at = null;

insert into public.places (id, parent_id, slug, display_name, kind, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
   'good-county', 'Good County', 'county', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-122.00 39.15, -121.75 39.15, -121.75 39.37, -122.00 39.37, -122.00 39.15)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do update set
  parent_id = excluded.parent_id, slug = excluded.slug, display_name = excluded.display_name,
  kind = excluded.kind, msa_code = excluded.msa_code, geography = excluded.geography,
  metadata = excluded.metadata, deleted_at = null;

insert into public.places (id, parent_id, slug, display_name, kind, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002',
   'the-good-place', 'The Good Place', 'city', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-121.95 39.20, -121.80 39.20, -121.80 39.32, -121.95 39.32, -121.95 39.20)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do update set
  parent_id = excluded.parent_id, slug = excluded.slug, display_name = excluded.display_name,
  kind = excluded.kind, msa_code = excluded.msa_code, geography = excluded.geography,
  metadata = excluded.metadata, deleted_at = null;

insert into public.places (id, parent_id, slug, display_name, kind, msa_code, geography, metadata)
values
  ('10000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000003',
   'market-square', 'Market Square', 'neighborhood', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-121.930 39.240, -121.900 39.240, -121.900 39.270, -121.930 39.270, -121.930 39.240)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb),
  ('10000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000003',
   'pond-side', 'Pond Side', 'neighborhood', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-121.900 39.240, -121.870 39.240, -121.870 39.270, -121.900 39.270, -121.900 39.240)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb),
  ('10000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000003',
   'orchard-hill', 'Orchard Hill', 'neighborhood', '99999',
   ST_GeomFromText('MULTIPOLYGON(((-121.870 39.240, -121.830 39.240, -121.830 39.280, -121.870 39.280, -121.870 39.240)))', 4326)::geography,
   '{"demo_seed":"the-good-place","fictional":true}'::jsonb)
on conflict (id) do update set
  parent_id = excluded.parent_id, slug = excluded.slug, display_name = excluded.display_name,
  kind = excluded.kind, msa_code = excluded.msa_code, geography = excluded.geography,
  metadata = excluded.metadata, deleted_at = null;

-- Derived centroid (migration 026 keeps polygon as source of truth).
update public.places p
   set centroid = case
         when ST_Contains(p.geography::geometry, ST_Centroid(p.geography::geometry))
           then ST_Centroid(p.geography::geometry)::geography
         else ST_PointOnSurface(p.geography::geometry)::geography
       end
 where p.metadata->>'demo_seed' = 'the-good-place';


------------------------------------------------------------
-- 2. Members
--
-- Eight people who between them exercise every role the platform models:
-- a Shop founder/owner, a Circle steward, item hosts, and plain responders.
-- No auth.users rows — see the header. Bios end with a demo marker so the
-- data is never mistaken for a real neighbour.
------------------------------------------------------------

insert into public.members (id, handle, display_name, bio, pronouns, stakeholder_visibility, login_disabled)
values
  ('20000000-0000-4000-8000-000000000001', 'maya-okonkwo',    'Maya Okonkwo',
   'Baking out of the Orchard Hill community kitchen four days a week. Long ferment, local grain. — showcase profile in The Good Place',
   'she/her', 'public', false),
  ('20000000-0000-4000-8000-000000000002', 'theo-brandt',     'Theo Brandt',
   'Bike mechanic. I set up a stand at the Saturday market and fix whatever rolls up. — showcase profile in The Good Place',
   'he/him', 'public', false),
  ('20000000-0000-4000-8000-000000000003', 'rosa-delgado',    'Rosa Delgado',
   'I convene things. Market on Saturdays, Repair Cafe once a month, and whatever else needs a person to say when and where. — showcase profile in The Good Place',
   'she/her', 'public', false),
  ('20000000-0000-4000-8000-000000000004', 'sam-whitfield',   'Sam Whitfield',
   'Twelve raised beds and more seedlings than I can use. Take some. — showcase profile in The Good Place',
   'they/them', 'public', false),
  ('20000000-0000-4000-8000-000000000005', 'priya-raman',     'Priya Raman',
   'Potter. Wheel-throwing lessons for absolute beginners, two at a time. — showcase profile in The Good Place',
   'she/her', 'public', false),
  ('20000000-0000-4000-8000-000000000006', 'jonah-kessler',   'Jonah Kessler',
   'Cold brew, one barrel at a time, out of a cart by the pond. — showcase profile in The Good Place',
   'he/him', 'public', false),
  ('20000000-0000-4000-8000-000000000007', 'nadia-halim',     'Nadia Halim',
   'Mostly I ask questions out loud and see who answers. — showcase profile in The Good Place',
   'she/her', 'public', false),
  ('20000000-0000-4000-8000-000000000008', 'casey-lindqvist', 'Casey Lindqvist',
   'Retired teacher. Reading and homework help at the library, no charge for anyone who asks twice. — showcase profile in The Good Place',
   'he/him', 'public', false)
on conflict (id) do update set
  handle                 = excluded.handle,
  display_name           = excluded.display_name,
  bio                    = excluded.bio,
  pronouns               = excluded.pronouns,
  stakeholder_visibility = excluded.stakeholder_visibility,
  deleted_at             = null;

-- The members insert trigger creates default privacy rows; the showcase wants
-- these profiles public AND discoverable so every surface renders fully.
insert into public.member_privacy (member_id, profile_visibility, is_discoverable, show_items_on_profile, locality_precision)
select id, 'public', true, true, 'neighborhood'
  from public.members
 where id::text like '20000000-0000-4000-8000-%'
on conflict (member_id) do update set
  profile_visibility    = excluded.profile_visibility,
  is_discoverable       = excluded.is_discoverable,
  show_items_on_profile = excluded.show_items_on_profile,
  locality_precision    = excluded.locality_precision;

-- Where each Member considers home. Drives the locality feed for signed-in demo use.
insert into public.member_place_interests (member_id, place_id, scope_kind, metadata)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000006', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000006', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000005', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000004', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb),
  ('20000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000005', 'primary_home', '{"demo_seed":"the-good-place"}'::jsonb)
on conflict (member_id, place_id, scope_kind) do update set removed_at = null;

insert into public.member_interests (member_id, tag)
values
  ('20000000-0000-4000-8000-000000000001', 'food'),
  ('20000000-0000-4000-8000-000000000001', 'bakery'),
  ('20000000-0000-4000-8000-000000000002', 'bicycles'),
  ('20000000-0000-4000-8000-000000000002', 'repair'),
  ('20000000-0000-4000-8000-000000000003', 'community'),
  ('20000000-0000-4000-8000-000000000003', 'repair'),
  ('20000000-0000-4000-8000-000000000004', 'gardening'),
  ('20000000-0000-4000-8000-000000000004', 'food'),
  ('20000000-0000-4000-8000-000000000005', 'crafts'),
  ('20000000-0000-4000-8000-000000000006', 'coffee'),
  ('20000000-0000-4000-8000-000000000007', 'community'),
  ('20000000-0000-4000-8000-000000000007', 'sustainability'),
  ('20000000-0000-4000-8000-000000000008', 'education')
on conflict (member_id, tag) do nothing;

insert into public.member_follows (follower_member_id, followed_member_id)
values
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003'),
  ('20000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000004'),
  ('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005')
on conflict (follower_member_id, followed_member_id) do update set unfollowed_at = null;


------------------------------------------------------------
-- 3. Locations (Venues)
--
-- Four venues, all inside the demo neighborhood polygons so the locality feed
-- and the venue distance/proximity paths have something to chew on.
-- place_id is the join zip_is_proximal_to_location() walks for the local-owner
-- badge (locations.place_id → places.msa_code).
------------------------------------------------------------

insert into public.locations
  (id, member_id, kind, label, slug, description, geography, place_id, discoverability, brand_label, ambient_extras)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003',
   'recurring_temporary', 'The Good Market', 'the-good-market',
   'Saturday morning market in the square. Thirty-odd stalls, a coffee cart, and a bike repair stand under the oak.',
   ST_SetSRID(ST_MakePoint(-121.9150, 39.2550), 4326)::geography,
   '10000000-0000-4000-8000-000000000004', 'listed', null,
   '{"demo_seed":"the-good-place"}'::jsonb),

  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
   'permanent', 'Pond Side Commons', 'pond-side-commons',
   'A hall with a kitchen, sixty chairs, and a door that is usually open. Free to book for anything the neighborhood can attend.',
   ST_SetSRID(ST_MakePoint(-121.8850, 39.2550), 4326)::geography,
   '10000000-0000-4000-8000-000000000005', 'listed', null,
   '{"demo_seed":"the-good-place"}'::jsonb),

  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   'permanent', 'Orchard Hill Community Kitchen', 'orchard-hill-kitchen',
   'Shared commercial kitchen. Four ovens, two mixers, a booking sheet on the wall.',
   ST_SetSRID(ST_MakePoint(-121.8500, 39.2600), 4326)::geography,
   '10000000-0000-4000-8000-000000000006', 'listed', 'The Good Loaf',
   '{"demo_seed":"the-good-place"}'::jsonb),

  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000008',
   'permanent', 'The Good Place Library', 'the-good-place-library',
   'Two reading rooms and a study table nobody has ever had to reserve.',
   ST_SetSRID(ST_MakePoint(-121.9200, 39.2480), 4326)::geography,
   '10000000-0000-4000-8000-000000000004', 'listed', null,
   '{"demo_seed":"the-good-place"}'::jsonb)
on conflict (id) do update set
  member_id       = excluded.member_id,
  kind            = excluded.kind,
  label           = excluded.label,
  slug            = excluded.slug,
  description     = excluded.description,
  geography       = excluded.geography,
  place_id        = excluded.place_id,
  discoverability = excluded.discoverability,
  brand_label     = excluded.brand_label,
  ambient_extras  = excluded.ambient_extras,
  deleted_at      = null;

insert into public.location_permanent (location_id, street_address, public_hours, accessibility_notes)
values
  ('30000000-0000-4000-8000-000000000002', '4 Pond Side Lane, The Good Place',
   '{"mon":"9:00-21:00","tue":"9:00-21:00","wed":"9:00-21:00","thu":"9:00-21:00","fri":"9:00-21:00","sat":"8:00-22:00","sun":"10:00-18:00"}'::jsonb,
   'Step-free entry from the lane. Accessible restroom. Hearing loop in the main hall.'),
  ('30000000-0000-4000-8000-000000000003', '210 Orchard Hill Road, The Good Place',
   '{"mon":"5:00-14:00","tue":"5:00-14:00","wed":"5:00-14:00","thu":"5:00-14:00","fri":"5:00-14:00","sat":"5:00-11:00","sun":"closed"}'::jsonb,
   'Step-free loading door at the rear. Counters at 34 inches.'),
  ('30000000-0000-4000-8000-000000000004', '1 Square North, The Good Place',
   '{"tue":"10:00-18:00","wed":"10:00-18:00","thu":"10:00-20:00","fri":"10:00-18:00","sat":"10:00-16:00"}'::jsonb,
   'Ramp at the north entrance. Large-print catalogue at the desk.')
on conflict (location_id) do update set
  street_address      = excluded.street_address,
  public_hours        = excluded.public_hours,
  accessibility_notes = excluded.accessibility_notes;

insert into public.location_recurring_temporary (location_id, recurrence_rule, session_start_time, session_end_time)
values
  ('30000000-0000-4000-8000-000000000001', 'FREQ=WEEKLY;BYDAY=SA', '08:00', '13:00')
on conflict (location_id) do update set
  recurrence_rule    = excluded.recurrence_rule,
  session_start_time = excluded.session_start_time,
  session_end_time   = excluded.session_end_time;


------------------------------------------------------------
-- 4. Groups
--
--   the-good-loaf         kind='business'        Maya's bakery (a "Shop")
--   pond-side-circle      kind='interest'        Rosa stewards (a "Circle")
--   repair-cafe-regulars  kind='event_anchored'  seeded by the Repair Cafe gathering
--
-- seeded_by_item_id is backfilled in section 5 once the Item rows exist.
------------------------------------------------------------

insert into public.groups
  (id, name, slug, kind, anchor_location_id, founder_member_id, description,
   discoverability, lifecycle_state, established_on, metadata)
values
  ('40000000-0000-4000-8000-000000000001', 'The Good Loaf', 'the-good-loaf', 'business',
   '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001',
   'A four-day-a-week bakery run out of the Orchard Hill community kitchen. Bread on Wednesday and Saturday, cakes to order.',
   'listed', 'active', current_date - 400, '{"demo_seed":"the-good-place"}'::jsonb),

  ('40000000-0000-4000-8000-000000000002', 'Pond Side Circle', 'pond-side-circle', 'interest',
   '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
   'Neighbours who look after the commons and decide together what happens in it. Anyone can join; showing up is the only requirement.',
   'listed', 'active', current_date - 620, '{"demo_seed":"the-good-place"}'::jsonb),

  ('40000000-0000-4000-8000-000000000003', 'Repair Cafe Regulars', 'repair-cafe-regulars', 'event_anchored',
   '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003',
   'The people who keep turning up to the monthly Repair Cafe with a soldering iron and a spare afternoon.',
   'listed', 'active', current_date - 240, '{"demo_seed":"the-good-place"}'::jsonb)
on conflict (id) do update set
  name               = excluded.name,
  slug               = excluded.slug,
  kind               = excluded.kind,
  anchor_location_id = excluded.anchor_location_id,
  founder_member_id  = excluded.founder_member_id,
  description        = excluded.description,
  discoverability    = excluded.discoverability,
  lifecycle_state    = excluded.lifecycle_state,
  established_on     = excluded.established_on,
  metadata           = excluded.metadata,
  dissolved_at       = null,
  dormant_at         = null;

insert into public.group_businesses (group_id, display_name, public_description, legal_entity_kind, state_of_formation, formed_at)
values
  ('40000000-0000-4000-8000-000000000001', 'The Good Loaf',
   'Long-ferment sourdough and celebration cakes, baked in the Orchard Hill community kitchen. Find us at the Saturday market or order ahead.',
   'sole_prop', 'TG', current_date - 400)
on conflict (group_id) do update set
  display_name       = excluded.display_name,
  public_description = excluded.public_description,
  legal_entity_kind  = excluded.legal_entity_kind,
  state_of_formation = excluded.state_of_formation,
  formed_at          = excluded.formed_at;

insert into public.group_event_anchored (group_id, seeded_by_item_id)
values ('40000000-0000-4000-8000-000000000003', null)
on conflict (group_id) do nothing;

-- Roles are per-Group verbs, not platform identities: owner / baker / steward /
-- member / host / fixer.
insert into public.group_memberships (group_id, member_id, role, source, joined_at, confirmed_by_member_id, confirmed_at)
values
  -- The Good Loaf
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'owner',   'explicit', now() - interval '400 days', null, now() - interval '400 days'),
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000006', 'baker',   'explicit', now() - interval '120 days', '20000000-0000-4000-8000-000000000001', now() - interval '120 days'),
  -- Pond Side Circle
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000003', 'steward', 'explicit', now() - interval '620 days', null, now() - interval '620 days'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', 'member',  'explicit', now() - interval '300 days', '20000000-0000-4000-8000-000000000003', now() - interval '300 days'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000004', 'member',  'explicit', now() - interval '280 days', '20000000-0000-4000-8000-000000000003', now() - interval '280 days'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000007', 'member',  'explicit', now() - interval '90 days',  '20000000-0000-4000-8000-000000000003', now() - interval '90 days'),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000008', 'member',  'explicit', now() - interval '45 days',  '20000000-0000-4000-8000-000000000003', now() - interval '45 days'),
  -- Repair Cafe Regulars
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', 'host',    'explicit', now() - interval '240 days', null, now() - interval '240 days'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'fixer',   'explicit', now() - interval '230 days', '20000000-0000-4000-8000-000000000003', now() - interval '230 days'),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000005', 'fixer',   'explicit', now() - interval '60 days',  '20000000-0000-4000-8000-000000000003', now() - interval '60 days')
on conflict (group_id, member_id) do update set
  role                   = excluded.role,
  source                 = excluded.source,
  confirmed_by_member_id = excluded.confirmed_by_member_id,
  confirmed_at           = excluded.confirmed_at,
  left_at                = null;

-- Maya's self-attested locality claim. Pairs with the crosswalk row below so
-- the public "Claimed local owner" badge resolves on the Shop page.
insert into public.zip_metro_crosswalk (zip, msa_code, msa_name, state, source)
values ('00001', '99999', 'The Good Place, TG', 'TG', 'demo-seed-the-good-place')
on conflict (zip) do update set
  msa_code = excluded.msa_code,
  msa_name = excluded.msa_name,
  state    = excluded.state,
  source   = excluded.source;

insert into public.member_business_jurisdictions (id, member_id, group_id, zip, verification_source)
values ('40000000-0000-4000-8000-0000000000f1',
        '20000000-0000-4000-8000-000000000001',
        '40000000-0000-4000-8000-000000000001',
        '00001', 'self_attested')
on conflict (id) do update set
  zip                 = excluded.zip,
  verification_source = excluded.verification_source,
  removed_at          = null;


------------------------------------------------------------
-- 5. Items
--
-- All sixteen publish immediately (state='published'), which is what puts
-- them in discoverable_items and therefore in the locality feed.
--
-- Item id prefixes are load-bearing for URLs: the composer addresses an Item
-- as toSlug(title) || '-' || left(id, 8), so `a0000001` is the addressing key
-- for the sourdough loaf. Keeping the ids readable keeps the demo URLs
-- readable.
------------------------------------------------------------

insert into public.items
  (id, member_id, kind, group_id, title, description, state, category, brand_label,
   made_at_place_id, made_at_verification_source, ambient_extras, created_at, updated_at)
values
  -- ── Products ───────────────────────────────────────────────────────────
  ('a0000001-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'product',
   '40000000-0000-4000-8000-000000000001', 'Country Sourdough Loaf',
   'Thirty-six hour ferment, stone-milled flour from two valleys over, baked dark. Wednesday and Saturday only. Bring your own bag if you remember.',
   'published', 'food', 'The Good Loaf',
   '10000000-0000-4000-8000-000000000003', 'self_attested',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '38 days', now() - interval '38 days'),

  ('a0000002-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'product',
   '40000000-0000-4000-8000-000000000001', 'Seeded Rye Loaf',
   'Half rye, sunflower and caraway through the crumb. Keeps for the better part of a week, which is the whole point of a rye.',
   'published', 'food', 'The Good Loaf',
   '10000000-0000-4000-8000-000000000003', 'self_attested',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '31 days', now() - interval '31 days'),

  ('a0000003-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000006', 'product',
   null, 'Cold Brew by the Growler',
   'Sixteen-hour steep, no sugar, no games. Bring a growler and I will fill it; buy one from me if you did not.',
   'published', 'food', null,
   '10000000-0000-4000-8000-000000000003', 'self_attested',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '22 days', now() - interval '22 days'),

  ('a0000004-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000004', 'product',
   null, 'Tomato and Pepper Seedlings',
   'Eight tomato varieties and four peppers, all started in February, all hardened off. Four dollars a pot or trade me something.',
   'published', 'garden', null,
   '10000000-0000-4000-8000-000000000003', 'self_attested',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '12 days', now() - interval '12 days'),

  -- ── Services ───────────────────────────────────────────────────────────
  ('a0000005-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000001', 'service',
   '40000000-0000-4000-8000-000000000001', 'Custom Celebration Cake',
   'Tell me the occasion and roughly how many people. I will quote you within a day. Two weeks notice, longer in December.',
   'published', 'food', 'The Good Loaf', null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '35 days', now() - interval '35 days'),

  ('a0000006-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000002', 'service',
   null, 'Saturday Bike Tune-Up',
   'Brakes, gears, chain, true the wheels. Flat rate, done while you do the market. Bring the bike, not an appointment.',
   'published', 'repair', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '54 days', now() - interval '54 days'),

  ('a0000007-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000005', 'service',
   null, 'Wheel-Throwing Basics',
   'Two people at a time, two hours, clay and firing included. You will make three bad bowls and one you keep.',
   'published', 'crafts', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '27 days', now() - interval '27 days'),

  ('a0000008-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000008', 'service',
   null, 'Reading and Homework Help',
   'Thursday evenings at the library, ages six to sixteen. Pay what you can; nobody has ever been turned away and nobody will be.',
   'published', 'education', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '61 days', now() - interval '61 days'),

  -- ── Gatherings ─────────────────────────────────────────────────────────
  ('a0000009-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000003', 'gathering',
   null, 'The Good Market',
   'Every Saturday, eight until one, rain or shine. Thirty-odd stalls, live music after eleven, and a bike stand under the oak.',
   'published', 'community', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '400 days', now() - interval '9 days'),

  ('a0000010-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000003', 'gathering',
   '40000000-0000-4000-8000-000000000003', 'Repair Cafe',
   'Bring the broken thing. Toasters, bicycles, lamps, jeans, anything with a seam or a screw. Six fixers, free tea, no charge ever.',
   'published', 'repair', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '240 days', now() - interval '4 days'),

  ('a0000011-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-000000000004', 'gathering',
   null, 'Spring Seed Swap',
   'Bring seed you saved, leave with seed somebody else saved. Labels and envelopes provided. Extras go to the school garden.',
   'published', 'garden', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '16 days', now() - interval '16 days'),

  -- ── Wonders (UI label: Idea) ───────────────────────────────────────────
  ('a0000012-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000007', 'wonder',
   null, 'What if we had a tool library?',
   'I own a tile saw I have used twice. Theo owns a pressure washer. Between the eleven of us on this street there is probably a whole hardware store sitting in sheds. Somewhere to put it and a sign-out sheet is most of the work.',
   'published', 'community', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '18 days', now() - interval '18 days'),

  ('a0000013-0000-4000-8000-00000000000d', '20000000-0000-4000-8000-000000000003', 'wonder',
   null, 'Should the market run on Wednesday evenings too?',
   'Saturday works for people who are not working Saturday. I keep hearing from folks on shift. A smaller Wednesday five-to-eight might reach them — but only if enough stalls would actually show.',
   'published', 'community', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '6 days', now() - interval '6 days'),

  -- ── Offer / Ask / Initiative ───────────────────────────────────────────
  ('a0000014-0000-4000-8000-00000000000e', '20000000-0000-4000-8000-000000000004', 'offer',
   null, 'Free plums — come pick',
   'The Santa Rosa is going over faster than I can use it. Ladder is against the fence, gate is unlocked, take as much as you can carry.',
   'published', 'garden', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '3 days', now() - interval '3 days'),

  ('a0000015-0000-4000-8000-00000000000f', '20000000-0000-4000-8000-000000000007', 'ask',
   null, 'Folding table to borrow for market day',
   'Six foot if anyone has one. Just for Saturday, back by two, I will bring it to wherever you are.',
   'published', 'community', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '2 days', now() - interval '2 days'),

  ('a0000016-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000007', 'initiative',
   null, 'Neighborhood solar co-buy',
   'Twenty roofs buying together gets a materially better price than twenty roofs buying alone. I am collecting names, not deposits. At twenty I will get three real quotes and put them in front of everyone.',
   'published', 'sustainability', null, null, 'none',
   '{"demo_seed":"the-good-place"}'::jsonb, now() - interval '25 days', now() - interval '25 days')
on conflict (id) do update set
  member_id                   = excluded.member_id,
  kind                        = excluded.kind,
  group_id                    = excluded.group_id,
  title                       = excluded.title,
  description                 = excluded.description,
  state                       = excluded.state,
  category                    = excluded.category,
  brand_label                 = excluded.brand_label,
  made_at_place_id            = excluded.made_at_place_id,
  made_at_verification_source = excluded.made_at_verification_source,
  ambient_extras              = excluded.ambient_extras,
  updated_at                  = excluded.updated_at,
  deleted_at                  = null;

-- The event-anchored Group now points back at the gathering that spawned it.
update public.group_event_anchored
   set seeded_by_item_id = 'a0000010-0000-4000-8000-00000000000a'
 where group_id = '40000000-0000-4000-8000-000000000003';

insert into public.item_products (item_id, price_cents, price_unit, composition, photo_urls, available_until)
values
  ('a0000001-0000-4000-8000-000000000001',  900, 'loaf',    'Stone-milled wheat, water, salt, levain.', array[]::text[], null),
  ('a0000002-0000-4000-8000-000000000002', 1000, 'loaf',    'Rye, wheat, sunflower, caraway, salt, levain.', array[]::text[], null),
  ('a0000003-0000-4000-8000-000000000003', 1800, 'growler', 'Coffee. Water. Sixteen hours.', array[]::text[], null),
  ('a0000004-0000-4000-8000-000000000004',  400, 'pot',     'Eight tomato varieties, four pepper varieties.', array[]::text[], now() + interval '45 days')
on conflict (item_id) do update set
  price_cents     = excluded.price_cents,
  price_unit      = excluded.price_unit,
  composition     = excluded.composition,
  available_until = excluded.available_until;

insert into public.item_services (item_id, rate_model, rate_cents, hours, on_call, accepts_new_clients)
values
  ('a0000005-0000-4000-8000-000000000005', 'quote',  null,
   '{"note":"Quotes returned within a day. Two weeks notice."}'::jsonb, false, true),
  ('a0000006-0000-4000-8000-000000000006', 'flat',   4500,
   '{"sat":"08:00-13:00"}'::jsonb, false, true),
  ('a0000007-0000-4000-8000-000000000007', 'hourly', 5500,
   '{"tue":"18:00-20:00","thu":"18:00-20:00","sun":"14:00-16:00"}'::jsonb, false, true),
  ('a0000008-0000-4000-8000-000000000008', 'hourly', 3000,
   '{"thu":"17:00-20:00"}'::jsonb, false, true)
on conflict (item_id) do update set
  rate_model          = excluded.rate_model,
  rate_cents          = excluded.rate_cents,
  hours               = excluded.hours,
  accepts_new_clients = excluded.accepts_new_clients;

-- Dates are computed relative to now(), so re-running the seed rolls the demo
-- calendar forward instead of leaving stale past events on the surfaces.
insert into public.item_gatherings
  (item_id, starts_at, ends_at, recurrence_rule, capacity, cost_cents, what_to_bring, host_member_id, rsvp_cutoff)
values
  ('a0000009-0000-4000-8000-000000000009',
   date_trunc('week', now() + interval '7 days') + interval '5 days 8 hours',
   date_trunc('week', now() + interval '7 days') + interval '5 days 13 hours',
   'FREQ=WEEKLY;BYDAY=SA', null, 0, 'A bag. Cash helps the smaller stalls.',
   '20000000-0000-4000-8000-000000000003', null),

  ('a0000010-0000-4000-8000-00000000000a',
   date_trunc('month', now() + interval '1 month') + interval '13 days 10 hours',
   date_trunc('month', now() + interval '1 month') + interval '13 days 14 hours',
   'FREQ=MONTHLY;BYMONTHDAY=14', 40, 0, 'The broken thing, and its power cable if it has one.',
   '20000000-0000-4000-8000-000000000003', null),

  ('a0000011-0000-4000-8000-00000000000b',
   date_trunc('day', now()) + interval '18 days 10 hours',
   date_trunc('day', now()) + interval '18 days 12 hours',
   null, 40, 0, 'Saved seed, labelled if you managed it.',
   '20000000-0000-4000-8000-000000000004',
   date_trunc('day', now()) + interval '17 days')
on conflict (item_id) do update set
  starts_at       = excluded.starts_at,
  ends_at         = excluded.ends_at,
  recurrence_rule = excluded.recurrence_rule,
  capacity        = excluded.capacity,
  cost_cents      = excluded.cost_cents,
  what_to_bring   = excluded.what_to_bring,
  host_member_id  = excluded.host_member_id,
  rsvp_cutoff     = excluded.rsvp_cutoff;

insert into public.item_wonders (item_id, interest_count, expires_at, conversion_target_kind)
values
  ('a0000012-0000-4000-8000-00000000000c', 4, now() + interval '72 days', 'initiative'),
  ('a0000013-0000-4000-8000-00000000000d', 3, now() + interval '84 days', 'gathering')
on conflict (item_id) do update set
  interest_count         = excluded.interest_count,
  expires_at             = excluded.expires_at,
  conversion_target_kind = excluded.conversion_target_kind;

-- Item ↔ Venue. The first attachment per Item becomes `nearest_location` in
-- discoverable_items, which is what puts the Item inside a Place polygon and
-- therefore into the locality feed.
insert into public.item_locations (id, item_id, location_id, schedule_kind, schedule_metadata, status)
values
  ('b0000000-0000-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'recurring',       '{"days":["wed","sat"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003', 'ongoing',         '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000003', 'a0000002-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'recurring',       '{"days":["sat"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000004', 'a0000003-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002', 'ongoing',         '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000005', 'a0000004-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001', 'recurring',       '{"days":["sat"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000006', 'a0000005-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000003', 'by_appointment',  '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000007', 'a0000006-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000001', 'recurring',       '{"days":["sat"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000008', 'a0000007-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000002', 'by_appointment',  '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000009', 'a0000008-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000004', 'recurring',       '{"days":["thu"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-00000000000a', 'a0000009-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000001', 'recurring',       '{"days":["sat"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-00000000000b', 'a0000010-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000002', 'recurring',       '{"days":["sat"]}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-00000000000c', 'a0000011-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000003', 'one_time',        '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-00000000000d', 'a0000012-0000-4000-8000-00000000000c', '30000000-0000-4000-8000-000000000002', 'ongoing',         '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-00000000000e', 'a0000013-0000-4000-8000-00000000000d', '30000000-0000-4000-8000-000000000001', 'ongoing',         '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-00000000000f', 'a0000014-0000-4000-8000-00000000000e', '30000000-0000-4000-8000-000000000003', 'ongoing',         '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000010', 'a0000015-0000-4000-8000-00000000000f', '30000000-0000-4000-8000-000000000001', 'one_time',        '{}'::jsonb, 'approved'),
  ('b0000000-0000-4000-8000-000000000011', 'a0000016-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000002', 'ongoing',         '{}'::jsonb, 'approved')
on conflict (id) do update set
  item_id           = excluded.item_id,
  location_id       = excluded.location_id,
  schedule_kind     = excluded.schedule_kind,
  schedule_metadata = excluded.schedule_metadata,
  status            = excluded.status,
  removed_at        = null;

-- Controlled-vocabulary tags. The alphabetically-first tag becomes primary_tag
-- in discoverable_items, which is what the interest-tag feed boost matches on.
insert into public.item_tags (item_id, tag) values
  ('a0000001-0000-4000-8000-000000000001', 'bakery'),
  ('a0000001-0000-4000-8000-000000000001', 'food'),
  ('a0000002-0000-4000-8000-000000000002', 'bakery'),
  ('a0000002-0000-4000-8000-000000000002', 'food'),
  ('a0000003-0000-4000-8000-000000000003', 'coffee'),
  ('a0000003-0000-4000-8000-000000000003', 'food'),
  ('a0000004-0000-4000-8000-000000000004', 'gardening'),
  ('a0000005-0000-4000-8000-000000000005', 'bakery'),
  ('a0000006-0000-4000-8000-000000000006', 'bicycles'),
  ('a0000006-0000-4000-8000-000000000006', 'repair'),
  ('a0000007-0000-4000-8000-000000000007', 'crafts'),
  ('a0000008-0000-4000-8000-000000000008', 'education'),
  ('a0000009-0000-4000-8000-000000000009', 'community'),
  ('a0000009-0000-4000-8000-000000000009', 'food'),
  ('a0000010-0000-4000-8000-00000000000a', 'community'),
  ('a0000010-0000-4000-8000-00000000000a', 'repair'),
  ('a0000011-0000-4000-8000-00000000000b', 'gardening'),
  ('a0000012-0000-4000-8000-00000000000c', 'community'),
  ('a0000012-0000-4000-8000-00000000000c', 'repair'),
  ('a0000013-0000-4000-8000-00000000000d', 'community'),
  ('a0000014-0000-4000-8000-00000000000e', 'gardening'),
  ('a0000015-0000-4000-8000-00000000000f', 'community'),
  ('a0000016-0000-4000-8000-000000000010', 'community'),
  ('a0000016-0000-4000-8000-000000000010', 'sustainability')
on conflict (item_id, tag) do nothing;

insert into public.item_hashtags (item_id, hashtag) values
  ('a0000001-0000-4000-8000-000000000001', 'sourdough'),
  ('a0000002-0000-4000-8000-000000000002', 'sourdough'),
  ('a0000003-0000-4000-8000-000000000003', 'coldbrew'),
  ('a0000004-0000-4000-8000-000000000004', 'seedlings'),
  ('a0000006-0000-4000-8000-000000000006', 'bikes'),
  ('a0000009-0000-4000-8000-000000000009', 'thegoodmarket'),
  ('a0000010-0000-4000-8000-00000000000a', 'repaircafe'),
  ('a0000011-0000-4000-8000-00000000000b', 'seedswap'),
  ('a0000012-0000-4000-8000-00000000000c', 'toollibrary'),
  ('a0000016-0000-4000-8000-000000000010', 'solar')
on conflict (item_id, hashtag) do nothing;

-- Responses. These drive the visible counts on Item cards and pages, and the
-- interest_count denormalization on the two Wonders.
insert into public.item_responses (id, item_id, responder_member_id, response_kind, metadata, created_at)
values
  ('c0000000-0000-4000-8000-000000000001', 'a0000001-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', 'save',     '{}'::jsonb, now() - interval '30 days'),
  ('c0000000-0000-4000-8000-000000000002', 'a0000001-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000007', 'purchase', '{"qty":1}'::jsonb, now() - interval '9 days'),
  ('c0000000-0000-4000-8000-000000000003', 'a0000001-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000008', 'purchase', '{"qty":2}'::jsonb, now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000004', 'a0000002-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000005', 'save',     '{}'::jsonb, now() - interval '14 days'),
  ('c0000000-0000-4000-8000-000000000005', 'a0000003-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'purchase', '{"qty":1}'::jsonb, now() - interval '5 days'),
  ('c0000000-0000-4000-8000-000000000006', 'a0000004-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000001', 'interest', '{}'::jsonb, now() - interval '8 days'),
  ('c0000000-0000-4000-8000-000000000007', 'a0000004-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000005', 'interest', '{}'::jsonb, now() - interval '7 days'),
  ('c0000000-0000-4000-8000-000000000008', 'a0000006-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000006', 'interest', '{}'::jsonb, now() - interval '20 days'),
  ('c0000000-0000-4000-8000-000000000009', 'a0000007-0000-4000-8000-000000000007', '20000000-0000-4000-8000-000000000007', 'interest', '{}'::jsonb, now() - interval '11 days'),
  ('c0000000-0000-4000-8000-00000000000a', 'a0000008-0000-4000-8000-000000000008', '20000000-0000-4000-8000-000000000004', 'save',     '{}'::jsonb, now() - interval '13 days'),
  ('c0000000-0000-4000-8000-00000000000b', 'a0000009-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000001', 'rsvp',     '{}'::jsonb, now() - interval '6 days'),
  ('c0000000-0000-4000-8000-00000000000c', 'a0000009-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000002', 'rsvp',     '{}'::jsonb, now() - interval '6 days'),
  ('c0000000-0000-4000-8000-00000000000d', 'a0000009-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000004', 'rsvp',     '{}'::jsonb, now() - interval '5 days'),
  ('c0000000-0000-4000-8000-00000000000e', 'a0000009-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000006', 'rsvp',     '{}'::jsonb, now() - interval '4 days'),
  ('c0000000-0000-4000-8000-00000000000f', 'a0000009-0000-4000-8000-000000000009', '20000000-0000-4000-8000-000000000007', 'follow',   '{}'::jsonb, now() - interval '3 days'),
  ('c0000000-0000-4000-8000-000000000010', 'a0000010-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000002', 'rsvp',     '{}'::jsonb, now() - interval '12 days'),
  ('c0000000-0000-4000-8000-000000000011', 'a0000010-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000005', 'rsvp',     '{}'::jsonb, now() - interval '10 days'),
  ('c0000000-0000-4000-8000-000000000012', 'a0000010-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-000000000007', 'rsvp',     '{}'::jsonb, now() - interval '2 days'),
  ('c0000000-0000-4000-8000-000000000013', 'a0000011-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-000000000001', 'rsvp',     '{}'::jsonb, now() - interval '9 days'),
  ('c0000000-0000-4000-8000-000000000014', 'a0000011-0000-4000-8000-00000000000b', '20000000-0000-4000-8000-000000000003', 'rsvp',     '{}'::jsonb, now() - interval '8 days'),
  ('c0000000-0000-4000-8000-000000000015', 'a0000012-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000002', 'interest', '{}'::jsonb, now() - interval '17 days'),
  ('c0000000-0000-4000-8000-000000000016', 'a0000012-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000003', 'interest', '{}'::jsonb, now() - interval '16 days'),
  ('c0000000-0000-4000-8000-000000000017', 'a0000012-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000005', 'interest', '{}'::jsonb, now() - interval '15 days'),
  ('c0000000-0000-4000-8000-000000000018', 'a0000012-0000-4000-8000-00000000000c', '20000000-0000-4000-8000-000000000008', 'interest', '{}'::jsonb, now() - interval '14 days'),
  ('c0000000-0000-4000-8000-000000000019', 'a0000013-0000-4000-8000-00000000000d', '20000000-0000-4000-8000-000000000001', 'interest', '{}'::jsonb, now() - interval '5 days'),
  ('c0000000-0000-4000-8000-00000000001a', 'a0000013-0000-4000-8000-00000000000d', '20000000-0000-4000-8000-000000000006', 'interest', '{}'::jsonb, now() - interval '4 days'),
  ('c0000000-0000-4000-8000-00000000001b', 'a0000013-0000-4000-8000-00000000000d', '20000000-0000-4000-8000-000000000004', 'interest', '{}'::jsonb, now() - interval '3 days'),
  ('c0000000-0000-4000-8000-00000000001c', 'a0000014-0000-4000-8000-00000000000e', '20000000-0000-4000-8000-000000000008', 'interest', '{}'::jsonb, now() - interval '2 days'),
  ('c0000000-0000-4000-8000-00000000001d', 'a0000015-0000-4000-8000-00000000000f', '20000000-0000-4000-8000-000000000003', 'support',  '{"note":"I have one in the shed."}'::jsonb, now() - interval '1 day'),
  ('c0000000-0000-4000-8000-00000000001e', 'a0000016-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000003', 'pledge',   '{}'::jsonb, now() - interval '20 days'),
  ('c0000000-0000-4000-8000-00000000001f', 'a0000016-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000001', 'pledge',   '{}'::jsonb, now() - interval '19 days'),
  ('c0000000-0000-4000-8000-000000000020', 'a0000016-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000008', 'pledge',   '{}'::jsonb, now() - interval '12 days'),
  ('c0000000-0000-4000-8000-000000000021', 'a0000016-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000004', 'pledge',   '{}'::jsonb, now() - interval '6 days'),
  ('c0000000-0000-4000-8000-000000000022', 'a0000016-0000-4000-8000-000000000010', '20000000-0000-4000-8000-000000000005', 'interest', '{}'::jsonb, now() - interval '5 days')
on conflict (id) do update set
  item_id             = excluded.item_id,
  responder_member_id = excluded.responder_member_id,
  response_kind       = excluded.response_kind,
  metadata            = excluded.metadata,
  withdrawn_at        = null;


------------------------------------------------------------
-- 6. Event log (ADR-10)
--
-- Every entity gets its creation event so the append-only log tells the same
-- story the tables do. Partition keys are stamped at now(), so re-running the
-- seed does not duplicate: each row carries a fixed id and upserts on
-- (id, created_at) — the partitioned primary key — via ON CONFLICT DO NOTHING
-- against the current partition.
------------------------------------------------------------

-- Each event id is derived from a stable row_number over a stable ordering, so
-- the same entity always gets the same event id. The NOT EXISTS guard is what
-- makes a re-run a no-op: ON CONFLICT alone would not help, because the
-- partitioned primary key is (id, created_at) and a later run stamps a new
-- created_at.

with candidates as (
  select ('d1000000-0000-4000-8000-' || lpad((row_number() over (order by p.slug))::text, 12, '0'))::uuid as ev_id,
         p.id as place_id
    from public.places p
   where p.metadata->>'demo_seed' = 'the-good-place'
)
insert into public.place_events (id, place_id, event_kind, payload, acting_member_id)
select c.ev_id, c.place_id, 'place.created',
       jsonb_build_object('demo_seed','the-good-place','seed_method','fictional_bbox'), null
  from candidates c
 where not exists (select 1 from public.place_events e where e.id = c.ev_id);

with candidates as (
  select ('d2000000-0000-4000-8000-' || lpad((row_number() over (order by m.handle))::text, 12, '0'))::uuid as ev_id,
         m.id as member_id
    from public.members m
   where m.id::text like '20000000-0000-4000-8000-%'
)
insert into public.member_events (id, member_id, event_kind, payload, acting_member_id)
select c.ev_id, c.member_id, 'member.created',
       jsonb_build_object('demo_seed','the-good-place'), c.member_id
  from candidates c
 where not exists (select 1 from public.member_events e where e.id = c.ev_id);

with candidates as (
  select ('d3000000-0000-4000-8000-' || lpad((row_number() over (order by l.slug))::text, 12, '0'))::uuid as ev_id,
         l.id as location_id, l.member_id
    from public.locations l
   where l.ambient_extras->>'demo_seed' = 'the-good-place'
)
insert into public.location_events (id, location_id, event_kind, payload, acting_member_id)
select c.ev_id, c.location_id, 'location.created',
       jsonb_build_object('demo_seed','the-good-place'), c.member_id
  from candidates c
 where not exists (select 1 from public.location_events e where e.id = c.ev_id);

with candidates as (
  select ('d4000000-0000-4000-8000-' || lpad((row_number() over (order by g.slug))::text, 12, '0'))::uuid as created_id,
         ('d5000000-0000-4000-8000-' || lpad((row_number() over (order by g.slug))::text, 12, '0'))::uuid as activated_id,
         g.id as group_id, g.founder_member_id
    from public.groups g
   where g.metadata->>'demo_seed' = 'the-good-place'
)
insert into public.group_events (id, group_id, event_kind, payload, acting_member_id)
select ev.id, ev.group_id, ev.kind,
       jsonb_build_object('demo_seed','the-good-place'), ev.founder_member_id
  from candidates c
 cross join lateral (values
   (c.created_id,   c.group_id, 'group.created',   c.founder_member_id),
   (c.activated_id, c.group_id, 'group.activated', c.founder_member_id)
 ) as ev(id, group_id, kind, founder_member_id)
 where not exists (select 1 from public.group_events e where e.id = ev.id);

with candidates as (
  select ('d6000000-0000-4000-8000-' || lpad((row_number() over (order by gm.group_id, gm.member_id))::text, 12, '0'))::uuid as ev_id,
         gm.group_id, gm.member_id, gm.role
    from public.group_memberships gm
    join public.groups g on g.id = gm.group_id
   where g.metadata->>'demo_seed' = 'the-good-place'
)
insert into public.group_events (id, group_id, event_kind, payload, acting_member_id)
select c.ev_id, c.group_id, 'group.member_joined',
       jsonb_build_object('demo_seed','the-good-place','role',c.role), c.member_id
  from candidates c
 where not exists (select 1 from public.group_events e where e.id = c.ev_id);

with candidates as (
  select ('d7000000-0000-4000-8000-' || lpad((row_number() over (order by i.id))::text, 12, '0'))::uuid as created_id,
         ('d8000000-0000-4000-8000-' || lpad((row_number() over (order by i.id))::text, 12, '0'))::uuid as published_id,
         i.id as item_id, i.member_id, i.kind
    from public.items i
   where i.ambient_extras->>'demo_seed' = 'the-good-place'
)
insert into public.item_events (id, item_id, event_kind, payload, acting_member_id)
select ev.id, ev.item_id, ev.kind_name,
       jsonb_build_object('demo_seed','the-good-place','kind',ev.item_kind), ev.member_id
  from candidates c
 cross join lateral (values
   (c.created_id,   c.item_id, 'item.created',   c.member_id, c.kind),
   (c.published_id, c.item_id, 'item.published', c.member_id, c.kind)
 ) as ev(id, item_id, kind_name, member_id, item_kind)
 where not exists (select 1 from public.item_events e where e.id = ev.id);


------------------------------------------------------------
-- 7. Restore the two triggers and commit.
------------------------------------------------------------

-- Rebuild the discovery index — the work the item.published trigger would
-- normally do. NOT the CONCURRENTLY form: that cannot run inside a transaction
-- block, and the Supabase SQL Editor sends the whole file as one query. The
-- plain form takes a brief exclusive lock on the view instead, which at this
-- row count is measured in milliseconds.
refresh materialized view public.discoverable_items;

alter table public.item_events enable trigger trg_refresh_discoverable_items;
alter table public.members     enable trigger members_assert_id_in_auth_users;

commit;


------------------------------------------------------------
-- 8. Where to look
------------------------------------------------------------

select 'home feed'  as surface, '/?place=the-good-place' as path
union all select 'place',   '/p/tgp/the-good-place'
union all select 'place',   '/p/tgp/the-good-place/market-square'
union all select 'shop',    '/p/tgp/the-good-place/g/the-good-loaf'
union all select 'venue',   '/p/tgp/the-good-place/l/the-good-market'
union all select 'venue',   '/p/tgp/the-good-place/l/pond-side-commons'
union all select 'product', '/p/tgp/the-good-place/g/the-good-loaf/p/country-sourdough-loaf-a0000001'
union all select 'product', '/p/tgp/the-good-place/g/the-good-loaf/p/seeded-rye-loaf-a0000002'
union all select 'service', '/p/tgp/the-good-place/g/the-good-loaf/s/custom-celebration-cake-a0000005'
union all select 'gathering','/p/tgp/the-good-place/g/repair-cafe-regulars/e/repair-cafe-a0000010'
union all select 'product', '/m/jonah-kessler/p/cold-brew-by-the-growler-a0000003'
union all select 'product', '/m/sam-whitfield/p/tomato-and-pepper-seedlings-a0000004'
union all select 'service', '/m/theo-brandt/s/saturday-bike-tune-up-a0000006'
union all select 'service', '/m/priya-raman/s/wheel-throwing-basics-a0000007'
union all select 'service', '/m/casey-lindqvist/s/reading-and-homework-help-a0000008'
union all select 'gathering','/m/rosa-delgado/e/the-good-market-a0000009'
union all select 'gathering','/m/sam-whitfield/e/spring-seed-swap-a0000011'
union all select 'member',  '/m/maya-okonkwo'
union all select 'member',  '/m/rosa-delgado';


-- ─────────────────────────────────────────────────────────────────────────
-- TEARDOWN — removes every showcase row. Uncomment and run to reset.
--
-- begin;
-- alter table public.members disable trigger members_assert_id_in_auth_users;
-- delete from public.item_responses  where id::text like 'c0000000-0000-4000-8000-%';
-- delete from public.item_locations  where id::text like 'b0000000-0000-4000-8000-%';
-- delete from public.items           where id::text like 'a00000__-0000-4000-8000-%';
-- delete from public.member_business_jurisdictions where id::text like '40000000-0000-4000-8000-%';
-- delete from public.zip_metro_crosswalk where source = 'demo-seed-the-good-place';
-- delete from public.group_memberships where group_id::text like '40000000-0000-4000-8000-00000000000_';
-- delete from public.groups          where id::text like '40000000-0000-4000-8000-00000000000_';
-- delete from public.locations       where id::text like '30000000-0000-4000-8000-%';
-- delete from public.member_follows  where follower_member_id::text like '20000000-0000-4000-8000-%'
--                                       or followed_member_id::text like '20000000-0000-4000-8000-%';
-- delete from public.members         where id::text like '20000000-0000-4000-8000-%';
-- delete from public.places          where id::text like '10000000-0000-4000-8000-%';
-- refresh materialized view public.discoverable_items;
-- alter table public.members enable trigger members_assert_id_in_auth_users;
-- commit;
-- ─────────────────────────────────────────────────────────────────────────
