-- #348 — where a Page is (Don, 2026-10-04: one question, three answers).
--   visit    People come to me: an address or a dropped pin (anchor_location_id),
--            an optional "How to find us", optionally shown as the
--            neighbourhood only (an area Location at the neighbourhood).
--   travel   I go to them: the towns they serve (page_service_areas); none
--            listed means the whole metro.
--   roaming  It moves, or it's online: the whole metro, "Usually around ___".
-- Signed out, none of this is sent (the front door, F093 criterion 8).

alter table public.groups
  add column where_mode text check (where_mode in ('visit', 'travel', 'roaming')),
  add column how_to_find text check (char_length(how_to_find) <= 140),
  add column usually_around text check (char_length(usually_around) <= 80);

-- groups is granted column by column (#254, #255).
grant select (where_mode, how_to_find, usually_around) on public.groups to authenticated;

create table public.page_service_areas (
  group_id   uuid not null references public.groups(id) on delete cascade,
  place_id   uuid not null references public.places(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (group_id, place_id)
);
alter table public.page_service_areas enable row level security;
create policy page_service_areas_select_signed_in on public.page_service_areas
  for select to authenticated using (true);
grant select on public.page_service_areas to authenticated;
revoke insert, update, delete, truncate on public.page_service_areas from anon, authenticated;

-- An event's own meet spot: its location_id plus this line, overriding the Page's.
alter table public.page_posts
  add column how_to_find text check (char_length(how_to_find) <= 140);
