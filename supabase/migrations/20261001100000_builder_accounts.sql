-- #280 — builder accounts on the live app (Don, 2026-10-01). One per test
-- persona. What makes a member a builder lives here and nowhere a client can
-- read: RLS on, no policies, no grants.

create table public.builders (
  member_id   uuid primary key references public.members(id) on delete cascade,
  persona     text not null unique,
  disabled_at timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.builders enable row level security;
revoke all on public.builders from anon, authenticated;

create or replace function public.is_builder(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.builders b where b.member_id = p_member_id)
$$;

create or replace function public.current_member_is_builder()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.is_builder(auth.uid())
$$;

-- True when the caller may see a row owned or made by p_member_id.
create or replace function public.builder_visible(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_member_id is null
      or not public.is_builder(p_member_id)
      or public.current_member_is_builder()
$$;

-- #280 — nothing a builder makes shows to a real member or counts in a
-- number; builders see each other's (Don, 2026-10-01). Two halves:
--
-- 1. Restrictive SELECT policies. They AND with every existing policy, so no
--    current read widens; a builder's rows answer only builders.
-- 2. Everything that runs as its owner bypasses RLS, so each one that reads
--    member content is restated here with the same filter and nothing else
--    changed: browse_feed (as of 20260930240000), announcements_withheld,
--    venue_hosted_items, posted_item_id, group_url_prefixes, and the
--    discoverable_items materialized view, which cannot vary by caller and so
--    drops builder items and builder responses for everyone.

create or replace function public.group_builder_visible(p_group_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.builder_visible(g.founder_member_id) from public.groups g where g.id = p_group_id
$$;

create policy groups_builder_only on public.groups as restrictive for select
  to anon, authenticated using (public.builder_visible(founder_member_id));
create policy page_posts_builder_only on public.page_posts as restrictive for select
  to anon, authenticated using (public.group_builder_visible(group_id));
create policy items_builder_only on public.items as restrictive for select
  to anon, authenticated using (public.builder_visible(member_id));
create policy item_responses_builder_only on public.item_responses as restrictive for select
  to anon, authenticated using (public.builder_visible(responder_member_id));
create policy group_memberships_builder_only on public.group_memberships as restrictive for select
  to anon, authenticated using (public.builder_visible(member_id));
create policy member_follows_builder_only on public.member_follows as restrictive for select
  to anon, authenticated using (public.builder_visible(follower_member_id) and public.builder_visible(followed_member_id));
create policy locations_builder_only on public.locations as restrictive for select
  to anon, authenticated using (public.builder_visible(member_id));

-- page_listed_member_counts: a builder's membership is not a member.
create or replace function public.page_listed_member_counts(p_group_ids uuid[])
returns table (group_id uuid, members integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.group_id, count(*)::integer
    from public.member_public_group_memberships v
   where v.group_id = any(p_group_ids)
     and public.builder_visible(v.member_id)
   group by v.group_id
$$;

create or replace function public.browse_feed(
  -- SCOPE. Exactly one. Explore scopes to a metro (F059 criterion 6);
  -- venue and place reads scope to a Place polygon. Both are ids and never
  -- slugs: two rows in `public.places` currently share the slug 'sacramento'
  -- (a recorded accepted risk), and slug resolution belongs upstream in
  -- resolveFeedMetro / resolveFeedPlace. Neither given, nothing comes back —
  -- an unscoped browse is not a wider browse, it is a bug.
  p_metro_id      uuid        default null,
  p_place_id      uuid        default null,

  -- THE PAGE KIND, as a parameter. Whether SocialUs has two Page kinds or
  -- three is Don's and unruled. Null means every kind, which is the honest
  -- default while it is unruled; the ruling lands as a caller's argument
  -- rather than as a rewrite of this function.
  p_kinds         text[]      default null,

  -- 'page', 'post', or both (null).
  p_result_kinds  text[]      default null,

  -- THE PERSONAL HALF. 'public' is everything the reader may see. Anything
  -- else restricts to p_following, so a signed-out reader (no set) and a
  -- signed-in reader who follows nothing (an empty set) both get zero rows —
  -- from the predicate, in the database. This is what "withheld server-side,
  -- never rendered and hidden" means in SQL.
  --
  -- The predicate is written as `= 'public'` rather than `<> 'following'` on
  -- purpose: a misspelled audience then returns nothing, instead of returning
  -- the entire public feed under a heading that says "from Pages you follow".
  p_audience      text        default 'public',
  p_following     uuid[]      default null,

  -- THE LENS AXES.
  p_tags          text[]      default null,  -- product category
  p_starts_from   timestamptz default null,  -- time window, inclusive
  p_starts_before timestamptz default null,  -- time window, exclusive
  p_created_after timestamptz default null,  -- newly opened here

  -- 'recent' (updated_at desc) | 'soonest' (next occurrence) |
  -- 'newest' (Page created_at desc, the newcomers lens).
  p_sort          text        default 'recent',

  -- The cutoff past-dated posts are judged against. Injectable so the
  -- drop-out rule is testable without waiting for a clock.
  p_now           timestamptz default null,

  p_limit         int         default 50
)
returns table (
  result_kind        text,
  result_id          uuid,
  group_id           uuid,
  group_kind         text,
  slug               text,
  name               text,
  place_path         text,
  photo_url          text,
  photo_hidden_at    timestamptz,
  photo_removed_at   timestamptz,
  description        text,
  body               text,
  tags               text[],
  starts_at          timestamptz,
  location_id        uuid,
  location_label     text,
  location_geography geography,
  page_created_at    timestamptz,
  updated_at         timestamptz,
  sort_at            timestamptz,
  posted_at          timestamptz,
  ends_at            timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scope as (
    -- The one polygon this call is scoped to. A union of two single-row
    -- lookups rather than a branch, so an id that matches nothing yields no
    -- scope row and therefore no results.
    select mp.geography
      from public.metro_polygons mp
     where p_metro_id is not null and mp.id = p_metro_id
    union all
    select pl.geography
      from public.places pl
     where p_place_id is not null
       and pl.id = p_place_id
       and pl.deleted_at is null
  ),
  -- A Page's tags, aggregated once. Hidden tags are excluded here rather than
  -- by the caller: a tag taken down must not keep steering a lens.
  --
  -- `label` is projected (what the creator typed, displayed as written) while
  -- `p_tags` matches on `normalized` — the vocabulary's uniqueness key, so
  -- "Local Food" and "local food" are one tag. Normalising the argument is the
  -- caller's job via normalizeTag(), which is the only implementation of that
  -- rule; a second copy of it in SQL is how the two drift.
  page_tag_labels as (
    select pt.group_id, array_agg(t.label order by t.label) as labels
      from public.page_tags pt
      join public.tags t
        on t.id = pt.tag_id
       and t.status = 'visible'
     group by pt.group_id
  ),
  feed_rows as (
    ----------------------------------------------------------
    -- Pages
    ----------------------------------------------------------
    select
      'page'::text          as result_kind,
      g.id                  as result_id,
      g.id                  as group_id,
      g.kind                as group_kind,
      g.slug,
      g.name,
      public.place_url_path(l.place_id) as place_path,
      g.photo_url,
      g.photo_hidden_at,
      g.photo_removed_at,
      g.description,
      null::text            as body,
      -- F093 criterion 8: signed out, no tags, no location, and no pin.
      case when auth.uid() is null then array[]::text[]
           else coalesce(ptl.labels, array[]::text[]) end as tags,
      null::timestamptz     as starts_at,
      case when auth.uid() is null then null else l.id end    as location_id,
      case when auth.uid() is null then null else l.label end as location_label,
      case when auth.uid() is null then null else l.geography end as location_geography,
      g.created_at          as page_created_at,
      g.updated_at,
      case p_sort
        when 'newest'  then g.created_at
        -- A Page has no start time, so under the time lens it sorts by the
        -- only clock it has. The lens itself excludes Pages via
        -- p_result_kinds when it wants only dated things.
        when 'soonest' then g.updated_at
        else g.updated_at
      end                   as sort_at,
      null::timestamptz     as posted_at,
      null::timestamptz     as ends_at
    from public.groups g
    -- INNER: a Page with no anchor Location has no locality and cannot be
    -- scoped to one. Same rule browse_pages applied.
    join public.locations l
      on l.id = g.anchor_location_id
     and l.deleted_at is null
    left join page_tag_labels ptl
      on ptl.group_id = g.id
    join scope s
      on st_intersects(l.geography, s.geography)
    where (p_result_kinds is null or 'page' = any (p_result_kinds))
      -- Belt and braces over RLS. `groups_select_active_or_own_draft` admits a
      -- founder's own draft — correct for their own Page view, wrong for a
      -- public index, where a draft must not appear even to its author. RLS is
      -- the access boundary; this is the browse policy.
      and g.lifecycle_state = 'active'
      and g.discoverability = 'listed'
      and g.dissolved_at is null
      and public.builder_visible(g.founder_member_id)
      and (p_kinds is null or g.kind = any (p_kinds))
      and (p_created_after is null or g.created_at >= p_created_after)
      and (
        p_tags is null
        -- A signed-out filter on tags would say which tags a Page has.
        or auth.uid() is null
        or exists (
          select 1 from public.page_tags pt2
            join public.tags t2 on t2.id = pt2.tag_id and t2.status = 'visible'
           where pt2.group_id = g.id
             and t2.normalized = any (p_tags)
        )
      )
      -- THE PERSONAL HALF, withheld here. coalesce to an empty array is the
      -- load-bearing part: 'following' with no set matches nothing, which is
      -- exactly the signed-out answer.
      and (
        p_audience = 'public'
        or g.id = any (coalesce(p_following, array[]::uuid[]))
      )

    union all

    ----------------------------------------------------------
    -- Posts
    ----------------------------------------------------------
    select
      'post'::text          as result_kind,
      pp.id                 as result_id,
      g.id                  as group_id,
      g.kind                as group_kind,
      g.slug,
      g.name,
      public.place_url_path(gl.place_id) as place_path,
      g.photo_url,
      g.photo_hidden_at,
      g.photo_removed_at,
      null::text            as description,
      pp.body,
      -- A post carries its owning Page's tags, because posts have no tags of
      -- their own — there is no post_tags table. Stated rather than left to be
      -- inferred: without this, a product-category lens would silently return
      -- Pages and never their posts. If post-level tags ever land, this
      -- becomes the post's own and the lens does not change shape.
      coalesce(ptl.labels, array[]::text[]) as tags,
      pp.starts_at,
      pl.id                 as location_id,
      -- #256 (F072 criterion 3): no address of its own reads as at its Page.
      -- The pin stays its own point (T156).
      coalesce(pl.label, gl.label) as location_label,
      -- The POST's own geography, null when it has none. A post never borrows
      -- its Page's pin (model.md); the Page anchor below is used only to scope
      -- an addressless post to a Place, never projected.
      pl.geography          as location_geography,
      g.created_at          as page_created_at,
      pp.updated_at,
      case p_sort
        when 'newest'  then g.created_at
        when 'soonest' then pp.starts_at
        else pp.updated_at
      end                   as sort_at,
      pp.created_at         as posted_at,
      pp.ends_at
    from public.page_posts pp
    join public.groups g
      on g.id = pp.group_id
    -- The post's own address, when it has one. LEFT, because an addressless
    -- post is a first-class post; an inner join here would re-create the
    -- "only posts with a place" filter page_posts exists to undo.
    left join public.locations pl
      on pl.id = pp.location_id
     and pl.deleted_at is null
    -- The Page's anchor, for scoping an addressless post and for its URL.
    left join public.locations gl
      on gl.id = g.anchor_location_id
     and gl.deleted_at is null
    left join page_tag_labels ptl
      on ptl.group_id = g.id
    join scope s
      on st_intersects(coalesce(pl.geography, gl.geography), s.geography)
    where (p_result_kinds is null or 'post' = any (p_result_kinds))
      -- page_posts answered only signed-in callers when this ran as them.
      and auth.uid() is not null
      and pp.lifecycle_state = 'active'
      and pp.discoverability = 'listed'
      and pp.dissolved_at is null
      and g.lifecycle_state = 'active'
      and g.discoverability = 'listed'
      and g.dissolved_at is null
      and public.builder_visible(g.founder_member_id)
      and (p_kinds is null or g.kind = any (p_kinds))
      and (p_created_after is null or g.created_at >= p_created_after)
      and (
        p_tags is null
        -- A signed-out filter on tags would say which tags a Page has.
        or auth.uid() is null
        or exists (
          select 1 from public.page_tags pt2
            join public.tags t2 on t2.id = pt2.tag_id and t2.status = 'visible'
           where pt2.group_id = g.id
             and t2.normalized = any (p_tags)
        )
      )
      and (
        p_audience = 'public'
        or g.id = any (coalesce(p_following, array[]::uuid[]))
      )
      -- Past-dated posts drop out on their own (F059 acceptance 8). An undated
      -- post has no time to be past, so `starts_at is null` always passes —
      -- that is the clause that keeps "flat" true.
      and (pp.starts_at is null or pp.starts_at >= coalesce(p_now, now()))
      -- The time lens, on top of the drop-out. Both ends independent, and an
      -- undated post is outside any window rather than inside every one.
      and (p_starts_from is null or (pp.starts_at is not null and pp.starts_at >= p_starts_from))
      and (p_starts_before is null or (pp.starts_at is not null and pp.starts_at < p_starts_before))
  )
  select
    r.result_kind,
    r.result_id,
    r.group_id,
    r.group_kind,
    r.slug,
    r.name,
    r.place_path,
    r.photo_url,
    r.photo_hidden_at,
    r.photo_removed_at,
    r.description,
    r.body,
    r.tags,
    r.starts_at,
    r.location_id,
    r.location_label,
    r.location_geography,
    r.page_created_at,
    r.updated_at,
    r.sort_at,
    r.posted_at,
    r.ends_at
  from feed_rows r
  -- One ordering key, chosen above, so nothing downstream re-sorts and
  -- "filtering preserves server order" stays true. `updated_at desc` is the
  -- tiebreak in every mode, which keeps the order total and therefore stable
  -- across pages.
  order by
    case when p_sort = 'soonest' then r.sort_at end asc nulls last,
    case when p_sort <> 'soonest' then r.sort_at end desc nulls last,
    r.updated_at desc,
    r.result_id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

create or replace function public.announcements_withheld(
  p_metro_id     uuid        default null,
  p_place_id     uuid        default null,
  p_group_id     uuid        default null,
  p_period_from  timestamptz default null,
  p_period_to    timestamptz default null,
  p_now          timestamptz default null,
  p_limit        int         default 50
)
returns table (
  -- One row per Page. Which Page, its photo, how many this period, and the
  -- ids its card answers to. Nothing about what was posted, when, or where.
  result_id          uuid,
  group_id           uuid,
  slug               text,
  name               text,
  public_id          text,
  photo_url          text,
  announcement_count int,
  announcement_ids   uuid[],
  updated_at         timestamptz
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with scope as (
    select mp.geography
      from public.metro_polygons mp
     where p_metro_id is not null and mp.id = p_metro_id
    union all
    select pl.geography
      from public.places pl
     where p_place_id is not null
       and pl.id = p_place_id
       and pl.deleted_at is null
  ),
  visible as (
    -- Unchanged from 20260923161500: every clause RLS would have applied,
    -- restated because security definer means RLS is not applying them.
    select pp.id, pp.group_id, pp.updated_at
      from public.page_posts pp
      join public.groups g
        on g.id = pp.group_id
      left join public.locations pl
        on pl.id = pp.location_id
       and pl.deleted_at is null
      left join public.locations gl
        on gl.id = g.anchor_location_id
       and gl.deleted_at is null
     where pp.lifecycle_state = 'active'
       and pp.discoverability = 'listed'
       and pp.dissolved_at is null
       and g.lifecycle_state = 'active'
       and g.discoverability = 'listed'
       and g.dissolved_at is null
       and public.builder_visible(g.founder_member_id)
       and (
         (p_group_id is not null and g.id = p_group_id)
         or (
           p_group_id is null
           and exists (
             select 1 from scope s
              where st_intersects(coalesce(pl.geography, gl.geography), s.geography)
           )
         )
       )
       and (
         p_group_id is not null
         or pp.starts_at is null
         or pp.starts_at >= coalesce(p_now, now())
       )
  ),
  per_page as (
    select
      v.group_id,
      (array_agg(v.id order by v.updated_at desc, v.id))[1] as result_id,
      array_agg(v.id order by v.updated_at desc, v.id)      as announcement_ids,
      max(v.updated_at)                                     as updated_at
    from visible v
    group by v.group_id
  )
  select
    p.result_id,
    g.id,
    g.slug,
    g.name,
    g.public_id,
    case
      when g.photo_hidden_at is null and g.photo_removed_at is null then g.photo_url
    end,
    -- Over created_at and NEVER starts_at: a count by start time lets a caller
    -- sweep the bounds and rebuild when things happen.
    (
      select count(*)::int
        from public.page_posts c
       where c.group_id = g.id
         and c.lifecycle_state = 'active'
         and c.discoverability = 'listed'
         and c.dissolved_at is null
         and (p_period_from is null or c.created_at >= p_period_from)
         and (p_period_to   is null or c.created_at <  p_period_to)
    ),
    p.announcement_ids,
    p.updated_at
  from per_page p
  join public.groups g on g.id = p.group_id
  order by p.updated_at desc, g.id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
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
    and (ig.starts_at is null or ig.starts_at >= now())
    and (i.kind <> 'gathering' or ig.starts_at is not null)
  order by ig.starts_at asc nulls last, i.updated_at desc
$$;

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
     and public.builder_visible(i.member_id)
     and left(i.id::text, 8) = p_id_prefix
   limit 1
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
      or g.id in (select public.current_member_explicit_group_ids())
      or g.id in (select public.current_member_founded_group_ids())
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
      or (g.discoverability = 'listed' and g.dissolved_at is null)
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
  'Locality-first index per item.md. Anon-readable. Refreshed synchronously on item.published events at b1. starts_at (T106) carries the earliest item_gatherings occurrence. photo_url resolves items.photo_url, falling back to item_products.photo_urls[1], so feed cards get one image column regardless of kind. The WHERE clause is the public-readable gate (state=published, not deleted, no group OR listed group); MVs do not support RLS. #280: no builder item, and no builder response in response_count.';


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

-- Who acted, for every builder action the handlers record. Service role only.
create view public.builder_actions as
  select 'member' as stream, e.acting_member_id as member_id, e.event_kind, e.created_at, e.member_id as subject_id
    from public.member_events e join public.builders b on b.member_id = e.acting_member_id
  union all
  select 'group', e.acting_member_id, e.event_kind, e.created_at, e.group_id
    from public.group_events e join public.builders b on b.member_id = e.acting_member_id
  union all
  select 'item', e.acting_member_id, e.event_kind, e.created_at, e.item_id
    from public.item_events e join public.builders b on b.member_id = e.acting_member_id
  union all
  select 'location', e.acting_member_id, e.event_kind, e.created_at, e.location_id
    from public.location_events e join public.builders b on b.member_id = e.acting_member_id;
revoke all on public.builder_actions from anon, authenticated;
