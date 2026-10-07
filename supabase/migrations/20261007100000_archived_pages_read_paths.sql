-- #439 — groups_hidden_owner_only (20261006230000_page_archive_delete, #423)
-- hides an archived or deleted Page from everyone but its managers. RLS does
-- not reach the three read paths that bypass it, so an archived Page's items
-- still surfaced in Explore and at its venue, and its address still resolved
-- for a member who had joined it. Each now says what the policy says:
--
--   discoverable_items   — recreated with lifecycle_state in ('draft','active')
--                          beside the dissolved_at check; otherwise identical
--                          to 20261001100000_builder_accounts (columns,
--                          indexes, comment, column grants).
--   venue_hosted_items   — the same condition.
--   group_url_prefixes   — the founded and joined paths admit draft and
--                          active only; a manager still resolves an archived
--                          Page, so the owner's own link works.
--
-- The view refreshed on item events only, so archiving or restoring a Page
-- left it stale until the next publish. A trigger on groups now refreshes it
-- when lifecycle_state, dissolved_at or discoverability actually changes.
--
-- Nothing depends on the view (its readers are plain SQL functions, unbound),
-- so the drop below does not cascade.
--
-- ORDER: applies after 20261006230000_page_archive_delete, which adds
-- 'archived' and current_member_managing_group_ids(). 20261007010000 (another
-- lane) applies before this one and redefines none of what is here.

