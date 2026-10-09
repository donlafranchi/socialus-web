-- #544 — who on the staff may do what, and the first numbers they read.
--
-- ROLES, not people. A role is a named set of permissions; a person holds one or
-- more roles. Changing what "moderator" may do is one row, not a code change, and
-- adding the hundredth employee is one assignment. Today a single env var
-- (OPERATOR_MEMBER_ID) decides who is "the operator"; it stays as the owner's
-- break-glass in the app, and everything else moves onto these tables.
--
-- Server-only: members and visitors read none of these tables. The two functions
-- below are the only doors, and each checks the caller itself.

create table public.staff_roles (
  role        text primary key check (role ~ '^[a-z_]+$'),
  description text not null
);
create table public.staff_permissions (
  permission  text primary key check (permission ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);
create table public.staff_role_permissions (
  role       text not null references public.staff_roles(role) on delete cascade,
  permission text not null references public.staff_permissions(permission) on delete cascade,
  primary key (role, permission)
);
create table public.staff_assignments (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references public.members(id) on delete cascade,
  role       text not null references public.staff_roles(role),
  granted_by uuid references public.members(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
-- One live assignment of a role per person; a revoked one stays as the record.
create unique index staff_assignments_live on public.staff_assignments (member_id, role) where revoked_at is null;
create index staff_assignments_member on public.staff_assignments (member_id) where revoked_at is null;

alter table public.staff_roles enable row level security;
alter table public.staff_permissions enable row level security;
alter table public.staff_role_permissions enable row level security;
alter table public.staff_assignments enable row level security;
revoke all on public.staff_roles, public.staff_permissions, public.staff_role_permissions, public.staff_assignments from anon, authenticated;

insert into public.staff_permissions (permission, description) values
  ('metrics.view',     'Read the weekly metrics screen'),
  ('reports.review',   'Review and decide reported content'),
  ('tags.review',      'Mark a new tag safe or unsafe'),
  ('builders.manage',  'Show, hide or delete builder (test) content'),
  ('unclaimed.manage', 'Restore or review unclaimed Pages and their requests'),
  ('staff.manage',     'Grant and revoke staff roles');
insert into public.staff_roles (role, description) values
  ('owner',     'Everything, including granting roles'),
  ('moderator', 'Reviews reports and tags, handles unclaimed Pages'),
  ('analyst',   'Reads the metrics, nothing else'),
  ('support',   'Handles unclaimed Page requests');
insert into public.staff_role_permissions (role, permission)
  select 'owner', permission from public.staff_permissions;
insert into public.staff_role_permissions (role, permission) values
  ('moderator', 'reports.review'), ('moderator', 'tags.review'), ('moderator', 'unclaimed.manage'),
  ('analyst',   'metrics.view'),
  ('support',   'unclaimed.manage');

-- Does the signed-in caller hold this permission? Their own, never anyone else's:
-- there is no member argument to impersonate. Signed out is false.
create or replace function public.staff_can(p_permission text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from public.staff_assignments a
      join public.staff_role_permissions rp on rp.role = a.role
     where a.member_id = auth.uid()
       and a.revoked_at is null
       and rp.permission = p_permission
  )
$$;
revoke all on function public.staff_can(text) from public;
grant execute on function public.staff_can(text) to anon, authenticated;

-- The four starter numbers for the Sacramento metro, a week per row, newest first
-- (socialus-plan planning/research/place-connection-starter-metrics-2026-10-09.md,
-- set A). Counts only; no person is returned. Needs metrics.view; without it, no rows. Weeks start
-- Monday, Pacific time. Builder (test) members and Pages are left out.
create or replace function public.admin_metrics_weekly(p_weeks int default 2)
returns table (
  week_start            date,
  gatherings            int,
  venues                int,
  new_members           int,
  new_members_connected int,
  members_total         int,
  members_unconnected   int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_metro uuid;
  v_geo   geography;
  v_this  timestamptz := date_trunc('week', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles';
begin
  -- No permission: no rows, and nothing to tell the caller why (a raise here
  -- took the whole Postgres backend down in testing, 17.6, so it does not raise).
  if not public.staff_can('metrics.view') then
    return;
  end if;

  select m.id, m.geography into v_metro, v_geo
    from public.metro_polygons m
    join public.places s on s.kind = 'city' and s.display_name = 'Sacramento' and s.deleted_at is null
   where st_intersects(m.geography, coalesce(s.centroid, st_centroid(s.geography::geometry)::geography))
   limit 1;
  if v_metro is null then return; end if;

  return query
  with weeks as (
    select (v_this - make_interval(weeks => n))               as ws,
           (v_this - make_interval(weeks => n)) + interval '7 days' as we
      from generate_series(0, greatest(p_weeks, 1) - 1) n
  ),
  gath as (
    select pp.starts_at, coalesce(pp.location_id, g.anchor_location_id) as venue
      from public.page_posts pp
      join public.groups g on g.id = pp.group_id
      join public.locations l on l.id = coalesce(pp.location_id, g.anchor_location_id) and l.deleted_at is null
     where pp.starts_at is not null
       and pp.lifecycle_state = 'active' and pp.discoverability = 'listed'
       and pp.dissolved_at is null and pp.hidden_at is null and pp.removed_at is null
       and g.lifecycle_state = 'active' and g.dissolved_at is null and g.unclaimed_hidden_at is null
       and not exists (select 1 from public.builders b where b.member_id = g.founder_member_id)
       and st_intersects(v_geo, l.geography)
  ),
  mem as (
    select m.id, m.created_at
      from public.members m
     where coalesce(m.home_metro_id, m.default_metro_id) = v_metro
       and m.deleted_at is null
       and m.id <> '00000000-0000-0000-0000-000000000001'
       and not exists (select 1 from public.builders b where b.member_id = m.id)
  )
  select (w.ws at time zone 'America/Los_Angeles')::date,
         (select count(*)::int from gath x where x.starts_at >= w.ws and x.starts_at < w.we),
         (select count(distinct x.venue)::int from gath x where x.starts_at >= w.we - interval '30 days' and x.starts_at < w.we),
         (select count(*)::int from mem m where m.created_at >= w.ws and m.created_at < w.we),
         (select count(*)::int from mem m
           where m.created_at >= w.ws and m.created_at < w.we
             and (exists (select 1 from public.member_follows f where f.follower_member_id = m.id and f.created_at <= m.created_at + interval '14 days')
               or exists (select 1 from public.group_memberships gm where gm.member_id = m.id and gm.joined_at <= m.created_at + interval '14 days'))),
         (select count(*)::int from mem m where m.created_at <= least(w.we, now()) - interval '14 days'),
         (select count(*)::int from mem m
           where m.created_at <= least(w.we, now()) - interval '14 days'
             and not exists (select 1 from public.member_follows f where f.follower_member_id = m.id and f.created_at <= least(w.we, now()) and (f.unfollowed_at is null or f.unfollowed_at > least(w.we, now())))
             and not exists (select 1 from public.group_memberships gm where gm.member_id = m.id and gm.joined_at <= least(w.we, now()) and (gm.left_at is null or gm.left_at > least(w.we, now()))))
    from weeks w
   order by w.ws desc;
end
$$;
-- Executable by anon on purpose: the check is inside, and a signed-out call gets no rows.
-- (A call refused for want of EXECUTE crashed the local Postgres backend in testing, 17.6;
-- an empty answer never reaches that path.)
revoke all on function public.admin_metrics_weekly(int) from public;
grant execute on function public.admin_metrics_weekly(int) to anon, authenticated;
