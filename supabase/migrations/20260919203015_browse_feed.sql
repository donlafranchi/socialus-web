-- T156 (#53) — one browse read source, server-side, for Explore.
--
-- Spec anchors:
--   planning/scenario-F059.md              (approved 2026-09-14, amended and
--                                           re-approved 2026-09-17)
--   DECISIONS.md 2026-09-17                (Browse is a showcase; the personal
--                                           half is withheld SERVER-SIDE)
--   DECISIONS.md 2026-09-17                ("Newcomers" means newly opened Pages)
--   product/foundation/model.md            § Browse is everything
--   planning/adrs/ADR-0007-action-layer.md (reads only; writes elsewhere)
--
-- WHAT THIS REPLACES, AND WHY IT IS ONE FUNCTION INSTEAD OF TWO.
--
-- `browse_pages` (T154) and `browse_posts` (T162) were the right grain and the
-- wrong number. Both are dropped here. Neither had a single consumer, and
-- between them they could not answer any of the four questions Browse now has
-- to ask of the same corpus — which is the tell that they were one function.
--
--   * Browse shows **Pages and posts together** (F059 criterion 2). Two
--     functions means the caller interleaves two result sets and re-sorts
--     them, which is the ordering question #51 and #53 both recorded as open,
--     answered by accident in a client.
--   * Browse carries **curated lenses as horizontally scrolling rows** — on
--     today, local food, newly opened here. **Each lens is one call of this
--     function with different arguments**, which is what makes "the row hides
--     rather than showing an empty row" a count of zero rather than a second
--     query per lens.
--   * Signed in, Browse also carries **that person's own announcements and
--     upcoming things; signed out, that half is absent** — and absent
--     server-side, never rendered and hidden (F059 criteria 2b/2c). That is
--     `p_audience`/`p_following` below, and it is a predicate, not a filter
--     some caller is trusted to apply.
--
-- `locality_feed_items` is NOT touched. Home is paused with its capability
-- preserved (Don, 2026-09-17) and that function is the only place-scoping and
-- interest-ordering in the app.
--
-- WHAT IS NOT HERE, DELIBERATELY: a cost parameter. "Free things" is the
-- fourth lens axis and there is no price or cost column anywhere on a Page or
-- a post — the only one in the schema is `item_products.price_cents`, on the
-- noun model.md says does not exist. Don still owes that decision. A parameter
-- with nothing behind it would read, in every future grep, as built.
--
-- ORDERING carries locality and recency. It may in principle carry community
-- response and does not today, because no Page or post has a response count.
-- It **never** carries payment, and never what holds attention.

------------------------------------------------------------
-- 1. Drop the two superseded sources, in this migration.
------------------------------------------------------------
-- The repo's convention: a replaced signature is dropped in the same change so
-- two overloads can never coexist. These have no callers — verified by grep
-- across src/ before writing this — and their TypeScript helpers are deleted
-- in the same commit.

drop function if exists public.browse_pages(uuid, text, int);
drop function if exists public.browse_posts(uuid, timestamptz, int);

------------------------------------------------------------
-- 2. browse_feed
------------------------------------------------------------

drop function if exists public.browse_feed(
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
  description        text,
  body               text,
  tags               text[],
  starts_at          timestamptz,
  location_id        uuid,
  location_label     text,
  location_geography geography,
  page_created_at    timestamptz,
  updated_at         timestamptz,
  sort_at            timestamptz
)
language sql
stable
security invoker
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
      coalesce(ptl.labels, array[]::text[]) as tags,
      null::timestamptz     as starts_at,
      l.id                  as location_id,
      l.label               as location_label,
      l.geography           as location_geography,
      g.created_at          as page_created_at,
      g.updated_at,
      case p_sort
        when 'newest'  then g.created_at
        -- A Page has no start time, so under the time lens it sorts by the
        -- only clock it has. The lens itself excludes Pages via
        -- p_result_kinds when it wants only dated things.
        when 'soonest' then g.updated_at
        else g.updated_at
      end                   as sort_at
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
      and (p_kinds is null or g.kind = any (p_kinds))
      and (p_created_after is null or g.created_at >= p_created_after)
      and (
        p_tags is null
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
      pl.label              as location_label,
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
      end                   as sort_at
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
      and pp.lifecycle_state = 'active'
      and pp.discoverability = 'listed'
      and pp.dissolved_at is null
      and g.lifecycle_state = 'active'
      and g.discoverability = 'listed'
      and g.dissolved_at is null
      and (p_kinds is null or g.kind = any (p_kinds))
      and (p_created_after is null or g.created_at >= p_created_after)
      and (
        p_tags is null
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
    r.sort_at
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
  'The browse read source (T156), superseding browse_pages and browse_posts. Returns Pages and posts together, one discriminated row shape, scoped to one metro OR one Place polygon by id. Every axis Browse varies is a parameter: Page kind (NEVER a constant — the two-or-three-kinds question is unruled), result kind, tags, a start-time window, Page creation recency, and the sort. p_tags matches tags.normalized (normalise with normalizeTag() before calling) while the projected tags are the creators'' own labels. The personal half is a predicate: p_audience=''following'' restricts to p_following, so a signed-out reader gets nothing from the database rather than from a client filter (F059 criteria 2b/2c). Withholds drafts, unlisted and dissolved Pages and posts, and drops past-dated posts; undated posts never drop. A post projects its OWN geography (null when it has none) and its owning Page''s tags, because posts carry no tags of their own. NO cost parameter: free/priced is an open decision and there is no price on a Page or a post. Ordering carries locality and recency, never payment and never what holds attention.';

revoke all on function public.browse_feed(
  uuid, uuid, text[], text[], text, uuid[], text[],
  timestamptz, timestamptz, timestamptz, text, timestamptz, int
) from public;

grant execute on function public.browse_feed(
  uuid, uuid, text[], text[], text, uuid[], text[],
  timestamptz, timestamptz, timestamptz, text, timestamptz, int
) to anon, authenticated;

------------------------------------------------------------
-- 3. Supporting index
------------------------------------------------------------
-- The newcomers lens orders Pages by creation, scoped to a place, active and
-- listed. That is a different predicate from every existing groups index
-- (kind, anchor, founder), and it is the one lens Don called load-bearing for
-- supply — before anyone follows a brand-new Page it is the only way that Page
-- is seen at all.

create index if not exists idx_groups_browse_created
  on public.groups (created_at desc)
  where lifecycle_state = 'active'
    and discoverability = 'listed'
    and dissolved_at is null;
