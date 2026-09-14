-- T154 (#51) — a Page-grain read source for browse.
--
-- Replaces the shape T127 assumed. That ticket widened `locality_feed_items`
-- by three columns; the columns were right and the grain was wrong.
-- `discoverable_items` is keyed `unique_idx_discoverable_items (item_id)` —
-- one row per Item — and per product/foundation/model.md (Don, 2026-09-10)
-- there are no Items. What a creator offers is described on their Page.
--
-- Browse indexes Pages. This is that read, at Page grain.
--
-- NOT IN SCOPE, and deliberately absent: posts. Browse also finds posts —
-- flat, not only dated ones (ruled 2026-09-12) — but `page_posts` does not
-- exist. That source is its own migration once the post mechanism lands.
--
-- `locality_feed_items` is untouched. The venue surface and other place-grain
-- Item reads still use it; this is a second path alongside, not a replacement.

------------------------------------------------------------
-- browse_pages — Pages within a Place, most recently updated first.
------------------------------------------------------------

create or replace function public.browse_pages(
  p_place_id uuid,
  p_category text default null,
  p_limit    int  default 50
)
returns table (
  group_id               uuid,
  slug                   text,
  name                   text,
  category               text,
  description            text,
  photo_url              text,
  anchor_location_id     uuid,
  anchor_location_label  text,
  anchor_location_geography geography,
  updated_at             timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    g.id            as group_id,
    g.slug,
    g.name,
    g.category,
    g.description,
    g.photo_url,
    l.id            as anchor_location_id,
    l.label         as anchor_location_label,
    l.geography     as anchor_location_geography,
    g.updated_at
  from public.groups g
  join public.locations l
    on l.id = g.anchor_location_id
   and l.deleted_at is null
  join public.places p
    on p.id = p_place_id
   and p.deleted_at is null
  where l.geography is not null
    and st_intersects(l.geography, p.geography)
    -- Belt and braces. RLS (groups_select_active_or_own_draft) is the floor,
    -- but it admits a founder's own draft — correct for their own Page view,
    -- wrong for a public index, where a draft must not appear even to its
    -- author. This clause is the browse policy; RLS is the access boundary.
    and g.lifecycle_state = 'active'
    and g.discoverability = 'listed'
    and g.dissolved_at is null
    and (p_category is null or g.category = p_category)
  -- Locality is the predicate above; recency is the order. NO interest-tag
  -- boost: browse is complete and is not ranked by the member's interests
  -- (ruled 2026-09-12) — interest-ranking a complete surface is how a member
  -- stops trusting it is complete. That boost belongs to Home, which is not
  -- this function's consumer. Never payment.
  order by g.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.browse_pages(uuid, text, int) is
  'Page-grain browse source (T154). Returns Pages whose anchor Location falls inside the given Place, most recently updated first, optionally filtered to one category. Projects identity (slug, name, photo), category, description for free-text search, and the anchor geography for map pins; the URL prefix is attached by the caller via group_url_prefixes. Ordering carries no interest-tag boost by design — browse is complete and unranked by member interest; that boost is Home''s. Posts are NOT included: browse indexes them too, but page_posts does not exist yet.';

revoke all on function public.browse_pages(uuid, text, int) from public;
grant execute on function public.browse_pages(uuid, text, int) to anon, authenticated;
