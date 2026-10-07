-- bug #439 — an archived or deleted Page answers the people who manage it, by
-- every path. groups_hidden_owner_only (#423) closes the table, and everything
-- reading groups as the caller follows it. Four reads did not:
--
--   items               — a Page's members and RSVP parties read its items by
--                         policies that never look at the Page's state. A
--                         restrictive policy now says an item on a Page follows
--                         the Page (its own author still reads it).
--   discoverable_items  — a materialized view (no RLS) filtered only on
--                         dissolved_at, so an archived Page's items stayed in
--                         it. Now active Pages only, and refreshed whenever a
--                         Page changes state, not only when an item publishes.
--   venue_hosted_items  — security definer; now says what the policy says.
--   page_listed_member_counts — security definer; a count for an archived or
--                         deleted Page is now nobody's but its managers'.
--
-- Operators read an archived or deleted Page on the operator page, which reads
-- over the pool (Facebook and Google moderators work in their own tools, not on
-- the public surface); nothing here changes that.
--
-- ORDER: after 20261006230000_page_archive_delete (current_member_managing_group_ids)
-- and 20261007010000_place_and_tag_authors.

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
      or (g.discoverability = 'listed' and g.dissolved_at is null and g.lifecycle_state = 'active')
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
  'Locality-first index per item.md. Anon-readable. Refreshed synchronously on item.published events at b1. starts_at (T106) carries the earliest item_gatherings occurrence. photo_url resolves items.photo_url, falling back to item_products.photo_urls[1], so feed cards get one image column regardless of kind. The WHERE clause is the public-readable gate (state=published, not deleted, no group OR listed group); MVs do not support RLS. #280: no builder item, and no builder response in response_count. #439: only an active Page''s items; refreshed when a Page changes state.';


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
    and (
      (g.discoverability = 'listed' and g.dissolved_at is null)
      or g.id in (select public.current_member_explicit_group_ids())
    )
    -- #439: what groups_hidden_owner_only says, which this definer reads past
    and (
      g.lifecycle_state in ('draft', 'active')
      or g.id in (select public.current_member_managing_group_ids())
    )
    and (ig.starts_at is null or ig.starts_at >= now())
    and (i.kind <> 'gathering' or ig.starts_at is not null)
  order by ig.starts_at asc nulls last, i.updated_at desc
$$;

create or replace function public.page_listed_member_counts(p_group_ids uuid[])
returns table (group_id uuid, members integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.group_id, count(*)::integer
    from public.member_public_group_memberships v
    join public.groups g on g.id = v.group_id
   where v.group_id = any(p_group_ids)
     and public.builder_relation_visible(v.member_id)
     and (
       g.lifecycle_state in ('draft', 'active')
       or g.id in (select public.current_member_managing_group_ids())
     )
   group by v.group_id
$$;

-- The groups subquery runs as the caller, so the groups policies decide,
-- groups_hidden_owner_only included.
create policy items_page_hidden_owner_only on public.items as restrictive for select
  using (
    group_id is null
    or member_id = (select auth.uid())
    or group_id in (select g.id from public.groups g)
  );

-- The view drops a Page's items the moment its state changes, as it already
-- picks up an item the moment it publishes.
create or replace function public.refresh_discoverable_items_on_page_state()
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

revoke all on function public.refresh_discoverable_items_on_page_state() from public, anon, authenticated;

create trigger trg_refresh_discoverable_items_on_page_state
  after update of lifecycle_state, discoverability, dissolved_at on public.groups
  for each row
  when (
    old.lifecycle_state is distinct from new.lifecycle_state
    or old.discoverability is distinct from new.discoverability
    or old.dissolved_at is distinct from new.dissolved_at
  )
  execute function public.refresh_discoverable_items_on_page_state();
