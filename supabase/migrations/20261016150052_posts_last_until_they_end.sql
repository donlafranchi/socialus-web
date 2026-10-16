-- #814 — a post stays in Explore and "What's new" until it ENDS, not until it starts. browse_feed and
-- announcements_withheld dropped a dated post at starts_at, ignoring ends_at, so a market from 8 to 2 was gone at
-- 8:01 and every multi-day deal vanished on its first day (261 of 420 live posts on 2026-10-15). Both now keep a
-- post until coalesce(ends_at, starts_at); the time windows hold a post that is on during them. Nothing else changes:
-- browse_feed is the 20261009010000 definition with those two clauses, announcements_withheld the 20261001100000 one.

drop function public.browse_feed(
  uuid, uuid, text[], text[], text, uuid[], text[],
  timestamptz, timestamptz, timestamptz, text, timestamptz, int
);

create function public.browse_feed(
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
  photo_source       text,
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
  -- #286 — a post's own tags, the same way.
  post_tag_labels as (
    select ptg.post_id, array_agg(t.label order by t.label) as labels
      from public.post_tags ptg
      join public.tags t
        on t.id = ptg.tag_id
       and t.status = 'visible'
     group by ptg.post_id
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
      null::text            as photo_source,
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
      -- #353/#517: a removal request hides an unclaimed Page everywhere, Explore included
      and g.unclaimed_hidden_at is null
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
      -- F099 criterion 6/7: the ONE image a post card shows, resolved here so a
      -- hidden or removed URL never reaches the browser: the post's own visible
      -- photo, else the Page's visible Page picture, else null (the kind's
      -- placeholder is drawn by the card). The Page's own photo is not a post's
      -- image. hidden/removed are therefore always null on a post row.
      case
        when pp.photo_url is not null and pp.photo_hidden_at is null and pp.photo_removed_at is null
          then pp.photo_url
        when g.picture_url is not null and g.picture_hidden_at is null and g.picture_removed_at is null
          then g.picture_url
      end                   as photo_url,
      null::timestamptz     as photo_hidden_at,
      null::timestamptz     as photo_removed_at,
      case
        when pp.photo_url is not null and pp.photo_hidden_at is null and pp.photo_removed_at is null then 'post'
        when g.picture_url is not null and g.picture_hidden_at is null and g.picture_removed_at is null then 'page'
      end                   as photo_source,
      null::text            as description,
      pp.body,
      -- #286 — a post's own tags, or its Page's when it has none, so a lens
      -- never silently returns Pages and not their posts.
      coalesce(potl.labels, ptl.labels, array[]::text[]) as tags,
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
    left join post_tag_labels potl
      on potl.post_id = pp.id
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
      -- #353/#517: a removal request hides an unclaimed Page everywhere, Explore included
      and g.unclaimed_hidden_at is null
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
        -- #286 — or by the post's own.
        or exists (
          select 1 from public.post_tags pt3
            join public.tags t3 on t3.id = pt3.tag_id and t3.status = 'visible'
           where pt3.post_id = pp.id
             and t3.normalized = any (p_tags)
        )
      )
      and (
        p_audience = 'public'
        or g.id = any (coalesce(p_following, array[]::uuid[]))
      )
      -- Past posts drop out on their own (F059 acceptance 8) once they END (#814): a market from 8 to 2 is still on
      -- at 8:01. With no end, the start is the end. An undated post has no time to be past, so it always passes.
      and (pp.starts_at is null or coalesce(pp.ends_at, pp.starts_at) >= coalesce(p_now, now()))
      -- The time lens holds a post that is ON during the window: it starts before the window closes and has not
      -- ended before it opens. An undated post is outside any window rather than inside every one.
      and (p_starts_from is null or (pp.starts_at is not null and coalesce(pp.ends_at, pp.starts_at) >= p_starts_from))
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
    r.photo_source,
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

comment on function public.browse_feed(
  uuid, uuid, text[], text[], text, uuid[], text[],
  timestamptz, timestamptz, timestamptz, text, timestamptz, int
) is
  'The browse read source (T156), superseding browse_pages and browse_posts. Returns Pages and posts together, one discriminated row shape, scoped to one metro OR one Place polygon by id. Every axis Browse varies is a parameter: Page kind (NEVER a constant — the two-or-three-kinds question is unruled), result kind, tags, a start-time window, Page creation recency, and the sort. p_tags matches tags.normalized (normalise with normalizeTag() before calling) while the projected tags are the creators'' own labels. The personal half is a predicate: p_audience=''following'' restricts to p_following, so a signed-out reader gets nothing from the database rather than from a client filter (F059 criteria 2b/2c). Withholds drafts, unlisted and dissolved Pages and posts, and drops a dated post once it has ended (its end, else its start; #814); undated posts never drop. A post projects its OWN geography (null when it has none) and its own tags (#286), else its owning Page''s. A post with no address of its own is labelled with its Page''s location (#256, F072 criterion 3), and carries posted_at, its created_at, and ends_at, its optional end (#262), and photo_url / photo_source, the ONE image of a post resolved here (F099): its own visible photo, else the Page''s visible Page picture, else null. Signed out it runs with no location, tags or posts (#252). NO cost parameter: free/priced is an open decision and there is no price on a Page or a post. Ordering carries locality and recency, never payment and never what holds attention.';

revoke all on function public.browse_feed(
  uuid, uuid, text[], text[], text, uuid[], text[],
  timestamptz, timestamptz, timestamptz, text, timestamptz, int
) from public;

grant execute on function public.browse_feed(
  uuid, uuid, text[], text[], text, uuid[], text[],
  timestamptz, timestamptz, timestamptz, text, timestamptz, int
) to anon, authenticated;

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
         or coalesce(pp.ends_at, pp.starts_at) >= coalesce(p_now, now())
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
