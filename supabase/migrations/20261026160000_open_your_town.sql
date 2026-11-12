-- F118 (socialus-plan, 2026-10-26): neighbours open their own town.
--
-- A town is a waiting market in the coverage area (the places table's ring of counties around
-- Sacramento), named for its county or region and listing the towns inside it. The market stays
-- the unit that opens (F103), so a town is one row pointing at a market key.
--
-- Goals: 100 makers and 1,000 supporters (the PM, 2026-10-26); only the first 3 towns to reach
-- both are marked ready this round. Counts are derived, never stored: a maker is a person who
-- created or claimed a Page there, a supporter is any other member whose zip puts them there.

create table public.towns (
  slug           text        primary key check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
  market_key     text        not null unique,
  name           text        not null check (char_length(name) between 1 and 120),
  -- County places (by display name) whose Pages count here, and the towns inside them.
  county_names   text[]      not null default '{}',
  -- A Page in one of these towns counts here even when its county belongs elsewhere (Lake Tahoe).
  place_names    text[]      not null default '{}',
  maker_goal     int         not null default 100  check (maker_goal > 0),
  supporter_goal int         not null default 1000 check (supporter_goal > 0),
  ready_at       timestamptz,
  ready_rank     int         unique check (ready_rank between 1 and 3),
  created_at     timestamptz not null default now(),
  constraint towns_ready_both check ((ready_at is null) = (ready_rank is null))
);
comment on table public.towns is
  'F118: a waiting market neighbours are opening. Goals are per-town configuration (an UPDATE, no deploy). ready_rank 1-3 is this round''s order; town_mark_ready() never marks a fourth.';

alter table public.towns enable row level security;
create policy towns_select_public on public.towns for select using (true);

-- The seven ring counties outside Sacramento, and the Tahoe basin.
insert into public.towns (slug, market_key, name, county_names, place_names)
select lower(replace(c.display_name, ' ', '-')), 'county-' || k.fips, k.name, array[c.display_name],
       coalesce((select array_agg(p.display_name order by p.display_name) from public.places p
                  where p.parent_id = c.id and p.kind = 'city' and p.deleted_at is null), '{}')
  from public.counties k
  join public.places c on c.kind = 'county' and c.deleted_at is null and c.display_name || ' County' = k.name
 where k.state = 'CA' and k.fips in ('06005', '06011', '06057', '06077', '06095', '06101', '06115')
on conflict do nothing;

insert into public.towns (slug, market_key, name, place_names)
select 'tahoe', 'tahoe', 'Lake Tahoe',
       coalesce((select array_agg(p.display_name order by p.display_name) from public.places p
                  where p.kind = 'city' and p.deleted_at is null
                    and p.display_name in ('Carnelian Bay', 'Dollar Point', 'Kings Beach', 'Meyers', 'South Lake Tahoe',
                                           'Sunnyside-Tahoe City', 'Tahoe Vista', 'Tahoma')), '{}')
 where exists (select 1 from public.markets where slug = 'tahoe' and not is_open)
on conflict do nothing;

-- A Page a supporter added: who added it, for which town, and what kind they said it is.
create table public.town_adds (
  id         uuid        primary key default gen_random_uuid(),
  member_id  uuid        not null references public.members(id) on delete cascade,
  group_id   uuid        not null unique references public.groups(id) on delete cascade,
  town_slug  text        not null references public.towns(slug) on delete cascade,
  maker_kind text        not null check (maker_kind in ('food', 'shops', 'makers', 'services', 'groups')),
  created_at timestamptz not null default now()
);
create index idx_town_adds_member on public.town_adds (member_id, created_at);
create index idx_town_adds_town on public.town_adds (town_slug);
alter table public.town_adds enable row level security;
create policy town_adds_select_own on public.town_adds for select using (member_id = auth.uid());
-- No write policy: the action layer writes (ADR-7).

alter table public.members add column open_credit_hidden boolean not null default false;
comment on column public.members.open_credit_hidden is
  'F118: true hides this member''s first name from the people opening their town. Default shown; one tap hides it.';

-- The town a place sits in: its own name, a town above it, or its county.
create function public.town_of_place(p_place uuid)
returns text language sql stable set search_path = public as $$
  with recursive up as (
    select id, parent_id, kind, display_name, 0 as depth from public.places where id = p_place
    union all
    select p.id, p.parent_id, p.kind, p.display_name, up.depth + 1
      from public.places p join up on p.id = up.parent_id where up.depth < 6
  )
  select coalesce(
    (select t.slug from up join public.towns t on up.kind in ('city', 'neighborhood') and up.display_name = any (t.place_names)
      order by up.depth limit 1),
    (select t.slug from up join public.towns t on up.kind = 'county' and up.display_name = any (t.county_names) limit 1)
  )
$$;

