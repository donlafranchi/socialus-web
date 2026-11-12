-- plan #258 option A (Don, 2026-11-01) — does anyone use the map? "Show on map" and Directions taps, per day.
--   map_tap_daily  per day (Pacific) per kind: taps. No member id.
--   map_tap_seen   sha256 dedupe keys: one tap per member per kind per place a day, at most 12 of a kind per member
--                  a day (`bucket`, also a hash). Deleted after 8 days by the map.log handler.
-- Writes go through the action layer (ADR-7): map.log, which skips a member who turned logging off on You
-- (members.search_sharing) and every builder. Read back beside the map mix for the 2026-11-15 review.

create table public.map_tap_daily (
  day  date not null,
  kind text not null check (kind in ('show_on_map', 'directions')),
  taps int  not null default 0 check (taps >= 0),
  primary key (day, kind)
);

create table public.map_tap_seen (
  key     text not null primary key,
  bucket  text,
  seen_on date not null default current_date
);
create index map_tap_seen_bucket on public.map_tap_seen (bucket) where bucket is not null;
create index map_tap_seen_on on public.map_tap_seen (seen_on);

alter table public.map_tap_daily enable row level security;
alter table public.map_tap_seen enable row level security;
revoke all on public.map_tap_daily, public.map_tap_seen from anon, authenticated;

-- Staff: each day's taps, newest first. Without metrics.view: no rows (as admin_shelf_scoreboard).
create or replace function public.admin_map_taps(p_days int default 14)
returns table (day date, show_on_map int, directions int)
language sql stable security definer set search_path = public as $$
  select d.day,
         coalesce(sum(d.taps) filter (where d.kind = 'show_on_map'), 0)::int,
         coalesce(sum(d.taps) filter (where d.kind = 'directions'), 0)::int
    from public.map_tap_daily d
   where public.staff_can('metrics.view')
     and d.day > (now() at time zone 'America/Los_Angeles')::date - greatest(p_days, 1)
   group by d.day
   order by d.day desc
$$;
revoke all on function public.admin_map_taps(int) from public, anon;
grant execute on function public.admin_map_taps(int) to authenticated;
