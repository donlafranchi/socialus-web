-- F093 (#215) — who exists is public, what's happening is not, but THAT
-- something is happening is public.
--
-- Spec anchors:
--   ops-pattern/planning/scenario-F093.md   (approved 2026-09-23)
--   ops-pattern/DECISIONS.md 2026-09-23     (Don's ruling on #200)
--   ops-pattern/process/ABSOLUTES.md        ([guard-proves-itself])
--
-- THE RULING, AND THE TWO PARTS OF IT THAT DECIDE THIS FILE.
--
--   1. THE BODY GOES ENTIRELY, not just `starts_at` and `location_id`. An
--      announcement body is free text, and a person writing "we're meeting
--      Thursday at 2pm at the river" has put the when and the where in prose.
--      Redacting the two structured columns while serving the sentence
--      redacts NOTHING and produces a schema that claims otherwise.
--
--   2. IT IS ENFORCED HERE, AND IT COULD NOT HAVE BEEN ENFORCED IN REACT.
--      These rows are also served by PostgREST on a `*.supabase.co` origin
--      with a publishable key that ships inside our own JavaScript — the
--      origin #178 counted our tables through, and one no robots.txt (#199)
--      and no Vercel firewall (#201) sits in front of. A component that
--      declines to render the body is an inert guard under
--      `[guard-proves-itself]`: green every run, absent the moment anyone
--      asks the database directly.
--
-- WHAT IS NOT WITHHELD. Pages stay fully public and indexable — name,
-- description, location, photo, tags, the map. `groups` is untouched here.
-- And nothing a signed-in member sees changes: `authenticated` keeps exactly
-- the read it had.

------------------------------------------------------------
-- 1. page_posts: the anonymous read goes away
------------------------------------------------------------

-- Dropped and recreated rather than altered, so the whole predicate is in one
-- place in one migration and nobody has to read two files to know what the
-- policy says.
drop policy if exists page_posts_select_published on public.page_posts;

-- A SIGNED-IN reader sees live posts of visible Pages.
--
-- `to authenticated` IS the change, and it is the whole of the change — the
-- `using` clause below is byte-for-byte what it was in
-- 20260914202752_page_posts.sql. Written as a role rather than as
-- `auth.uid() is not null` because a role is what PostgREST actually presents:
-- an anonymous request arrives as `anon` and is not considered by this policy
-- at all, rather than being considered and failing a test inside it.
--
-- Both halves of the `using` clause are still required and neither implies the
-- other: a live post on a draft Page must not leak the Page, and a draft post
-- on a live Page is not published.
create policy page_posts_select_published
  on public.page_posts
  for select
  to authenticated
  using (
    lifecycle_state = 'active'
    and discoverability = 'listed'
    and dissolved_at is null
    and exists (
      select 1 from public.groups g
       where g.id = page_posts.group_id
         and g.lifecycle_state = 'active'
         and g.discoverability = 'listed'
         and g.dissolved_at is null
    )
  );

-- `page_posts_select_own` is deliberately NOT touched. It already tests
-- `auth.uid()`, so it admits nobody anonymous, and narrowing it would be a
-- second change riding along with this one.

------------------------------------------------------------
-- 2. announcements_withheld — the signed-out read path
------------------------------------------------------------

-- A PROJECTION, NOT A FILTER OVER A ROW ALREADY SERVED. That distinction is
-- the scenario's (criterion 3) and it is the reason this is a separate
-- function rather than a nullable column on `browse_feed`:
--
--   * `browse_feed` is `security invoker`, so with the policy above an
--     anonymous caller now gets ZERO post rows from it. That is correct and
--     it is asserted — but on its own it would delete post-kind rows from
--     signed-out Explore, which criterion 7 forbids. Signed-out Explore keeps
--     its announcements, in withheld form; the difference between a directory
--     and a place that is visibly alive is the whole reason this ruling is
--     not simply "announcements require an account".
--
--   * A withheld column on `browse_feed` would mean the body reaches the
--     function and is dropped on the way out. Then the guarantee is a
--     `null::text` somebody can stop writing. HERE THE BODY IS NOT IN THE
--     RETURN TYPE AT ALL, so it cannot be un-withheld by a caller, by a
--     parameter, or by a later edit that looks harmless. The test asserts the
--     ABSENCE OF THE KEYS, not that they came back null.
--
-- `security definer` because the whole point is to answer a caller the RLS
-- policy above has just refused. What makes that safe is the return type:
-- there is no body, no `starts_at`, no location and no description in it, so
-- elevated rights buy this function nothing it could leak.

drop function if exists public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int);

create function public.announcements_withheld(
  -- SCOPE. Exactly one, and `p_group_id` wins when given.
  --   metro / place — signed-out Explore (criterion 7).
  --   group         — one Page, so an `#announcement-<id>` anchor a
  --                   signed-out visitor follows lands on something that
  --                   resolves (criterion 9).
  p_metro_id     uuid        default null,
  p_place_id     uuid        default null,
  p_group_id     uuid        default null,

  -- THE PERIOD THE COUNT IS OVER. Passed in rather than computed here, and
  -- that is deliberate: "this week" is a wall-clock question in the METRO's
  -- timezone, and `METRO_TIME_ZONE` lives in exactly one place
  -- (src/lib/metro/metro-time.ts) until #173 gives each metro its own. A
  -- second copy of that zone in SQL is how the two drift, and it would make
  -- this function need changing again the day #173 lands.
  --
  -- Null on either side means unbounded on that side.
  p_period_from  timestamptz default null,
  p_period_to    timestamptz default null,

  -- The cutoff past-dated announcements are judged against, injectable so the
  -- drop-out is testable without waiting for a clock. Same as `browse_feed`.
  p_now          timestamptz default null,

  p_limit        int         default 50
)
returns table (
  -- THE WHOLE RETURN TYPE IS THE GUARANTEE. Read it as the answer to "what
  -- may a stranger learn": which Page, that it posted, and how many it has
  -- this period. Nothing here says what was posted, when it happens, or
  -- where.
  result_id          uuid,
  group_id           uuid,
  slug               text,
  name               text,
  public_id          text,
  announcement_count int,
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
  )
  select
    pp.id      as result_id,
    g.id       as group_id,
    g.slug,
    g.name,
    g.public_id,
    -- THE COUNT, and the one judgement call in this file, so it is written
    -- down rather than left in the shape of the SQL.
    --
    -- COUNTED BY `created_at`, NEVER BY `starts_at`. Counting by start time
    -- would let an anonymous caller sweep the period bounds and read back the
    -- distribution of when things happen — which is precisely the "what's
    -- happening" the ruling withholds, reconstructed one integer at a time.
    -- `created_at` says only that a Page has been posting, which is the
    -- signal the ruling makes public on purpose.
    --
    -- ON THE F076 DIFFERENCING RULING (DECISIONS.md 2026-09-22): that one says
    -- a truthful live count leaks membership by differencing, and it does not
    -- reach this count. There, the attacker SUPPLIED the row — submit an
    -- address, watch the number, learn whether it was already there. Here an
    -- anonymous caller cannot write an announcement at all (ADR-7: writes go
    -- through the action layer, and there is no anonymous handler), so there
    -- is no before-and-after they control and nothing of theirs to probe for.
    -- What the number moves on is a Page owner posting, which this ruling
    -- makes public in the same breath.
    (
      select count(*)::int
        from public.page_posts c
       where c.group_id = g.id
         and c.lifecycle_state = 'active'
         and c.discoverability = 'listed'
         and c.dissolved_at is null
         and (p_period_from is null or c.created_at >= p_period_from)
         and (p_period_to   is null or c.created_at <  p_period_to)
    )          as announcement_count,
    pp.updated_at
  from public.page_posts pp
  join public.groups g
    on g.id = pp.group_id
  -- Joined to SCOPE an addressless announcement to a polygon, and NEVER
  -- projected. A post's own address and its Page's anchor are both read here
  -- and neither reaches the return type — which is the difference between
  -- using a column and disclosing it.
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
    -- The same visibility predicate `browse_feed` applies, restated rather
    -- than shared: `security definer` means RLS is not doing it for us here,
    -- so every clause RLS would have applied has to be present. A missing one
    -- is a draft announcement on a stranger's screen.
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
    -- The past-dated drop-out, for the browse scopes only. A Page's own list
    -- keeps its past announcements, exactly as it does for a signed-in
    -- reader — otherwise an anchor to one of them would resolve for a member
    -- and dead-end for a stranger, which is the bug #211 just fixed.
    --
    -- Filtering on `starts_at` without projecting it is not a disclosure: it
    -- says an announcement is still ahead, and "something is happening" is
    -- the signal this ruling publishes.
    and (
      p_group_id is not null
      or pp.starts_at is null
      or pp.starts_at >= coalesce(p_now, now())
    )
  order by pp.updated_at desc, pp.id
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) is
  'F093 — the signed-out read path for announcements. Returns WHICH Page posted and HOW MANY it has in the given period, and nothing about what was posted: there is no body, no starts_at, no location and no description in the return type, which is the guarantee rather than a filter a caller could stop applying. security definer on purpose — it answers the caller page_posts_select_published now refuses, and elevated rights buy it nothing to leak because the projection carries nothing withheld. Scope is metro or place (signed-out Explore, criterion 7) or one group (so an #announcement-<id> anchor resolves for a signed-out visitor, criterion 9). The count is over created_at and NEVER starts_at — counting by start time would let a caller sweep the bounds and reconstruct when things happen. Period bounds are arguments because the metro timezone lives in src/lib/metro/metro-time.ts and must not be copied into SQL.';

revoke all on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) from public;

-- Granted to BOTH roles. It is a strictly smaller projection than what a
-- member may already read, so it discloses nothing to `authenticated`;
-- restricting it to `anon` would only mean a signed-in person previewing the
-- signed-out surface gets a 403 that looks like a bug.
grant execute on function public.announcements_withheld(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, int) to anon, authenticated;

------------------------------------------------------------
-- 3. Supporting index
------------------------------------------------------------
-- The count is per Page over a created_at window, run once per card. That is
-- a different predicate from idx_page_posts_browse, which orders by
-- updated_at.
create index if not exists idx_page_posts_created
  on public.page_posts (group_id, created_at)
  where lifecycle_state = 'active'
    and discoverability = 'listed'
    and dissolved_at is null;