-- A Page's place: its Location's, else the town or county its point lies in.
create function public.location_place(p_location uuid)
returns uuid language sql stable set search_path = public as $$
  select coalesce(l.place_id,
    (select p.id from public.places p
      where p.kind in ('city', 'county') and p.deleted_at is null and p.geography is not null and st_covers(p.geography, l.geography)
      order by (p.kind = 'city') desc limit 1))
    from public.locations l where l.id = p_location
$$;

-- Every town with its counts. Aggregates only; no member is identifiable from it.
create function public.town_board()
returns table (slug text, name text, place_names text[], maker_goal int, supporter_goal int,
               makers int, supporters int, kinds jsonb, ready_at timestamptz, ready_rank int)
language sql stable security definer set search_path = public as $$
  with maker_pages as (
    select public.town_of_place(public.location_place(g.anchor_location_id)) as town, g.founder_member_id as member_id,
           coalesce(a.maker_kind, case when g.kind = 'group' or g.purpose = 'gather' then 'groups'
                                       when g.purpose = 'create' then 'makers'
                                       when g.purpose = 'offer' then 'services' else 'shops' end) as maker_kind
      from public.groups g
      join public.members m on m.id = g.founder_member_id and m.deleted_at is null
      left join public.town_adds a on a.group_id = g.id
     where g.unclaimed_at is null and g.lifecycle_state = 'active' and g.anchor_location_id is not null
       and g.founder_member_id <> '00000000-0000-0000-0000-000000000001'
       and not exists (select 1 from public.builders b where b.member_id = g.founder_member_id)
  ),
  makers as (select town, count(distinct member_id)::int as n from maker_pages where town is not null group by town),
  kinds as (
    select town, jsonb_object_agg(maker_kind, n) as kinds
      from (select town, maker_kind, count(*)::int as n from maker_pages where town is not null group by 1, 2) k
     group by town
  ),
  supporters as (
    select t.slug as town, count(*)::int as n
      from public.members m join public.towns t on t.market_key = m.home_market_key
     where m.deleted_at is null and m.id <> '00000000-0000-0000-0000-000000000001'
       and not exists (select 1 from public.builders b where b.member_id = m.id)
       and not exists (select 1 from maker_pages mp where mp.town = t.slug and mp.member_id = m.id)
     group by t.slug
  )
  select t.slug, t.name, t.place_names, t.maker_goal, t.supporter_goal,
         coalesce(mk.n, 0), coalesce(s.n, 0), coalesce(k.kinds, '{}'::jsonb), t.ready_at, t.ready_rank
    from public.towns t
    left join makers mk on mk.town = t.slug
    left join supporters s on s.town = t.slug
    left join kinds k on k.town = t.slug
$$;
revoke all on function public.town_board() from public;
grant execute on function public.town_board() to anon, authenticated, service_role;

-- The people opening a town: first names of those who did not hide theirs, top 10,
-- by makers they brought in (claimed), then by makers they added.
create function public.town_contributors(p_slug text)
returns table (first_name text, brought int, added int)
language sql stable security definer set search_path = public as $$
  select split_part(btrim(m.display_name), ' ', 1), count(g.claimed_at)::int, count(*)::int
    from public.town_adds a
    join public.members m on m.id = a.member_id and m.deleted_at is null and not m.open_credit_hidden
    join public.groups g on g.id = a.group_id and g.unclaimed_hidden_at is null and g.words_removed_at is null
   where a.town_slug = p_slug and coalesce(btrim(m.display_name), '') <> ''
     and not exists (select 1 from public.builders b where b.member_id = m.id)
   group by m.id, m.display_name
   order by 2 desc, 3 desc, min(a.created_at)
   limit 10
$$;
revoke all on function public.town_contributors(text) from public;
grant execute on function public.town_contributors(text) to anon, authenticated, service_role;

-- Marks towns that reached both goals, in order, until 3 are ready; returns the ones it marked.
-- Opening stays a person's act (F076 criterion 12): scripts/market/open-market.ts.
create function public.town_mark_ready()
returns setof text language plpgsql security definer set search_path = public as $$
declare r record; n int;
begin
  lock table public.towns in share row exclusive mode;
  for r in
    select b.slug from public.town_board() b
     where b.ready_at is null and b.makers >= b.maker_goal and b.supporters >= b.supporter_goal
     order by b.makers::numeric / b.maker_goal + b.supporters::numeric / b.supporter_goal desc, b.slug
  loop
    select count(*) into n from public.towns where ready_rank is not null;
    exit when n >= 3;
    update public.towns set ready_at = now(), ready_rank = n + 1 where slug = r.slug;
    return next r.slug;
  end loop;
end $$;
revoke all on function public.town_mark_ready() from public, anon, authenticated;
grant execute on function public.town_mark_ready() to service_role;

-- Members already waiting on a ring town's market are its supporters (their zip usually says so already).
update public.members m set home_market_key = mp.slug
  from public.metro_waitlist w join public.metro_polygons mp on mp.id = w.metro_id
 where w.member_id = m.id and m.home_market_key is null
   and exists (select 1 from public.towns t where t.market_key = mp.slug);
