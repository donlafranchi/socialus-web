-- #246 (the audit of what one member can read about another, 2026-10-07):
-- two routes were still open after #249, #253 and #469.
-- Path: well-worn — a name is never reachable by browsing (Don's rule,
-- 2026-09-14), a Page's front door shows no founder or seller and a signed-in
-- stranger reads no member field (rulings 2026-09-30); Facebook and Etsy list a
-- shop's items under the shop, not under whoever typed them in.
--
-- 1. A seller's handle ("rosa-delgado") was readable by anyone, signed out
--    included, on every item: discoverable_items.member_handle, and the venue
--    and feed lists that project it. member_id and member_display_name were
--    already withheld; the handle is a name. It is withheld the same way. The
--    lists give a handle only for an item posted WITHOUT a Page, whose URL
--    (/m/<handle>/...) carries it by design, through a function that says so.
--    A Page's items are addressed by their Page.
--
-- 2. The media bucket's file list was readable by anyone: its top-level folders
--    are every uploader's member id. A public bucket serves a file by its URL
--    without any read policy, so the blanket "public read" goes; an uploader
--    keeps reading (and so replacing and removing) their own folder.
--
-- ORDER: after the latest applied migration (it restates nothing
-- this changes).

------------------------------------------------------------
-- 1. Seller handles
------------------------------------------------------------

revoke select (member_handle) on public.discoverable_items from anon, authenticated;

-- The handle of an item posted without a Page, and only of a published one the
-- list already shows. Definer, because the column above is no longer readable.
create function public.item_front_door_handle(p_item_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.handle
    from public.items i
    join public.members m on m.id = i.member_id and m.deleted_at is null
   where i.id = p_item_id
     and i.group_id is null
     and public.builder_visible(i.member_id)
     and exists (select 1 from public.discoverable_items di where di.item_id = i.id)
$$;

revoke all on function public.item_front_door_handle(uuid) from public;
grant execute on function public.item_front_door_handle(uuid) to anon, authenticated;

comment on function public.item_front_door_handle(uuid) is
  '#246: the handle of the member who posted a published item WITHOUT a Page, null for anything filed under a Page. The item''s URL (/m/<handle>/...) carries it by design; a Page''s items are addressed by the Page and name no seller.';

CREATE OR REPLACE FUNCTION public.venue_nearby_items(p_location_id uuid, p_owning_group_id uuid, p_radius_m double precision DEFAULT 5000)
 RETURNS TABLE(item_id uuid, member_handle text, member_display_name text, item_kind text, title text, category text, brand_label text, group_id uuid, nearest_location_label text, response_count bigint, primary_tag text, photo_url text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    di.item_id,
    -- #246: only an item posted without a Page names its poster, as its URL does;
    -- what a Page lists never names its seller.
    public.item_front_door_handle(di.item_id),
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

CREATE OR REPLACE FUNCTION public.locality_feed_items(p_place_id uuid, p_tags text[] DEFAULT NULL::text[], p_limit integer DEFAULT 50)
 RETURNS TABLE(item_id uuid, member_handle text, member_display_name text, item_kind text, title text, category text, brand_label text, group_id uuid, nearest_location_label text, response_count bigint, primary_tag text, photo_url text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    di.item_id,
    public.item_front_door_handle(di.item_id),  -- #246
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

CREATE OR REPLACE FUNCTION public.venue_hosted_items(p_location_id uuid, p_owning_group_id uuid)
 RETURNS TABLE(item_id uuid, member_handle text, member_display_name text, item_kind text, title text, category text, brand_label text, group_id uuid, nearest_location_label text, response_count bigint, primary_tag text, photo_url text, published_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
  select
    i.id,
    -- #246: a Page's hosted items are all filed under it; its listing names no seller.
    null::text,
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
$function$;

------------------------------------------------------------
-- 2. The media bucket
------------------------------------------------------------

drop policy "media public read" on storage.objects;

create policy "media authenticated read own folder"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
