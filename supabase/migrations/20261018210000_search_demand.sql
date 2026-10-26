-- #909 — search demand: what locals searched on Explore, by area and week, so search helps
-- local businesses carry what people look for (Don, 2026-10-18). F113 option C (2026-10-16):
-- collected for the members' benefit, no one else profits, opting out is easy.
-- Path: new territory, ruled. Precedents: Google Trends, Shopify search analytics
-- ("searches with no results"), Etsy shop stats search terms.
--
-- No member id is stored with a query. A member who turns it off on You is never logged.
-- Written only by the search.demand_log handler (server pool); read only through the two
-- functions below: staff (metrics.view) see everything by week and area, a Page's managers
-- see terms in their area searched 3 or more times in 30 days.

alter table public.members add column if not exists search_sharing boolean not null default true;
comment on column public.members.search_sharing is
  '#909 — false: this member''s Explore searches are never logged to search_demand. Default true (F113 option C).';

create table public.search_demand (
  id           bigint      generated always as identity primary key,
  query        text        not null check (char_length(query) between 2 and 80 and query = lower(query)),
  metro_id     uuid        references public.metro_polygons(id) on delete set null,
  place_id     uuid        references public.places(id) on delete set null,
  result_count int         not null check (result_count >= 0),
  zero_result  boolean     generated always as (result_count = 0) stored,
  created_at   timestamptz not null default now()
);
create index search_demand_metro_created on public.search_demand (metro_id, created_at desc);
create index search_demand_created on public.search_demand (created_at desc);
comment on table public.search_demand is
  '#909 — one settled Explore search: normalized text, the area it ran in, how many results. No member id, ever.';

-- One log per searcher per query per 10 minutes. The key is a hash of (searcher, query);
-- a row lives 10 minutes and is pruned on the next write, so nothing links a search to a
-- person past that window, and the hash never reaches search_demand.
create table public.search_demand_seen (
  key     text        primary key,
  seen_at timestamptz not null default now()
);
create index search_demand_seen_at on public.search_demand_seen (seen_at);

alter table public.search_demand enable row level security;
alter table public.search_demand_seen enable row level security;
revoke all on public.search_demand, public.search_demand_seen from anon, authenticated;

-- Staff: the top searches and the top searches that found nothing, per week and area.
-- Weeks start Monday, Pacific. Without metrics.view: no rows (never a raise; see 20261009030000).
create or replace function public.admin_search_demand(p_weeks int default 4, p_limit int default 10)
returns table (week_start date, area text, list text, query text, searches int)
language sql stable security definer set search_path = public as $$
  with d as (
    select (date_trunc('week', s.created_at at time zone 'America/Los_Angeles'))::date as wk,
           coalesce((select mk.name from public.markets mk where mk.metro_id = s.metro_id order by mk.name limit 1), mp.name, 'No area') as area,
           s.query as q, s.zero_result as z
      from public.search_demand s
      left join public.metro_polygons mp on mp.id = s.metro_id
     where public.staff_can('metrics.view')
       and s.created_at >= (date_trunc('week', now() at time zone 'America/Los_Angeles') at time zone 'America/Los_Angeles')
                           - make_interval(weeks => greatest(p_weeks, 1) - 1)
  ),
  agg as (
    select wk, area, 'top'::text as list, q, count(*)::int as n from d group by wk, area, q
    union all
    select wk, area, 'zero'::text, q, count(*)::int from d where z group by wk, area, q
  ),
  ranked as (
    select agg.*, row_number() over (partition by wk, area, list order by n desc, q) as rn from agg
  )
  select wk, area, list, q, n from ranked
   where rn <= greatest(p_limit, 1)
   order by wk desc, area, list, n desc, q
$$;
revoke all on function public.admin_search_demand(int, int) from public;
grant execute on function public.admin_search_demand(int, int) to anon, authenticated;

-- A Page's managers: what locals in the Page's area searched in the last 30 days, only
-- terms searched 3 or more times, so no single search shows. 'fit' = terms that share
-- words with the Page's tags; 'zero' = terms in the area that found nothing. Anyone else,
-- or a Page with no place in a metro: no rows.
create or replace function public.page_search_demand(p_group_id uuid)
returns table (list text, query text, searches int)
language sql stable security definer set search_path = public as $$
  with pg as (
    select mp.id as metro_id
      from public.groups g
      join public.locations l on l.id = g.anchor_location_id and l.deleted_at is null
      join public.metro_polygons mp on st_intersects(mp.geography, l.geography)
     where g.id = p_group_id
       and g.id in (select public.current_member_managing_group_ids())
     limit 1
  ),
  words as (
    select t.normalized as w
      from public.page_tags pt
      join public.tags t on t.id = pt.tag_id and t.status = 'visible'
     where pt.group_id = p_group_id and char_length(t.normalized) >= 2
  ),
  d as (
    select s.query as q, s.zero_result as z
      from public.search_demand s join pg on s.metro_id = pg.metro_id
     where s.created_at >= now() - interval '30 days'
  ),
  fit as (
    select 'fit'::text as list, d.q, count(*)::int as n from d
     where exists (select 1 from words where position(words.w in d.q) > 0 or position(d.q in words.w) > 0)
     group by d.q having count(*) >= 3
  ),
  zero as (
    select 'zero'::text as list, d.q, count(*)::int as n from d where d.z group by d.q having count(*) >= 3
  )
  (select * from fit order by n desc, q limit 5)
  union all
  (select * from zero order by n desc, q limit 5)
$$;
revoke all on function public.page_search_demand(uuid) from public;
grant execute on function public.page_search_demand(uuid) to anon, authenticated;
