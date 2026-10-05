-- #347 — boundary layers from public data (Don, 2026-10-04: "choose a location
-- is completely busted"). One table holds every layer a person can pick or
-- serve: counties, cities and census-designated places, census tracts, and
-- neighbourhoods. Each row says where it came from, under what licence, and
-- which vintage, so a future metro is a loader config entry, not new code.
--
-- `places` stays the app's curated hierarchy (URLs, breadcrumbs, scoping).
-- The loader syncs counties, cities and neighbourhoods into it and links them
-- back here; tracts live only here, because `place_for_coords` picks the
-- smallest containing place and a tract would become every breadcrumb.

create table public.boundaries (
  id              uuid        primary key default gen_random_uuid(),
  layer           text        not null check (layer in ('county', 'place', 'tract', 'neighborhood')),
  -- The source's own identifier (TIGER GEOID, a city's neighbourhood id).
  -- With the layer, it's what the loader upserts on.
  source_id       text        not null,
  name            text        not null check (char_length(name) between 1 and 160),
  geography       geography(MultiPolygon, 4326) not null,
  -- The pin: TIGER's internal point, or a point on the surface for shapes
  -- that don't publish one. Always inside the shape.
  centroid        geography(Point, 4326) not null,
  state_fips      text        not null check (state_fips ~ '^\d{2}$'),
  county_fips     text        check (county_fips ~ '^\d{3}$'),
  msa_code        text        check (msa_code ~ '^\d{5}$'),
  source          text        not null,
  source_url      text        not null check (source_url ~ '^https://'),
  licence         text        not null,
  vintage         text        not null,
  metadata        jsonb       not null default '{}'::jsonb,
  loaded_at       timestamptz not null default now(),
  unique (layer, source_id)
);

create index boundaries_geography_gix on public.boundaries using gist (geography);
create index boundaries_msa_layer_idx on public.boundaries (msa_code, layer);

-- Public data, read by anyone, written only by the loader (service role).
alter table public.boundaries enable row level security;
create policy boundaries_select_all on public.boundaries for select to anon, authenticated using (true);
grant select on public.boundaries to anon, authenticated;

-- The curated place a boundary was synced into.
alter table public.places
  add column boundary_id uuid references public.boundaries(id) on delete set null;
create unique index places_boundary_id_key on public.places (boundary_id) where boundary_id is not null;
