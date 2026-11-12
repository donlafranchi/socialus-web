-- F134 (#1275) — visitors without an account read what a signed-in member
-- with no relation to the Page reads; every write still needs an account.
--
-- Spec: socialus-plan planning/scenario-F134.md, its two 2026-11-12 rulings.
-- Replaces F093's signed-out withholding (20260923161500, 20260930210000).
--
-- THE ONE RULE. `anon` gets exactly the read a stranger on `authenticated`
-- gets. Every predicate below is the one a stranger already passes; nothing
-- here invents a new visibility rule. Policies that test `auth.uid()` for an
-- own row (hearts, saves, follows, members, own drafts) are left alone: they
-- admit nobody anonymous, which is a stranger's answer too.
--
-- WHAT STAYS PRIVATE (the second ruling, [member-data-disclosure]):
--   * `members` — still `members_select_self` only (#178).
--   * a private Page's contents — `groups`/`page_posts` predicates unchanged.
--   * location precision — an area anchor is still an area; no new column.
--   * contact phone — "members" by default (2026-10-07), so `contact_phone`
--     is the one `groups` column `anon` still does not get.
--   * names and avatars — the definer functions that return them answer
--     `anon` with nulls and keep the counts (section 4).

------------------------------------------------------------
-- 1. Policies a stranger passes now admit `anon` too.
--    The `using` clauses are unchanged; only the role list moves.
------------------------------------------------------------
alter policy page_posts_select_published on public.page_posts to anon, authenticated;
alter policy locations_public_read on public.locations to anon, authenticated;
alter policy location_permanent_public_read on public.location_permanent to anon, authenticated;
alter policy location_recurring_temporary_public_read on public.location_recurring_temporary to anon, authenticated;
alter policy location_areas_public_read on public.location_areas to anon, authenticated;
alter policy "tags select visible" on public.tags to anon, authenticated;
alter policy "page_tags select with its page" on public.page_tags to anon, authenticated;
alter policy post_tags_select_with_post on public.post_tags to anon, authenticated;
-- Stops and service areas were `using (true)`: any signed-in reader saw every Page's, drafts, private and builder
-- Pages included. Opened to the internet, they follow their Page instead, as page_tags does (review of #1278):
-- the `groups` policies, run as the caller, decide which Page's stops and areas exist for them.
alter policy page_stops_select_signed_in on public.page_stops to anon, authenticated
  using (exists (select 1 from public.groups g where g.id = page_stops.group_id));
alter policy page_service_areas_select_signed_in on public.page_service_areas to anon, authenticated
  using (exists (select 1 from public.groups g where g.id = page_service_areas.group_id));
alter policy app_settings_select_signed_in on public.app_settings to anon, authenticated;

------------------------------------------------------------
-- 2. Column grants: `anon` gets the columns `authenticated` reads on these
--    tables, read from the catalogue so a column added later by a grant to
--    both roles stays in step. `groups.contact_phone` is held back (above).
------------------------------------------------------------
do $$
declare
  t text;
  cols text;
begin
  foreach t in array array['groups', 'locations', 'location_permanent', 'location_recurring_temporary',
                           'location_areas', 'tags', 'page_tags', 'post_tags', 'page_stops', 'page_service_areas']
  loop
    select string_agg(quote_ident(cp.column_name), ', ')
      into cols
      from information_schema.column_privileges cp
     where cp.table_schema = 'public'
       and cp.table_name = t
       and cp.grantee = 'authenticated'
       and cp.privilege_type = 'SELECT'
       and not (t = 'groups' and cp.column_name = 'contact_phone');
    if cols is not null then
      execute format('grant select (%s) on public.%I to anon', cols, t);
    end if;
  end loop;
end
$$;

------------------------------------------------------------
-- 3. No anonymous write, anywhere in `public` (F134.5).
--    RLS already refused every one (no write policy admits `anon`); this
--    takes the privilege away too, so a policy added later cannot open one by
--    accident. Signed-out actions that do write (the waitlist, sign-up) go
--    through security-definer functions and are unaffected.
------------------------------------------------------------
revoke insert, update, delete, truncate on all tables in schema public from anon;
alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;

------------------------------------------------------------
-- 4. Definer functions that answered only signed-in callers, or answered
--    `anon` with names. Each is the live definition with the signed-out
--    branch removed and, where it returns a member's name or avatar, a null
--    for `anon` (F134.7). Counts are untouched.
------------------------------------------------------------

-- browse_feed: no more signed-out branch. Tags, place, pin and the post
-- branch come back for `anon`; browse_happening and browse_nearby call it.
CREATE OR REPLACE FUNCTION public.browse_feed(p_metro_id uuid DEFAULT NULL::uuid, p_place_id uuid DEFAULT NULL::uuid, p_kinds text[] DEFAULT NULL::text[], p_result_kinds text[] DEFAULT NULL::text[], p_audience text DEFAULT 'public'::text, p_following uuid[] DEFAULT NULL::uuid[], p_tags text[] DEFAULT NULL::text[], p_starts_from timestamp with time zone DEFAULT NULL::timestamp with time zone, p_starts_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_sort text DEFAULT 'recent'::text, p_now timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limit integer DEFAULT 50, p_post_kinds text[] DEFAULT NULL::text[], p_search text DEFAULT NULL::text, p_search_raw text DEFAULT NULL::text, p_reach_m double precision DEFAULT NULL::double precision)
 RETURNS TABLE(result_kind text, result_id uuid, group_id uuid, group_kind text, slug text, name text, place_path text, photo_url text, photo_hidden_at timestamp with time zone, photo_removed_at timestamp with time zone, photo_source text, description text, body text, tags text[], starts_at timestamp with time zone, location_id uuid, location_label text, location_geography geography, page_created_at timestamp with time zone, updated_at timestamp with time zone, sort_at timestamp with time zone, posted_at timestamp with time zone, ends_at timestamp with time zone, sample_kind text, post_kind text, headline text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      -- F134 — signed out reads the tags, the place and the pin a signed-in stranger reads.
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
      end                   as sort_at,
      null::timestamptz     as posted_at,
      null::timestamptz     as ends_at,
      null::text            as sample_kind,
      null::text            as post_kind,
      null::text            as headline,
      -- #916 — a Page answers by its name and description (unless a report hid its words), its tags and town.
      case when sq.q is not null then ts_rank(pdoc.doc, sq.q) end as search_rank,
      coalesce(pdoc.doc @@ sq.q, false) as search_hit,
      case when p_search_raw is not null then
        word_similarity(p_search_raw, coalesce(case when g.words_hidden_at is null and g.words_removed_at is null then g.name end, '')
          || ' ' || coalesce(array_to_string(ptl.labels, ' '), '') || ' ' || coalesce(carried.names, ''))
      end                   as fuzzy_score
    from live g
    -- INNER: a Page with no anchor Location has no locality and cannot be
    -- scoped to one. Same rule browse_pages applied.
    join public.locations l
      on l.id = g.anchor_location_id
     and l.deleted_at is null
    -- #941 — the Page's visible tag labels by its key (page_tags_pkey).
    -- An aggregated CTE here was rescanned row by row.
    left join lateral (
      select array_agg(t.label order by t.label) as labels
        from public.page_tags pt
        join public.tags t on t.id = pt.tag_id and t.status = 'visible'
       where pt.group_id = g.id
    ) ptl on true
    left join public.places town
      on town.id = l.place_id
    -- #909 — what the Page carries: its featured products and services that anyone may see. #941 — read only
    -- for a search, the one place it is used.
    left join lateral (
      select string_agg(i.title || ' ' || coalesce(i.description, ''), ' ') as words,
             string_agg(i.title, ' ') as names
        from public.items i
       where i.group_id = g.id
         and (p_search is not null or p_search_raw is not null)
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
               || setweight(to_tsvector('english', coalesce(array_to_string(ptl.labels, ' '), '') || ' ' || coalesce(town.display_name, '')), 'C')
               -- #909 — and what it carries: "milkweed seed" finds the shop.
               || setweight(to_tsvector('english', coalesce(carried.words, '')), 'B')
             end as doc
    ) pdoc
    join scope s
      on st_intersects(l.geography, s.geography)
    where (p_result_kinds is null or 'page' = any (p_result_kinds))
      and (p_reach_m is null or st_dwithin(l.geography, (select pt from origin), p_reach_m))
      and (
        p_tags is null
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
      pp.kind               as post_kind,
      pp.headline,
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
      and pp.lifecycle_state = 'active'
      and pp.discoverability = 'listed'
      and pp.dissolved_at is null
      and (
        p_tags is null
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
      -- #314, plan #230 — a post leaves when its kind's shelf life ends (post_current_until).
      and public.post_current_until(pp.created_at, pp.starts_at, pp.ends_at, pp.show_until, pp.kind) >= coalesce(p_now, now())
      -- The time lens holds a post that is ON during the window: it starts before the window closes and has not
      -- ended before it opens. An undated post is outside any window rather than inside every one.
      and (p_starts_from is null or (pp.starts_at is not null and coalesce(pp.ends_at, pp.starts_at) >= p_starts_from))
      and (p_starts_before is null or (pp.starts_at is not null and pp.starts_at < p_starts_before))
      -- #796 (Don, 2026-10-16): the Type filter's post kinds. A sample carries its own; a real post has no kind
      -- field, so a dated one counts as an event. Pages are not narrowed by it.
      and (p_post_kinds is null or (pp.kind = any (p_post_kinds)
           -- the old filter words, until every client sends kinds
           or (pp.kind = 'sale' and 'deal' = any (p_post_kinds))
           or (pp.kind = 'limited' and 'last_minute' = any (p_post_kinds))))
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
    r.sample_kind,
    r.post_kind,
    r.headline
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
$function$;

-- heart_view: a stranger's answer (counts only where they are public; names only to managers).
CREATE OR REPLACE FUNCTION public.heart_view(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with g as (
    select g.id,
           g.id in (select public.current_member_managing_group_ids()) as manages,
           g.id in (select public.current_member_roster_group_ids()) as belongs
      from public.groups g
     where g.id = p_group_id
       and g.dissolved_at is null
       and (
         g.id in (select public.current_member_managing_group_ids())
         or (public.heart_counts_public() and g.lifecycle_state = 'active' and g.unclaimed_hidden_at is null
             and (g.discoverability = 'listed' or g.id in (select public.current_member_roster_group_ids())))
       )
  ),
  h as (
    select h.post_id, h.group_id, h.created_at, h.member_id, m.display_name
      from public.hearts h
      join public.members m on m.id = h.member_id and m.deleted_at is null
      left join public.page_posts p on p.id = h.post_id
     where h.group_id = (select id from g)
        or (p.group_id = (select id from g) and p.dissolved_at is null and p.removed_at is null
            and ((select manages from g)
                 or (p.lifecycle_state = 'active' and p.hidden_at is null
                     and (p.discoverability = 'listed' or (select belongs from g)))))
  ),
  per_post as (
    select h.post_id, count(*)::int as n,
           (array_agg(h.display_name order by h.created_at desc, h.member_id))[1:50] as names
      from h where h.post_id is not null group by h.post_id
  )
  select jsonb_build_object(
    'manages', g.manages,
    'page', jsonb_build_object('count', (select count(*)::int from h where h.group_id is not null))
            || case when g.manages then jsonb_build_object('names', coalesce(
                 (select to_jsonb((array_agg(h.display_name order by h.created_at desc, h.member_id))[1:50]) from h where h.group_id is not null),
                 '[]'::jsonb)) else '{}'::jsonb end,
    'posts', coalesce((select jsonb_agg(jsonb_build_object('postId', pp.post_id, 'count', pp.n)
                                        || case when g.manages then jsonb_build_object('names', to_jsonb(pp.names)) else '{}'::jsonb end
                                        order by pp.post_id)
                         from per_post pp), '[]'::jsonb)
  )
  from g
$function$;

-- wonder_view: totals for anyone who can see the Wonder; names only signed in.
CREATE OR REPLACE FUNCTION public.wonder_view(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select (select auth.uid()) as id),
  w as (
    select p.id, p.group_id, p.wonder_threshold, p.wonder_options, p.wonder_in_count,
           p.group_id in (select public.current_member_managing_group_ids()) as manages
      from public.page_posts p
      join public.groups g on g.id = p.group_id
     where p.id = p_post_id
       and p.kind = 'wonder'
       and p.dissolved_at is null
       and (
         p.group_id in (select public.current_member_managing_group_ids())
         or (p.lifecycle_state = 'active' and p.discoverability = 'listed' and p.hidden_at is null and p.removed_at is null
             and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
       )
  )
  select jsonb_build_object(
    'total', w.wonder_in_count,
    'threshold', w.wonder_threshold,
    'options', to_jsonb(coalesce(w.wonder_options, '{}'::text[])),
    'mine', (select jsonb_build_object('option', i.option)
               from public.wonder_interest i where i.post_id = w.id and i.member_id = (select id from me)),
    'myOffers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'role', o.role, 'status', o.status) order by o.created_at, o.role)
                            from public.wonder_offers o where o.post_id = w.id and o.member_id = (select id from me)), '[]'::jsonb),
    'helpers', coalesce((select jsonb_agg(jsonb_build_object('name', case when (select id from me) is not null then m.display_name end, 'role', o.role) order by o.decided_at, o.role)
                           from public.wonder_offers o join public.members m on m.id = o.member_id
                          where o.post_id = w.id and o.status = 'accepted' and m.deleted_at is null), '[]'::jsonb),
    -- F134.7 — names stay between members: signed out, the list is empty and 'total' carries the count.
    'inNames', case when (select id from me) is null then '[]'::jsonb else coalesce((select jsonb_agg(n.display_name order by n.created_at desc, n.member_id)
                           from (select m.display_name, i.created_at, i.member_id
                                   from public.wonder_interest i join public.members m on m.id = i.member_id
                                  where i.post_id = w.id and m.deleted_at is null
                                  order by i.created_at desc, i.member_id
                                  limit 50) n), '[]'::jsonb) end
  )
  || case when not w.manages then '{}'::jsonb else jsonb_build_object(
    'byOption', coalesce((select jsonb_agg(jsonb_build_object('option', u.opt, 'count',
                            (select count(*) from public.wonder_interest i where i.post_id = w.id and i.option = u.opt)) order by u.ord)
                            from unnest(w.wonder_options) with ordinality as u(opt, ord)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'option', i.option) order by i.created_at)
                          from public.wonder_interest i join public.members m on m.id = i.member_id where i.post_id = w.id), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', m.display_name, 'role', o.role, 'note', o.note, 'status', o.status)
                                         order by o.created_at, o.role)
                          from public.wonder_offers o join public.members m on m.id = o.member_id where o.post_id = w.id), '[]'::jsonb)
  ) end
  from w
$function$;

-- member_posts_read: neighbour posts read signed out as "a neighbour" (no name, no avatar).
CREATE OR REPLACE FUNCTION public.member_posts_read(p_metro_id uuid DEFAULT NULL::uuid, p_place_id uuid DEFAULT NULL::uuid, p_post_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with me as (select (select auth.uid()) as id),
  scope as (
    select mp.geography::public.geometry as g from public.metro_polygons mp where p_metro_id is not null and mp.id = p_metro_id
    union all
    select pl.geography::public.geometry from public.places pl where p_place_id is not null and pl.id = p_place_id and pl.deleted_at is null
  ),
  live as (
    select p.*, pl.display_name as place_name
      from public.member_posts p
      join public.places pl on pl.id = p.place_id
      join public.members m on m.id = p.member_id and m.deleted_at is null
     where true
       -- #280/#388: a builder's post reaches a real member only while the builder-content switch is on.
       and (p.member_id = (select id from me) or public.builder_visible(p.member_id))
       and p.removed_at is null
       and (p.member_id = (select id from me)
            or (p.withdrawn_at is null and p.hidden_at is null and p.expires_at > now()))
       and (p_post_id is null or p.id = p_post_id)
       and (p_post_id is not null
            or exists (select 1 from scope s
                        where public.st_intersects(s.g, coalesce(pl.centroid::public.geometry, public.st_pointonsurface(pl.geography::public.geometry)))))
       and (p_post_id is not null or (p.withdrawn_at is null and p.hidden_at is null and p.expires_at > now()))
       and (p_search is null or strpos(lower(p.body), lower(p_search)) > 0
            or exists (select 1 from public.member_post_tags pt join public.tags t on t.id = pt.tag_id
                        where pt.post_id = p.id and strpos(t.normalized, lower(p_search)) > 0))
     order by p.created_at desc
     limit greatest(1, least(p_limit, 60))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'kind', l.kind,
    'body', l.body,
    'placeName', l.place_name,
    'saleOn', l.sale_on,
    -- The street shows until the sale's day is over, in the metro's time.
    'street', case when l.sale_on >= (now() at time zone 'America/Los_Angeles')::date then l.street end,
    'createdAt', l.created_at,
    'expiresAt', l.expires_at,
    'labelsPinned', l.labels_pinned,
    -- F134.7 — a member's name and avatar stay between members.
    'displayName', case when (select id from me) is not null then m.display_name end,
    'avatarUrl', case when (select id from me) is not null then m.avatar_url end,
    'mine', l.member_id = (select id from me),
    'ended', l.withdrawn_at is not null or l.hidden_at is not null or l.expires_at <= now(),
    'answered', exists (select 1 from public.member_post_responses r where r.post_id = l.id and r.member_id = (select id from me)),
    'labels', coalesce((select jsonb_agg(t.label order by t.label) from public.member_post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = l.id), '[]'::jsonb),
    'answers', case when l.member_id = (select id from me) then coalesce((
        select jsonb_agg(jsonb_build_object('displayName', rm.display_name, 'at', r.created_at) order by r.created_at desc)
          from public.member_post_responses r join public.members rm on rm.id = r.member_id and rm.deleted_at is null
         -- A builder's answer never reaches a real poster, whatever the switch says (#280).
         where r.post_id = l.id and public.builder_relation_visible(r.member_id)), '[]'::jsonb) end
  ) order by l.created_at desc), '[]'::jsonb)
    from live l
    join public.members m on m.id = l.member_id
$function$;

-- town_contributors: counts for everyone, first names not to `anon`.
CREATE OR REPLACE FUNCTION public.town_contributors(p_slug text)
 RETURNS TABLE(first_name text, brought integer, added integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- F134.7 — an anonymous caller gets the counts without the first name. Keyed on the request's role rather than
  -- on auth.uid(), because the app's own cached read (src/lib/open/board.ts) comes through the pool with no
  -- request at all and decides per viewer on the page.
  select case when auth.role() is distinct from 'anon' then split_part(btrim(m.display_name), ' ', 1) end, count(g.claimed_at)::int, count(*)::int
    from public.town_adds a
    join public.members m on m.id = a.member_id and m.deleted_at is null and not m.open_credit_hidden
    join public.groups g on g.id = a.group_id and g.unclaimed_hidden_at is null and g.words_removed_at is null
   where a.town_slug = p_slug and coalesce(btrim(m.display_name), '') <> ''
     and not exists (select 1 from public.builders b where b.member_id = m.id)
   group by m.id, m.display_name
   order by 2 desc, 3 desc, min(a.created_at)
   limit 10
$function$;

------------------------------------------------------------
-- 5. The F093 projections go: nothing calls them once the app reads the
--    real rows.
------------------------------------------------------------
drop function if exists public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int);
drop function if exists public.shared_post_preview(uuid, uuid);
