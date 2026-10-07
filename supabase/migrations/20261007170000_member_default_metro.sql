-- #329/#330 — a member's own "default metro" (You page). The Explore pill opens
-- on it; unset, the zip-derived home_metro_id applies, then the platform default.
-- members_owner_update already lets a member write their own row.
alter table public.members
  add column default_metro_id uuid references public.metro_polygons(id) on delete set null;

comment on column public.members.default_metro_id is
  'The metro the member chose as their default (pill, You page). Beats the zip-derived home_metro_id; null falls back to it.';
