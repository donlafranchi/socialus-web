-- T119 — Group URL prefixes for canonical Item links (F054).
--
-- Spec:   playbooks/PLATFORM-PATTERNS.md § "An Item's canonical URL is its
--         Group place-path when filed, its Member path when not"
--         product/systems/places.md § URL-prefix derivation
--         ADR-0022 § county tier is URL-skippable
-- Depends on: 017 (places + ancestor_state_id), 025 (locations.place_id), 014 (groups)
--
-- THE GAP. Group-filed Items have had working routes since T079/T082/T083
-- (/p/<…place>/g/<group>/<seg>/<item>), but nothing could build the link:
-- the Group's slug is not in any browse read, and the Group's place path is
-- not stored anywhere. It is, however, fully derivable —
--   groups.anchor_location_id -> locations.place_id -> places (walk parent_id)
-- — and 025 added the middle join. These two functions expose that walk.
--
-- WHY NOT DENORMALIZE INTO discoverable_items. The MV refreshes on
-- item.published only. A Place rename or re-parent would leave every affected
-- Item carrying a stale path until some unrelated Item happened to publish.
-- Deriving live costs one extra round trip per browse and is always current.
--
-- WHY security invoker. Every table in the chain is anon-readable under its
-- own RLS: places (places_select_all), groups (listed + active), locations
-- (listed/unlisted). There is nothing here a caller could not read directly,
-- so no SECURITY DEFINER escape hatch is warranted. A private or dissolved
-- Group returns no row and its Items fall back to the Member path.
--
-- COUNTY TRANSPARENCY. places.md / ADR-0022 make the county tier skippable in
-- URLs: /p/ca/sacramento/oak-park addresses the *city* Sacramento, and the
-- county between them is transparent. place_url_path implements the same rule
-- the read-side resolver (web/src/lib/places/resolve-path.ts) implements in
-- the other direction, so a path built here round-trips back through it.

------------------------------------------------------------
-- 1. place_url_path — a Place's URL path, county tier skipped.
------------------------------------------------------------

create or replace function public.place_url_path(p_place_id uuid)
returns text
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  with recursive chain as (
    select p.id, p.parent_id, p.slug, p.kind, 0 as depth
      from public.places p
     where p.id = p_place_id
       and p.deleted_at is null
    union all
    select p.id, p.parent_id, p.slug, p.kind, c.depth + 1
      from public.places p
      join chain c on p.id = c.parent_id
     where p.deleted_at is null
       -- Depth guard. places.parent_id has no cycle constraint, and this
       -- function runs on every browse; an accidental cycle must degrade to a
       -- wrong path, never hang the feed. Real depth is 4 (state→county→
       -- city→neighborhood); 10 is slack without being unbounded.
       and c.depth < 10
  )
  select nullif(
    string_agg(slug, '/' order by depth desc),
    ''
  )
  from chain
  -- The county tier exists in the data and is transparent in URLs.
  where kind <> 'county';
$$;

comment on function public.place_url_path(uuid) is
  'The URL path for a Place — slash-joined ancestor slugs, outermost first, county tier skipped per ADR-0022. Round-trips through web/src/lib/places/resolve-path.ts. Null for a missing or soft-deleted Place.';

grant execute on function public.place_url_path(uuid) to anon, authenticated, service_role;

------------------------------------------------------------
-- 2. group_url_prefixes — slug + place path, batched.
------------------------------------------------------------

create or replace function public.group_url_prefixes(p_group_ids uuid[])
returns table (
  group_id   uuid,
  slug       text,
  place_path text
)
language sql
stable
security invoker
set search_path = public, pg_catalog
as $$
  select
    g.id                            as group_id,
    g.slug                          as slug,
    public.place_url_path(l.place_id) as place_path
  from public.groups g
  left join public.locations l
    on l.id = g.anchor_location_id
   and l.deleted_at is null
  where g.id = any(p_group_ids)
    and g.dissolved_at is null;
$$;

comment on function public.group_url_prefixes(uuid[]) is
  'Canonical URL prefix for each Group: its slug plus its anchor Location''s Place path. place_path is null when the Group has no anchor Location or that Location has no place_id — the caller falls back to the Item''s Member path. RLS-gated (security invoker): a Group the caller cannot read returns no row.';

grant execute on function public.group_url_prefixes(uuid[]) to anon, authenticated, service_role;
