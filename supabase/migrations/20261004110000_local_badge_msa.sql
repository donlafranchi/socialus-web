-- #349 — the local-owner badge counts anywhere in the metro (Don, 2026-10-04:
-- "Anything in MSA 40900 counts as local; no tighter radius or zip rule").
--
-- The owner's ZIP and the Page's location must be in the same MSA. The ZIP
-- side reads `zip_metro_crosswalk` (now filled from the Census ZCTA-county
-- file by the boundary loader). The location side tests the Page's pin
-- against the metro's county outlines (#347), not the place chain: a pin no
-- hand-drawn shape covered used to have no place, and so no badge.

create or replace function public.zip_is_proximal_to_location(zip text, location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select coalesce((
    select true
      from public.zip_metro_crosswalk zc
      join public.locations loc on loc.id = zip_is_proximal_to_location.location_id
      join public.boundaries b
        on b.layer = 'county' and b.msa_code = zc.msa_code
       and st_covers(b.geography, loc.geography)
     where zc.zip = zip_is_proximal_to_location.zip
     limit 1
  ), false);
$$;

comment on function public.zip_is_proximal_to_location(text, uuid) is
  'True when the ZIP''s MSA (zip_metro_crosswalk) contains the Location''s point (a county boundary of that MSA covers it). #349: anywhere in the MSA counts as local. SECURITY DEFINER.';

-- #347 follow-up: boundaries are written only by the loader. Row security
-- already refuses anon and authenticated writes (no write policy); this drops
-- the default table grants too, so a future policy can't open them by accident.
revoke insert, update, delete, truncate on public.boundaries from anon, authenticated;
