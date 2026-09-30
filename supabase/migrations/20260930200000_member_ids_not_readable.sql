-- bug #253 — who founded, sells or hosts something answers nobody but that
-- member, and no item card names its seller.
--
-- Spec anchors (ops-pattern/DECISIONS.md, 2026-09-30, Don on #246):
--   A signed-in stranger can read no member field; people see only what a
--     member posts on a Page or in an announcement.
--   A Page's front door shows no founder or seller.
--
-- After #249 no member row is readable, but groups.founder_member_id (to
-- authenticated), items.member_id and item_gatherings.host_member_id (to
-- anyone) still tied a member to what they made, and discoverable_items and
-- three feed functions still named sellers.
--
-- APPLY AFTER #249 IS MERGED. Until this PR's code is live, an item posted
-- without a Page 404s (the resolver it replaces reads items.member_id), and a
-- member's own Pages list and sell draft read empty.

-- 1. An owner's own, read as the owner.
create or replace function public.current_member_founded_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.id from public.groups g where g.founder_member_id = auth.uid()
$$;

create or replace function public.current_member_item_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id from public.items i where i.member_id = auth.uid()
$$;

revoke all on function public.current_member_founded_group_ids() from public;
revoke all on function public.current_member_item_ids() from public;
grant execute on function public.current_member_founded_group_ids() to anon, authenticated;
grant execute on function public.current_member_item_ids() to anon, authenticated;

-- 2. Policies that asked those columns from another table did so as the
-- caller, so they would refuse every read once the column goes.
alter policy page_posts_select_own on public.page_posts
  using (group_id in (select public.current_member_founded_group_ids()));

alter policy "page_tags write by founder" on public.page_tags
  using (group_id in (select public.current_member_founded_group_ids()))
  with check (group_id in (select public.current_member_founded_group_ids()));

alter policy "group_category_suggestions read by author or group founder" on public.group_category_suggestions
  using (member_id = auth.uid() or group_id in (select public.current_member_founded_group_ids()));

alter policy item_events_select_item_owner on public.item_events
  using (item_id in (select public.current_member_item_ids()));

-- 3. The columns. RLS is row-level, so SELECT is rebuilt as every column but
-- the one (the #241 pattern). A column added later is invisible until
-- granted; tests/member-ids-db.test.ts fails on that. Quals on a table's own
-- columns are not checked against column grants, so its own policies stay.
do $$
declare
  t record;
  cols text;
begin
  for t in
    select * from (values
      ('groups', 'founder_member_id', 'anon, authenticated'),
      ('items', 'member_id', 'anon, authenticated'),
      ('item_gatherings', 'host_member_id', 'anon, authenticated')
    ) as v(tbl, col, roles)
  loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
      into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t.tbl and column_name <> t.col;
    execute format('revoke select on public.%I from %s', t.tbl, t.roles);
    execute format('grant select (%s) on public.%I to %s', cols, t.tbl, t.roles);
  end loop;
end
$$;

-- 4. Item cards. discoverable_items is a materialized view, which RLS never
-- reaches; its grant loses the member id and name. The handle stays: an item
-- posted without a Page carries it in its URL, and the cards link there.
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

-- The feeds keep their shape; the seller's name is null.
CREATE OR REPLACE FUNCTION public.locality_feed_items(p_place_id uuid, p_tags text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50)
 RETURNS TABLE(item_id uuid, member_handle text, member_display_name text, item_kind text, title text, category text, brand_label text, group_id uuid, nearest_location_label text, response_count bigint, primary_tag text, photo_url text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    di.item_id,
    di.member_handle,
    null::text,  -- #253: no seller name
    di.item_kind,
    di.title,
    di.category,
    di.brand_label,
    di.group_id,
    di.nearest_location_label,
    di.response_count,
    di.primary_tag,
    di.photo_url,
    di.published_at
  from public.discoverable_items di
  join public.places p
    on p.id = p_place_id
   and p.deleted_at is null
  where di.nearest_location_geography is not null
    and st_intersects(di.nearest_location_geography, p.geography)
    -- T106: only upcoming items surface. Non-gathering items (starts_at null)
    -- pass; past gatherings are excluded; dateless gatherings are excluded.
    and (di.starts_at is null or di.starts_at >= now())
    and (di.item_kind <> 'gathering' or di.starts_at is not null)
  order by
    case
      when p_tags is not null
       and cardinality(p_tags) > 0
       and di.primary_tag = any (p_tags)
      then 0 else 1
    end,
    di.starts_at asc nulls last,
    di.published_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$function$;

CREATE OR REPLACE FUNCTION public.venue_nearby_items(p_location_id uuid, p_owning_group_id uuid, p_radius_m double precision DEFAULT 5000)
 RETURNS TABLE(item_id uuid, member_handle text, member_display_name text, item_kind text, title text, category text, brand_label text, group_id uuid, nearest_location_label text, response_count bigint, primary_tag text, photo_url text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    di.item_id,
    di.member_handle,
    null::text,  -- #253: no seller name
    di.item_kind,
    di.title,
    di.category,
    di.brand_label,
    di.group_id,
    di.nearest_location_label,
    di.response_count,
    di.primary_tag,
    di.photo_url,
    di.published_at
  from public.discoverable_items di
  join public.locations v
    on v.id = p_location_id
   and v.deleted_at is null
  where di.nearest_location_geography is not null
    and st_dwithin(di.nearest_location_geography, v.geography, p_radius_m)
    and (p_owning_group_id is null or di.group_id is distinct from p_owning_group_id)
    -- T106: only upcoming items. Past gatherings excluded; non-gathering items
    -- (starts_at null) pass; dateless gatherings excluded.
    and (di.starts_at is null or di.starts_at >= now())
    and (di.item_kind <> 'gathering' or di.starts_at is not null)
  order by st_distance(di.nearest_location_geography, v.geography) asc,
           di.starts_at asc nulls last,
           di.published_at desc
  limit 20;
$function$;

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
    and (
      (g.discoverability = 'listed' and g.dissolved_at is null)
      or g.id in (select public.current_member_explicit_group_ids())
    )
    and (ig.starts_at is null or ig.starts_at >= now())
    and (i.kind <> 'gathering' or ig.starts_at is not null)
  order by ig.starts_at asc nulls last, i.updated_at desc
$$;

-- 5. An item posted without a Page, from its URL: the handle and the id
-- fragment together, so it names one item and never lists a member's.
create or replace function public.posted_item_id(p_handle text, p_kind text, p_id_prefix text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id
    from public.items i
    join public.members m on m.id = i.member_id
   where m.handle = p_handle
     and m.deleted_at is null
     and m.login_disabled = false
     and i.kind = p_kind
     and i.group_id is null
     and i.state = 'published'
     and i.deleted_at is null
     and left(i.id::text, 8) = p_id_prefix
   limit 1
$$;

revoke all on function public.posted_item_id(text, text, text) from public;
grant execute on function public.posted_item_id(text, text, text) to anon, authenticated;

-- The name lookup it replaces: an item posted without a Page names no poster.
drop function if exists public.post_author_public(text);
