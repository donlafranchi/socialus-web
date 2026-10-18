-- #941 — Explore's feed read does less per row. Same rows, same order, same visibility (checked on production
-- against the live function, seven read shapes, identical output); about 40% less time per call there
-- (signed in ~500 → ~300 ms; signed out ~75 → ~60 ms). Explore's default read calls it up to five times
-- (browse_nearby, #922), and a search once per pause, so the saving multiplies. What changed, nothing else:
--   - the search documents (to_tsvector over tags and town) are built only while searching (#916 built them for
--     every row of every read);
--   - tag labels are looked up per row by key instead of from aggregated CTEs the planner rescanned row by row,
--     and a Page's tags are not read at all for a signed-out reader, who is never shown them;
--   - builder_visible() runs once per Page (the `live` CTE), not once per Page and again per post;
--   - place_url_path() runs for the rows returned (after the sort and limit), not for every row in scope;
--   - a Page's featured items (#909) are read only for a signed-in search, the one place they are used.
-- Body otherwise featured_items_in_search's (20261019040909), which is what production runs. Same signature and return
-- type, so `create or replace` keeps the grants and the comment.

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

  p_limit         int         default 50,

  -- #796 — 'event' | 'deal' | 'last_minute'; null = every post.
  p_post_kinds    text[]      default null,

  -- #916 — SEARCH. p_search is a to_tsquery('english') string built by src/lib/search/query.ts from the box's
  -- words (letters and digits only, each word OR its synonyms, all words required); p_search_raw is the words
  -- as typed, for the pg_trgm typo fallback. Either given, only matching rows return, best match first, over
  -- every row the reader may see in the scope, not a page of them.
  p_search        text        default null,
  p_search_raw    text        default null,

  -- #922 — Explore's reach: only rows within this many metres of explore_origin(p_metro_id). Null = the whole
  -- scope. Never an origin parameter: the origin is decided here, so nobody can measure a Page from a point
  -- of their choosing (F093 criterion 8 — signed out, no location).
  p_reach_m       double precision default null
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
  ends_at            timestamptz,
  sample_kind        text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origin as (
    select public.explore_origin(p_metro_id) as pt where p_reach_m is not null
  ),
  scope as (
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
  -- #916 — the query, parsed once. Empty (a box of stop words) matches nothing; the typo fallback still runs.
  sq as (
    select case when p_search is not null then to_tsquery('english', p_search) end as q
  ),
  -- #941 — the Pages anyone may browse, decided once. Both branches read it, so builder_visible() runs once per
  -- Page rather than once per Page and again per post.
  --
  -- Belt and braces over RLS. `groups_select_active_or_own_draft` admits a founder's own draft — correct for
  -- their own Page view, wrong for a public index, where a draft must not appear even to its author. RLS is the
  -- access boundary; this is the browse policy. #353/#517: a removal request hides an unclaimed Page everywhere.
  -- THE PERSONAL HALF is withheld here too: 'following' with no set matches nothing, the signed-out answer.
  live as materialized (
    select g.id, g.kind, g.slug, g.name, g.description, g.words_hidden_at, g.words_removed_at,
           g.anchor_location_id, g.photo_url, g.photo_hidden_at, g.photo_removed_at,
           g.picture_url, g.picture_hidden_at, g.picture_removed_at, g.created_at, g.updated_at, g.search_tsv
      from public.groups g
     where g.lifecycle_state = 'active'
       and g.discoverability = 'listed'
       and g.dissolved_at is null
       and g.unclaimed_hidden_at is null
       and public.builder_visible(g.founder_member_id)
       and (p_kinds is null or g.kind = any (p_kinds))
       and (p_created_after is null or g.created_at >= p_created_after)
       and (p_audience = 'public' or g.id = any (coalesce(p_following, array[]::uuid[])))
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
      case when g.words_hidden_at is null and g.words_removed_at is null then g.name else 'Hidden while we look' end as name,
      -- #941 — the place path is built for the rows returned, not for every row in scope (outer select).
      l.place_id            as path_place_id,
      g.photo_url,
      g.photo_hidden_at,
      g.photo_removed_at,
      null::text            as photo_source,
      case when g.words_hidden_at is null and g.words_removed_at is null then g.description end as description,
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
      null::timestamptz     as ends_at,
      null::text            as sample_kind,
      -- #916 — a Page answers by its name and description (unless a report hid its words), and signed in by its
      -- tags and town too: signed out, a tag or town match would say what F093 withholds.
      case when sq.q is not null then ts_rank(pdoc.doc, sq.q) end as search_rank,
      coalesce(pdoc.doc @@ sq.q, false) as search_hit,
      case when p_search_raw is not null then
        word_similarity(p_search_raw, coalesce(case when g.words_hidden_at is null and g.words_removed_at is null then g.name end, '')
          || case when auth.uid() is null then '' else ' ' || coalesce(array_to_string(ptl.labels, ' '), '') || ' ' || coalesce(carried.names, '') end)
      end                   as fuzzy_score
    from live g
    -- INNER: a Page with no anchor Location has no locality and cannot be
    -- scoped to one. Same rule browse_pages applied.
    join public.locations l
      on l.id = g.anchor_location_id
     and l.deleted_at is null
    -- #941 — the Page's visible tag labels by its key (page_tags_pkey), and only for a signed-in reader: signed
    -- out nothing reads them. An aggregated CTE here was rescanned row by row.
    left join lateral (
      select array_agg(t.label order by t.label) as labels
        from public.page_tags pt
        join public.tags t on t.id = pt.tag_id and t.status = 'visible'
       where pt.group_id = g.id
         and auth.uid() is not null
    ) ptl on true
    left join public.places town
      on town.id = l.place_id
    -- #909 — what the Page carries: its featured products and services that anyone may see. #941 — read only
    -- for a signed-in search, the one place it is used.
    left join lateral (
      select string_agg(i.title || ' ' || coalesce(i.description, ''), ' ') as words,
             string_agg(i.title, ' ') as names
        from public.items i
       where i.group_id = g.id
         and (p_search is not null or p_search_raw is not null)
         and auth.uid() is not null
         and i.kind in ('product', 'service')
         and i.state = 'published'
         and i.deleted_at is null
         and i.hidden_at is null
         and i.removed_at is null
    ) carried on true
    cross join sq
    -- #941 — the search document is built only while searching; unsearched, every row paid for a to_tsvector.
    cross join lateral (
      select case when sq.q is null then null
             else case when g.words_hidden_at is null and g.words_removed_at is null then g.search_tsv else ''::tsvector end
               || case when auth.uid() is null then ''::tsvector
                       else setweight(to_tsvector('english', coalesce(array_to_string(ptl.labels, ' '), '') || ' ' || coalesce(town.display_name, '')), 'C') end
               -- #909 — and signed in, what it carries: "milkweed seed" finds the shop. Signed out it would say what F093 withholds.
               || case when auth.uid() is null then ''::tsvector
                       else setweight(to_tsvector('english', coalesce(carried.words, '')), 'B') end
             end as doc
    ) pdoc
    join scope s
      on st_intersects(l.geography, s.geography)
    where (p_result_kinds is null or 'page' = any (p_result_kinds))
      and (p_reach_m is null or st_dwithin(l.geography, (select pt from origin), p_reach_m))
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
      case when g.words_hidden_at is null and g.words_removed_at is null then g.name else 'Hidden while we look' end as name,
      gl.place_id           as path_place_id,
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
      pp.ends_at,
      -- #796 — a seeder sample (#556) is marked as one wherever it shows.
      pp.sample_kind,
      -- #916 — a post answers by its words and its tags (its own, else its Page's).
      case when sq.q is not null then ts_rank(podoc.doc, sq.q) end as search_rank,
      coalesce(podoc.doc @@ sq.q, false) as search_hit,
      case when p_search_raw is not null then word_similarity(p_search_raw, coalesce(array_to_string(coalesce(potl.labels, ptl.labels), ' '), '')) end as fuzzy_score
    from public.page_posts pp
    join live g
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
    -- #941 — the Page's and the post's own visible tag labels, each by its key, as on the Page branch.
    left join lateral (
      select array_agg(t.label order by t.label) as labels
        from public.page_tags pt
        join public.tags t on t.id = pt.tag_id and t.status = 'visible'
       where pt.group_id = g.id
    ) ptl on true
    left join lateral (
      select array_agg(t.label order by t.label) as labels
        from public.post_tags ptg
        join public.tags t on t.id = ptg.tag_id and t.status = 'visible'
       where ptg.post_id = pp.id
    ) potl on true
    cross join sq
    -- #941 — built only while searching, as on the Page branch.
    cross join lateral (
      select case when sq.q is null then null
             else pp.search_tsv
               || setweight(to_tsvector('english', coalesce(array_to_string(coalesce(potl.labels, ptl.labels), ' '), '')), 'C')
             end as doc
    ) podoc
    join scope s
      on st_intersects(coalesce(pl.geography, gl.geography), s.geography)
    where (p_result_kinds is null or 'post' = any (p_result_kinds))
      and (p_reach_m is null or st_dwithin(coalesce(pl.geography, gl.geography), (select pt from origin), p_reach_m))
      -- page_posts answered only signed-in callers when this ran as them.
      and auth.uid() is not null
      and pp.lifecycle_state = 'active'
      and pp.discoverability = 'listed'
      and pp.dissolved_at is null
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
      -- Past posts drop out on their own (F059 acceptance 8) once they END (#814): a market from 8 to 2 is still on
      -- at 8:01. With no end, the start is the end. An undated post has no time to be past, so it always passes.
      -- #314 — a dated post until it ends; an undated one 14 days, or until its show_until.
      and public.post_current_until(pp.created_at, pp.starts_at, pp.ends_at, pp.show_until) >= coalesce(p_now, now())
      -- The time lens holds a post that is ON during the window: it starts before the window closes and has not
      -- ended before it opens. An undated post is outside any window rather than inside every one.
      and (p_starts_from is null or (pp.starts_at is not null and coalesce(pp.ends_at, pp.starts_at) >= p_starts_from))
      and (p_starts_before is null or (pp.starts_at is not null and pp.starts_at < p_starts_before))
      -- #796 (Don, 2026-10-16): the Type filter's post kinds. A sample carries its own; a real post has no kind
      -- field, so a dated one counts as an event. Pages are not narrowed by it.
      and (p_post_kinds is null or coalesce(pp.sample_kind, case when pp.starts_at is not null then 'event' end) = any (p_post_kinds))
  )
  -- #941 — the place path is built after the sort and the limit, for the rows returned only. A subquery rather
  -- than trusting the planner to postpone it: searching, it did not. The order is repeated outside, on the keys
  -- carried out, so nothing depends on a subquery's order.
  select
    r.result_kind,
    r.result_id,
    r.group_id,
    r.group_kind,
    r.slug,
    r.name,
    public.place_url_path(r.path_place_id) as place_path,
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
    r.ends_at,
    r.sample_kind
  from (
    select
      f.*,
      -- #916 — searching, best match first: a matched word ahead of a near spelling, then the full-text rank.
      case when p_search is not null or p_search_raw is not null
           then (case when f.search_hit then 1 + coalesce(f.search_rank, 0) else 0 end) + coalesce(f.fuzzy_score, 0) end as match_score
    from feed_rows f
    -- #916 — searching, a row is in when its words match; when fewer than 5 do, a near spelling of a name or tag
    -- (pg_trgm word_similarity at pg_trgm's own default threshold, 0.3) is in too: "flwers", "nurs".
    where (p_search is null and p_search_raw is null)
       or f.search_hit
       or (f.fuzzy_score >= 0.3 and (select count(*) from feed_rows h where h.search_hit) < 5)
    -- One ordering key, chosen above, so nothing downstream re-sorts and
    -- "filtering preserves server order" stays true. `updated_at desc` is the
    -- tiebreak in every mode, which keeps the order total and therefore stable
    -- across pages.
    order by
      match_score desc nulls last,
      case when p_sort = 'soonest' then f.sort_at end asc nulls last,
      case when p_sort <> 'soonest' then f.sort_at end desc nulls last,
      f.updated_at desc,
      f.result_id
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ) r
  order by
    r.match_score desc nulls last,
    case when p_sort = 'soonest' then r.sort_at end asc nulls last,
    case when p_sort <> 'soonest' then r.sort_at end desc nulls last,
    r.updated_at desc,
    r.result_id;
$$;
