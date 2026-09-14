-- T162 (Issue #75) — the post table, and browse's post-grain read source.
--
-- Spec anchors:
--   planning/scenario-F059.md                     (approved 2026-09-14)
--   product/foundation/model.md § Browse is everything
--   product/foundation/model.md § Why Home and Browse both exist
--   planning/adrs/ADR-0007-action-layer.md        (writes via the action layer)
--   supabase/migrations/20260912224728_browse_pages.sql  (the Page-grain twin)
--
-- Substrate only: the table and its read path. No composer, no rendering.
--
-- WHY THIS EXISTS. Browse finds Pages *and posts* — flat, not only the dated
-- ones and not only the ones with a place (ruled 2026-09-12). `page_posts` did
-- not exist, so browse was missing **every** post: an undated "sourdough is
-- back Thursday" as much as next Saturday's market. #51 shipped the Page half
-- and said so; this is the other half.
--
-- THE GRAIN IS THE POST. One row per post; a Page has many. This is precisely
-- what was wrong in the retired model — `discoverable_items` is unique on
-- (item_id), one row per Item, and per model.md there are no Items. What a
-- creator offers is described on their Page **and in their posts**.
--
-- `locality_feed_items` and `browse_pages` are both untouched. This is a third
-- path alongside them, not a replacement for either.

------------------------------------------------------------
-- 1. public.page_posts
------------------------------------------------------------

create table public.page_posts (
  id                uuid        not null default gen_random_uuid() primary key,

  -- A post has no life independent of its Page.
  group_id          uuid        not null references public.groups(id) on delete cascade,

  -- What the post is about, in the creator's own words. This is what typed
  -- search narrows on — search is the only way to narrow (F059 criterion 4),
  -- so this column is the searchable surface of a post.
  body              text        not null
                                check (char_length(body) between 1 and 5000),

  -- OPTIONAL start time. Nullable is the point: an undated post is a
  -- first-class post, not a degraded event. A post with a time is what the
  -- schedule filter and the past-dated drop-out rule act on; a post without
  -- one has no time to be past, and never drops out.
  starts_at         timestamptz,

  -- OPTIONAL location, resolving through `locations` the way a Page's anchor
  -- does. A post's address is its OWN, not its Page's: a Page appears at its
  -- Page-level location *and* each post appears at the post's own address.
  --
  -- `on delete set null` rather than cascade, deliberately: removing a venue
  -- should cost a post its pin, never the post. The asymmetry with group_id
  -- above is the point — a post belongs to its Page and merely refers to a
  -- place.
  location_id       uuid        references public.locations(id) on delete set null,

  -- The same vocabulary as `groups`, so the read source withholds drafts,
  -- unlisted and dissolved posts in its own predicate rather than leaving a
  -- client to filter them.
  lifecycle_state   text        not null default 'draft'
                                check (lifecycle_state in ('draft', 'active', 'dissolved')),
  discoverability   text        not null default 'listed'
                                check (discoverability in ('listed', 'unlisted', 'private')),
  dissolved_at      timestamptz,

  -- Recency ordering. Browse orders on locality and recency (ruled 2026-09-12).
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- The browse predicate, in index form: live posts of a Page, newest first.
create index idx_page_posts_browse
  on public.page_posts (group_id, updated_at desc)
  where lifecycle_state = 'active'
    and discoverability = 'listed'
    and dissolved_at is null;

-- The dated half, for the past-dated drop-out and any future schedule filter.
create index idx_page_posts_starts_at
  on public.page_posts (starts_at)
  where starts_at is not null;

create index idx_page_posts_location
  on public.page_posts (location_id)
  where location_id is not null;

comment on table public.page_posts is
  'One row per post; a Page has many. What a creator offers is described on their Page and in their posts (model.md). Browse indexes these flat — not only the dated ones, not only the ones with a place (ruled 2026-09-12). Writes go through the action layer per ADR-7; the policies here are SELECT only.';

comment on column public.page_posts.body is
  'What the post is about, in the creator''s own words. The searchable surface of a post — typed search is the only way to narrow browse (F059 criterion 4).';

comment on column public.page_posts.starts_at is
  'Optional. Null means an undated post, which is a first-class post and not a degraded event. Non-null is what the past-dated drop-out rule (F059 acceptance 8) and any future schedule filter act on.';

comment on column public.page_posts.location_id is
  'Optional, and the post''s OWN address rather than its Page''s — a Page appears at its Page-level location and each post appears at its own (model.md). `on delete set null`: losing a venue costs a post its pin, never the post.';

------------------------------------------------------------
-- 2. RLS — read only, and nothing derived from payment
------------------------------------------------------------

alter table public.page_posts enable row level security;

-- A reader sees live posts of visible Pages.
--
-- Both halves are required and neither implies the other: a live post on a
-- draft Page must not leak the Page, and a draft post on a live Page is not
-- published. The Page half mirrors `groups_select_active_or_own_draft`'s
-- public arm exactly.
create policy page_posts_select_published
  on public.page_posts
  for select
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

-- An owner sees their own, in any state.
--
-- Scoped to the Page's founder, which is exactly who
-- `groups_select_active_or_own_draft` admits for a draft Page. Deliberately
-- the same test rather than a second, broader one: two different answers to
-- "who owns this Page" is how they drift apart. If that rule ever widens to
-- owner-role membership, this widens in the same change.
create policy page_posts_select_own
  on public.page_posts
  for select
  using (
    exists (
      select 1 from public.groups g
       where g.id = page_posts.group_id
         and g.founder_member_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policy, per ADR-7: writes go through the action
-- layer, which connects as the table owner and bypasses RLS. A write policy
-- would buy nothing and would open a direct client path that skips the event
-- log.
--
-- AND NOTHING HERE IS DERIVED FROM PAYMENT. Not visibility, not ordering, not
-- a column. #51 states ordering may carry community response and may never
-- carry payment; the same holds for what is shown at all. The migration test
-- asserts the absence by word, so adding one means deleting a test that says
-- why it exists.

------------------------------------------------------------
-- 3. browse_posts — the post-grain read source
------------------------------------------------------------

-- Dropped first so a changed signature can never leave two overloads behind.
-- New today; the drop is the convention, not a repair.
drop function if exists public.browse_posts(uuid, timestamptz, int);

create function public.browse_posts(
  p_place_id uuid,
  p_now      timestamptz default null,
  p_limit    int         default 50
)
returns table (
  post_id            uuid,
  group_id           uuid,
  slug               text,
  name               text,
  photo_url          text,
  body               text,
  starts_at          timestamptz,
  location_id        uuid,
  location_label     text,
  location_geography geography,
  created_at         timestamptz,
  updated_at         timestamptz
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    pp.id                as post_id,
    g.id                 as group_id,
    g.slug,
    g.name,
    g.photo_url,
    pp.body,
    pp.starts_at,
    pl.id                as location_id,
    pl.label             as location_label,
    pl.geography         as location_geography,
    pp.created_at,
    pp.updated_at
  from public.page_posts pp
  join public.groups g
    on g.id = pp.group_id
  -- The post's own location, when it has one. LEFT, because a post without an
  -- address is a first-class post and an inner join here would silently
  -- re-create the "only posts with a place" filter this table exists to undo.
  left join public.locations pl
    on pl.id = pp.location_id
   and pl.deleted_at is null
  -- The Page's anchor, used ONLY to scope an addressless post to a Place. It
  -- is never projected: a post does not borrow its Page's pin.
  left join public.locations gl
    on gl.id = g.anchor_location_id
   and gl.deleted_at is null
  join public.places p
    on p.id = p_place_id
   and p.deleted_at is null
  where
    -- Locality. A post is in this Place if its own address is, or — having no
    -- address — if its Page's anchor is. Falling back is what keeps an
    -- addressless post in browse at all; browse is everything, and an
    -- exclusion needs a recorded reason.
    st_intersects(coalesce(pl.geography, gl.geography), p.geography)
    -- Belt and braces over RLS, the same way browse_pages does it. RLS is the
    -- access boundary; this is the browse policy, and it must hold even for
    -- the founder, for whom RLS admits their own drafts.
    and pp.lifecycle_state = 'active'
    and pp.discoverability = 'listed'
    and pp.dissolved_at is null
    and g.lifecycle_state = 'active'
    and g.discoverability = 'listed'
    and g.dissolved_at is null
    -- Past-dated posts drop out on their own (F059 acceptance 8). Withheld
    -- here rather than filtered by a caller. An undated post has no time to be
    -- past, so `starts_at is null` always passes — that is the clause that
    -- keeps "flat" true.
    and (pp.starts_at is null or pp.starts_at >= coalesce(p_now, now()))
  -- Locality is the predicate; recency is the order. Identical to
  -- browse_pages. NO interest-tag boost: browse is complete and is not ranked
  -- by the member's interests (ruled 2026-09-12) — that boost is Home's.
  -- Never payment.
  order by pp.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$$;

comment on function public.browse_posts(uuid, timestamptz, int) is
  'Post-grain browse source (T162). Returns live posts whose own address — or, when they have none, their Page''s anchor — falls inside the given Place, most recently updated first. Projects the owning Page''s identity (slug, name, photo; the URL prefix is attached by the caller via group_url_prefixes), the post''s own free text for search, its optional start time, and its OWN geography for map pins (null when it has no address; a post never borrows its Page''s pin — pin grouping by Page is #53''s). Withholds drafts, unlisted and dissolved posts AND posts of drafts, unlisted and dissolved Pages, and drops past-dated posts; undated posts never drop. Ordering carries no interest-tag boost and nothing derived from payment.';

revoke all on function public.browse_posts(uuid, timestamptz, int) from public;
grant execute on function public.browse_posts(uuid, timestamptz, int) to anon, authenticated;
