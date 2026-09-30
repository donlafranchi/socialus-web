-- bug #246 — what one member can read about another.
--
-- Spec anchors (ops-pattern/DECISIONS.md, all 2026-09-30, Don on #246):
--   A signed-in stranger can read no member field. A Page's creator may show
--     a display name and avatar to anyone who views the Page.
--   Nobody sees who follows whom. A Page's owner sees who follows their Page.
--   A member's interest tags are not public.
--   A stranger does not see a Page's roster.
--   Whoever is party to an RSVP sees it: everyone who RSVP'd to a gathering,
--     and its organiser, see the others; a one-on-one, its two parties.
--   Someone who RSVP'd to a group gathering is inside the group and sees what
--     a member sees.
--   Purchases are deferred: nobody buys in the app yet, so a purchase or a
--     pledge reaches its responder only.
--   The founder, by display name, is on a Page's front door for anyone signed
--     in, private Pages included; the signed-out front door carries none.
--
-- Confirmed on production 2026-09-30: signed out reads member_follows,
-- member_interests, locations.member_id and item_responses; a signed-in
-- stranger reads 10 of 11 other members' rows, 3 of 4 private ones included.
--
-- What each viewer sees is one policy per relation, so a ruling on one of
-- nouns.md's open cells (a)-(j) adds a policy and changes none of these.
--
-- SAFE TO APPLY BEFORE THE MERGE. Until the code lands, an item a member posted
-- without a Page 404s for anyone but its poster, /you/following shows people
-- as unavailable and Page member counts there read 0, and the sell flow lists
-- no saved locations. No Page 404s: page_founder_public keeps its signature.

-- 1. members: each member reads their own row, and nobody reads anyone else's.
drop policy if exists members_public_read on public.members;
drop policy if exists members_anon_read_public on public.members;
create policy members_select_self
  on public.members for select to authenticated
  using (id = auth.uid());

-- 2. A profile resolves for its owner only.
create or replace function public.resolve_member_page_visibility(
  p_handle text,
  p_via_direct_link boolean default true
)
returns table (member_id uuid, verdict text, is_discoverable boolean, profile_visibility text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, 'render'::text, mp.is_discoverable, mp.profile_visibility
    from public.members m
    join public.member_privacy mp on mp.member_id = m.id
   where m.handle = p_handle
     and m.deleted_at is null
     and m.login_disabled = false
     and m.id = auth.uid()
  union all
  select null::uuid, 'notfound'::text, false, null::text
   where not exists (
     select 1 from public.members m
      where m.handle = p_handle and m.deleted_at is null
        and m.login_disabled = false and m.id = auth.uid()
   )
$$;

create or replace function public.member_public_pages(p_member_id uuid)
returns table (slug text, name text, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.slug, v.name, v.kind::text
    from public.member_public_group_memberships v
   where v.member_id = p_member_id
     and v.member_id = auth.uid()
   order by v.name
$$;

-- 3. A Page's founder, on its front door: display name, to anyone signed in.
-- Same signature, so today's code keeps rendering "Founded by" as text;
-- handle and has_published led only to a profile nobody else can now read.
create or replace function public.page_founder_public(p_group_id uuid)
returns table (handle text, display_name text, avatar_url text, has_published boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select null::text,
         m.display_name::text,
         null::text,
         false
    from public.groups g
    join public.members m on m.id = g.founder_member_id
   where g.id = p_group_id
     and auth.uid() is not null
     and m.deleted_at is null
     and m.login_disabled = false
     and (
       (g.lifecycle_state = 'active' and g.dissolved_at is null)
       or g.founder_member_id = auth.uid()
     )
$$;

-- An item posted without a Page lives at /m/<handle>/p/…, so its handle is
-- already public and its member_id already on the item. This names the poster
-- on that item, and answers nothing for a handle that has posted nothing, so it
-- is no handle-to-member lookup.
create or replace function public.post_author_public(p_handle text)
returns table (member_id uuid, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.display_name::text, m.avatar_url::text
    from public.members m
   where m.handle = p_handle
     and m.deleted_at is null
     and m.login_disabled = false
     and exists (
       select 1 from public.items i
        where i.member_id = m.id and i.group_id is null
          and i.state = 'published' and i.deleted_at is null
     )
$$;

revoke all on function public.post_author_public(text) from public;
grant execute on function public.post_author_public(text) to anon, authenticated;

-- A count, never a roster.
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
   group by v.group_id
$$;

revoke all on function public.page_listed_member_counts(uuid[]) from public;
grant execute on function public.page_listed_member_counts(uuid[]) to anon, authenticated;

-- 4. The member projections. Each is a view that runs as its owner, so RLS on
-- members never reached it. Their readers now go through the functions above,
-- which run as their owner too.
revoke select on public.member_public_group_memberships from anon, authenticated;
revoke select on public.member_public_discoverability from anon, authenticated;
revoke select on public.member_has_standing_presence from anon, authenticated;
revoke select on public.member_public_has_published from anon, authenticated;

-- venue_hosted_items ran as the caller and inner-joined members, so it would
-- now return nothing. It runs as its owner, with the items visibility it
-- inherited from RLS written out: a listed live Page, or one the caller is in.
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
    m.display_name,
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

-- 5. Follow graph. Member to member: the follower reads their own follows.
-- Page followers: a stranger's roster read goes (below); the owner's read of
-- their own Page's followers is memberships_select_co_member, unchanged.
drop policy if exists member_follows_public_read on public.member_follows;
create policy member_follows_select_own
  on public.member_follows for select to authenticated
  using (follower_member_id = auth.uid());

-- A signed-in stranger's read of any listed Page's roster, followers included.
drop policy if exists memberships_select_listed_group on public.group_memberships;

-- The roster is for the Page's current members (2026-09-08), and for someone
-- who RSVP'd to one of its gatherings, who is inside the group (2026-09-30). A
-- follower is neither, and read the members' rows through
-- current_member_explicit_group_ids, which counts a follow as a membership.
create or replace function public.current_member_rsvp_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select distinct i.group_id
    from public.item_responses r
    join public.items i on i.id = r.item_id
    join public.groups g on g.id = i.group_id
   where r.responder_member_id = auth.uid()
     and r.response_kind = 'rsvp'
     and r.withdrawn_at is null
     and i.deleted_at is null
     and g.kind <> 'business'
$$;

revoke all on function public.current_member_rsvp_group_ids() from public;
grant execute on function public.current_member_rsvp_group_ids() to anon, authenticated;

create or replace function public.current_member_roster_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select group_id
    from public.group_memberships
   where member_id = auth.uid()
     and left_at is null
     and source = 'explicit'
     and (relationship = 'member' or role in ('owner', 'steward'))
$$;

revoke all on function public.current_member_roster_group_ids() from public;
grant execute on function public.current_member_roster_group_ids() to anon, authenticated;

alter policy memberships_select_co_member on public.group_memberships
  using (
    (
      group_id in (select public.current_member_roster_group_ids())
      or group_id in (select public.current_member_rsvp_group_ids())
    )
    and (
      relationship <> 'follower'
      or group_id in (select public.current_member_managed_group_ids())
    )
  );

-- What else a member reads of their group, someone who RSVP'd reads too.
alter policy groups_select_member on public.groups
  using (
    id in (select public.current_member_explicit_group_ids())
    or id in (select public.current_member_rsvp_group_ids())
  );

alter policy items_select_group_member on public.items
  using (
    group_id is not null
    and deleted_at is null
    and (
      group_id in (select public.current_member_explicit_group_ids())
      or group_id in (select public.current_member_rsvp_group_ids())
    )
  );

alter policy group_events_select_member_of_group on public.group_events
  using (
    (
      group_id in (select public.current_member_explicit_group_ids())
      or group_id in (select public.current_member_rsvp_group_ids())
    )
    and event_kind <> all (array['group.reported', 'group.photo_hidden', 'group.photo_restored'])
  );

-- 6. Interest tags: the member's own.
drop policy if exists member_interests_public_read on public.member_interests;
create policy member_interests_select_own
  on public.member_interests for select to authenticated
  using (member_id = auth.uid());

-- 7. Who responded. The responder always reads their own
-- (item_responses_select_self). A purchase, a pledge and every kind no ruling
-- names stay there.
drop policy if exists item_responses_select_public on public.item_responses;

-- RSVPs: whoever is party to one. Everyone with a live RSVP on an item sees
-- the others' live RSVPs; its organiser (who posted it, its host, whoever runs
-- its Page) sees them all. A one-on-one is the same rule with one RSVP.
-- Through functions, since a policy on item_responses may not query it.
create or replace function public.current_member_rsvp_item_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select r.item_id
    from public.item_responses r
   where r.responder_member_id = auth.uid()
     and r.response_kind = 'rsvp'
     and r.withdrawn_at is null
$$;

create or replace function public.current_member_organised_item_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.id from public.items i where i.member_id = auth.uid()
  union
  select ig.item_id from public.item_gatherings ig where ig.host_member_id = auth.uid()
  union
  select i.id
    from public.items i
    join public.group_memberships gm on gm.group_id = i.group_id
   where gm.member_id = auth.uid()
     and gm.left_at is null
     and gm.source = 'explicit'
     and gm.role in ('owner', 'steward')
$$;

revoke all on function public.current_member_rsvp_item_ids() from public;
revoke all on function public.current_member_organised_item_ids() from public;
grant execute on function public.current_member_rsvp_item_ids() to anon, authenticated;
grant execute on function public.current_member_organised_item_ids() to anon, authenticated;

create policy item_responses_select_rsvp_parties
  on public.item_responses for select to authenticated
  using (
    response_kind = 'rsvp'
    and (
      item_id in (select public.current_member_organised_item_ids())
      or (withdrawn_at is null and item_id in (select public.current_member_rsvp_item_ids()))
    )
  );

-- 8. locations.member_id. RLS is row-level, so the column goes the way
-- groups.founder_member_id went for anon in #241: SELECT is rebuilt as every
-- column but one. A column added later is invisible until granted;
-- tests/member-reads-db.test.ts fails on that.
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'locations' and column_name <> 'member_id';
  execute 'revoke select on public.locations from anon, authenticated';
  execute format('grant select (%s) on public.locations to anon, authenticated', cols);
end
$$;

-- The owner's own locations, which they could filter by member_id before.
create or replace function public.own_locations()
returns table (id uuid, label text)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.label
    from public.locations l
   where l.member_id = auth.uid() and l.deleted_at is null
   order by l.created_at
$$;

revoke all on function public.own_locations() from public;
grant execute on function public.own_locations() to authenticated;

-- Policies that asked locations.member_id as the caller now go through a
-- function, or they refuse every read of their table.
create or replace function public.current_member_location_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.id from public.locations l where l.member_id = auth.uid()
$$;

revoke all on function public.current_member_location_ids() from public;
grant execute on function public.current_member_location_ids() to anon, authenticated;

alter policy location_events_owner_read on public.location_events
  using (
    location_id in (select public.current_member_location_ids())
    or acting_member_id = auth.uid()
  );

-- locations_owner_update asks member_id in its own qual, which Postgres does
-- not check against column grants; it stays.