create or replace function public.venue_hosted_items(p_location_id uuid, p_owning_group_id uuid)
returns table (
  item_id uuid, member_handle text, member_display_name text, item_kind text, title text,
  category text, brand_label text, group_id uuid, nearest_location_label text,
  response_count bigint, primary_tag text, photo_url text, published_at timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    i.id,
    m.handle,
    null::text,
    i.kind,
    i.title,
    i.category,
    i.brand_label,
    i.group_id,
    null::text,
    0::bigint,
    null::text,
    coalesce(nullif(btrim(i.photo_url), ''), nullif(btrim(ip.photo_urls[1]), '')),
    i.updated_at
  from public.items i
  join public.groups g
    on g.id = i.group_id
  join public.item_locations il
    on il.item_id = i.id
   and il.location_id = p_location_id
   and il.removed_at is null
   and il.status = 'approved'
  join public.members m
    on m.id = i.member_id
   and m.deleted_at is null
  left join public.item_products ip on ip.item_id = i.id
  left join public.item_gatherings ig on ig.item_id = i.id
  where i.group_id = p_owning_group_id
    and i.state = 'published'
    and i.deleted_at is null
    and public.builder_visible(i.member_id)
    and g.lifecycle_state in ('draft', 'active')
    and (
      (g.discoverability = 'listed' and g.dissolved_at is null)
      or g.id in (select public.current_member_explicit_group_ids())
    )
    and (ig.starts_at is null or ig.starts_at >= now())
    and (i.kind <> 'gathering' or ig.starts_at is not null)
  order by ig.starts_at asc nulls last, i.updated_at desc
$$;

create or replace function public.group_url_prefixes(p_group_ids uuid[])
returns table (group_id uuid, slug text, place_path text)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select
    g.id,
    g.slug,
    public.place_url_path(l.place_id)
  from public.groups g
  left join public.locations l
    on l.id = g.anchor_location_id
   and l.deleted_at is null
  where g.id = any(p_group_ids)
    and g.dissolved_at is null
    and public.builder_visible(g.founder_member_id)
    and (
      (g.lifecycle_state = 'active' and g.discoverability = 'listed')
      or (g.lifecycle_state in ('draft', 'active') and (
            g.id in (select public.current_member_explicit_group_ids())
         or g.id in (select public.current_member_founded_group_ids())
      ))
      or g.id in (select public.current_member_managing_group_ids())
    )
$$;

drop materialized view if exists public.discoverable_items;

create materialized view public.discoverable_items as
  select
    i.id                                                       as item_id,
    i.member_id,
    m.handle                                                   as member_handle,
    m.display_name                                             as member_display_name,
    i.kind                                                     as item_kind,
    i.title,
    i.description,
    i.category,
    i.brand_label,
    i.group_id,
    g.name                                                     as group_name,
    g.kind                                                     as group_kind,
    gb.display_name                                            as group_business_display_name,
    nearest.location_id                                        as nearest_location_id,
    l.label                                                    as nearest_location_label,
    l.slug                                                     as nearest_location_slug,
    l.geography                                                as nearest_location_geography,
    coalesce(rc.response_count, 0)                             as response_count,
    pt.tag                                                     as primary_tag,
    gs.starts_at                                               as starts_at,
    coalesce(
      nullif(btrim(i.photo_url), ''),
      nullif(btrim(ip.photo_urls[1]), '')
    )                                                          as photo_url,
    i.updated_at                                               as published_at
  from public.items i
  join public.members m
    on m.id = i.member_id
   and m.deleted_at is null
  left join public.groups g
    on g.id = i.group_id
  left join public.group_businesses gb
    on gb.group_id = g.id
   and g.kind = 'business'
  left join public.item_products ip
    on ip.item_id = i.id
  left join lateral (
    select il.location_id
      from public.item_locations il
     where il.item_id = i.id
       and il.removed_at is null
       and il.status = 'approved'
     order by il.created_at asc
     limit 1
  ) nearest on true
  left join public.locations l
    on l.id = nearest.location_id
   and l.deleted_at is null
  left join lateral (
    select count(*) as response_count
      from public.item_responses r
     where r.item_id = i.id
       and r.withdrawn_at is null
       and not public.is_builder(r.responder_member_id)
  ) rc on true
  left join lateral (
    select tag
      from public.item_tags t
     where t.item_id = i.id
     order by t.tag asc
     limit 1
  ) pt on true
  left join lateral (
    select ig.starts_at
      from public.item_gatherings ig
     where ig.item_id = i.id
     order by ig.starts_at asc
     limit 1
  ) gs on true
  where
    i.state = 'published'
    and i.deleted_at is null
    and not public.is_builder(i.member_id)
    and (
      i.group_id is null
      or (g.discoverability = 'listed' and g.dissolved_at is null
          and g.lifecycle_state in ('draft', 'active'))
    );

-- CONCURRENTLY refresh requires a unique index on the materialized view.
create unique index unique_idx_discoverable_items
  on public.discoverable_items (item_id);

-- Existing browse indexes (recreated 1:1 with the MV rebuild).
create index idx_discoverable_items_kind
  on public.discoverable_items (item_kind);

create index idx_discoverable_items_category
  on public.discoverable_items (category)
  where category is not null;

create index idx_discoverable_items_group
  on public.discoverable_items (group_id)
  where group_id is not null;

create index idx_discoverable_items_geography
  on public.discoverable_items using gist (nearest_location_geography);

create index idx_discoverable_items_recency
  on public.discoverable_items (published_at desc);

create index idx_discoverable_items_starts_at
  on public.discoverable_items (starts_at asc nulls last)
  where starts_at is not null;

comment on materialized view public.discoverable_items is
  'Locality-first index per item.md. Anon-readable. Refreshed synchronously on item.published events at b1. starts_at (T106) carries the earliest item_gatherings occurrence. photo_url resolves items.photo_url, falling back to item_products.photo_urls[1], so feed cards get one image column regardless of kind. The WHERE clause is the public-readable gate (state=published, not deleted, no group OR listed group); MVs do not support RLS. #280: no builder item, and no builder response in response_count. #439: no item of an archived or deleted Page; trg_refresh_discoverable_items_on_page refreshes it when a Page''s lifecycle changes.';

do $$
declare
  cols text;
begin
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    into cols
    from pg_attribute a
   where a.attrelid = 'public.discoverable_items'::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attname not in ('member_id', 'member_display_name');
  execute 'revoke all on public.discoverable_items from anon, authenticated';
  execute format('grant select (%s) on public.discoverable_items to anon, authenticated', cols);
end
$$;

create or replace function public.refresh_discoverable_items_on_page_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  refresh materialized view concurrently public.discoverable_items;
  return null;
end;
$$;

revoke all on function public.refresh_discoverable_items_on_page_change() from public, anon, authenticated;

create trigger trg_refresh_discoverable_items_on_page
  after update of lifecycle_state, dissolved_at, discoverability on public.groups
  for each row
  when (old.lifecycle_state is distinct from new.lifecycle_state
     or old.dissolved_at is distinct from new.dissolved_at
     or old.discoverability is distinct from new.discoverability)
  execute function public.refresh_discoverable_items_on_page_change();

comment on function public.refresh_discoverable_items_on_page_change() is
  '#439: refreshes discoverable_items when a Page is archived, restored, deleted, dissolved or relisted, so its items leave or rejoin Explore at once. SECURITY DEFINER for the same reason as refresh_discoverable_items_on_publish.';
