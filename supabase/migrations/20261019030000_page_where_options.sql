-- #896 — more ways to say where a Page is (Don, 2026-10-18: "We need more
-- options for when there isn't a street address as well"). Google Business
-- Profile's service-area / hide-address, Yelp's service area, a market stall's
-- where-and-when.
--   visit     a street address, or the neighbourhood only (unchanged)
--   landmark  cross streets or a landmark: a pin plus the owner's own words
--   multi     more than one location: page_stops, one address each
--   roaming   it moves: "Usually around ___" plus an optional where-and-when list (page_stops)
--   travel    I go to them (unchanged)
--   online    online only or by appointment: no place, no map
-- Signed in only, like the rest of where (F093 criterion 8).

alter table public.groups drop constraint if exists groups_where_mode_check;
alter table public.groups
  add constraint groups_where_mode_check
  check (where_mode in ('visit', 'landmark', 'multi', 'roaming', 'travel', 'online'));

create table if not exists public.page_stops (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  position   smallint not null check (position between 0 and 19),
  label      text not null check (char_length(btrim(label)) between 1 and 120),
  when_text  text check (char_length(when_text) <= 80),
  created_at timestamptz not null default now(),
  unique (group_id, position)
);
alter table public.page_stops enable row level security;
drop policy if exists page_stops_select_signed_in on public.page_stops;
create policy page_stops_select_signed_in on public.page_stops
  for select to authenticated using (true);
grant select on public.page_stops to authenticated;
revoke all on public.page_stops from anon;
revoke insert, update, delete, truncate on public.page_stops from authenticated;
