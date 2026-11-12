-- F133 (the PM, 2026-11-12, "A A") — product analytics as usage counts in our own database. Launch preparation, an
-- exception to the 2026-11-06 build freeze, so the first invited cohort is counted.
--   usage_daily    per day (Pacific) per part of the app: members who used it. No member id.
--   usage_weekly   per week (Monday, Pacific) per join week: members active that week. No member id.
--   funnel_weekly  per week per step (sign-up steps, first follow, first post): members who reached it. No member id.
--   usage_seen     sha256 dedupe keys: (member, part, day), (member, week), (member, step). Deleted after 8 days by
--                  the usage.log handler, on every write, as map_tap_seen is.
-- Writes go through the action layer (ADR-7): usage.log, which skips a member who turned sharing off on You
-- (members.search_sharing) and every builder, as map.log does. Read back only through the admin_usage_* functions,
-- gated on metrics.view, as admin_map_taps is.

create table public.usage_daily (
  day     date not null,
  part    text not null check (part in ('posts', 'explore', 'pages', 'groups', 'map', 'search', 'ask')),
  members int  not null default 0 check (members >= 0),
  primary key (day, part)
);

create table public.usage_weekly (
  week      date not null,
  join_week date not null,
  active    int  not null default 0 check (active >= 0),
  primary key (week, join_week)
);

create table public.funnel_weekly (
  week    date not null,
  step    text not null check (step in ('signed_in', 'profile', 'welcomed', 'first_follow', 'first_post')),
  reached int  not null default 0 check (reached >= 0),
  primary key (week, step)
);

create table public.usage_seen (
  key     text not null primary key,
  seen_on date not null default current_date
);
create index usage_seen_on on public.usage_seen (seen_on);

alter table public.usage_daily enable row level security;
alter table public.usage_weekly enable row level security;
alter table public.funnel_weekly enable row level security;
alter table public.usage_seen enable row level security;
revoke all on public.usage_daily, public.usage_weekly, public.funnel_weekly, public.usage_seen from anon, authenticated;

-- F133.1 — members active each week, by the week they joined, the last p_weeks weeks. Without metrics.view: no rows.
create or replace function public.admin_usage_weekly(p_weeks int default 12)
returns table (week date, join_week date, active int)
language sql stable security definer set search_path = public as $$
  select u.week, u.join_week, u.active
    from public.usage_weekly u
   where public.staff_can('metrics.view')
     and u.week > date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date - 7 * greatest(p_weeks, 1)
   order by u.week desc, u.join_week desc
$$;

-- F133.2 — members who used each part of the app, per day, the last p_days days.
create or replace function public.admin_usage_daily(p_days int default 14)
returns table (day date, part text, members int)
language sql stable security definer set search_path = public as $$
  select u.day, u.part, u.members
    from public.usage_daily u
   where public.staff_can('metrics.view')
     and u.day > (now() at time zone 'America/Los_Angeles')::date - greatest(p_days, 1)
   order by u.day desc, u.part
$$;

-- F133.3 — members who reached each sign-up step, a first follow and a first post, per week, the last p_weeks weeks.
create or replace function public.admin_funnel_weekly(p_weeks int default 12)
returns table (week date, step text, reached int)
language sql stable security definer set search_path = public as $$
  select f.week, f.step, f.reached
    from public.funnel_weekly f
   where public.staff_can('metrics.view')
     and f.week > date_trunc('week', (now() at time zone 'America/Los_Angeles')::date)::date - 7 * greatest(p_weeks, 1)
   order by f.week desc, f.step
$$;

revoke all on function public.admin_usage_weekly(int) from public, anon;
revoke all on function public.admin_usage_daily(int) from public, anon;
revoke all on function public.admin_funnel_weekly(int) from public, anon;
grant execute on function public.admin_usage_weekly(int) to authenticated;
grant execute on function public.admin_usage_daily(int) to authenticated;
grant execute on function public.admin_funnel_weekly(int) to authenticated;
