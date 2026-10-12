-- F103.1 (#693): a market is a row. The MSA is replaced by the market (plan #107, the PM, 2026-10-11).
--
-- A market is a set of whole counties and, where a county is split, county subdivisions
-- (Census COUSUB). Every county not named here is its own waiting market BY RULE: market_key()
-- answers 'county-<fips>' and no row exists. Moving a county or subdivision is one row in
-- market_members. Data only: nothing reads these tables yet (#694 reads market_key at signup).
-- The feed keeps reading metro_polygons through beta.

create table public.markets (
  id                uuid        primary key default gen_random_uuid(),
  slug              text        not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{0,79}$' and slug !~ '^county-'),
  name              text        not null check (char_length(name) between 1 and 120),
  -- Seeded from the metro it replaces; the feed reads the metro through beta.
  metro_id          uuid        references public.metro_polygons(id) on delete set null,
  is_open           boolean     not null default false,
  creator_threshold int         not null default 50  check (creator_threshold > 0),
  patron_threshold  int         not null default 250 check (patron_threshold > 0),
  creator_count     int         not null default 0   check (creator_count >= 0),
  patron_count      int         not null default 0   check (patron_count >= 0),
  hide_bar          numeric     not null default 0   check (hide_bar >= 0 and hide_bar <= 1),
  timezone          text        not null default 'America/Los_Angeles',
  -- Read by reports only; no member-facing surface shows it (F103.4).
  msa_code          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table public.market_members (
  id           uuid primary key default gen_random_uuid(),
  market_id    uuid not null references public.markets(id) on delete cascade,
  county_fips  text not null check (county_fips ~ '^[0-9]{5}$'),
  -- Null: the whole county. Set: that county subdivision only, and it wins over the county's own row.
  cousub_geoid text check (cousub_geoid ~ '^[0-9]{10}$'),
  constraint market_members_cousub_in_county check (cousub_geoid is null or left(cousub_geoid, 5) = county_fips)
);

-- One market per county, and one per subdivision.
create unique index uniq_market_members_county on public.market_members (county_fips) where cousub_geoid is null;
create unique index uniq_market_members_cousub on public.market_members (county_fips, cousub_geoid) where cousub_geoid is not null;
create index idx_market_members_market on public.market_members (market_id);

alter table public.markets enable row level security;
alter table public.market_members enable row level security;
create policy markets_select_public on public.markets for select using (true);
create policy market_members_select_public on public.market_members for select using (true);

-- The market a county (and, inside a split county, a subdivision) belongs to: a named market's slug,
-- else 'county-<fips>'. Null for anything that is not a 5-digit county code.
create function public.market_key(p_county text, p_cousub text default null)
returns text
language sql
stable
set search_path = public
as $$
  select case when p_county ~ '^[0-9]{5}$' then
    coalesce(
      (select m.slug from public.market_members mm join public.markets m on m.id = mm.market_id
        where mm.county_fips = p_county and p_cousub is not null and mm.cousub_geoid = p_cousub),
      (select m.slug from public.market_members mm join public.markets m on m.id = mm.market_id
        where mm.county_fips = p_county and mm.cousub_geoid is null),
      'county-' || p_county
    )
  end
$$;

-- Sacramento: the state is carried over from the metro it replaces.
insert into public.markets (slug, name, metro_id, is_open, creator_threshold, patron_threshold, creator_count, patron_count, hide_bar, msa_code)
select 'sacramento', 'Sacramento', p.id, p.is_open, p.creator_threshold, p.patron_threshold, p.creator_count, p.patron_count, p.hide_bar, '40900'
  from public.metro_polygons p where p.slug = 'sacramento-roseville-ca';

-- The Tahoe basin is a different market: waiting.
insert into public.markets (slug, name) values ('tahoe', 'Lake Tahoe');

-- Sacramento, Yolo, Placer and El Dorado, whole; the Tahoe subdivisions (checked against the Census 2023
-- Gazetteer: Placer's Lake Tahoe CCD, El Dorado's South Lake Tahoe CCD) are carved out to Tahoe.
insert into public.market_members (market_id, county_fips)
select (select id from public.markets where slug = 'sacramento'), c from unnest(array['06067', '06113', '06061', '06017']) as c;
insert into public.market_members (market_id, county_fips, cousub_geoid)
select (select id from public.markets where slug = 'tahoe'), v.county, v.cousub
  from (values ('06061', '0606191550'), ('06017', '0601793160')) as v(county, cousub);
