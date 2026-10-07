-- bug #439, the rest: the read paths the first pass (20261007020000) left,
-- found by its review. Each answered someone who belongs to an archived or
-- deleted Page without managing it, where groups_hidden_owner_only says only
-- its managers. page_hidden_from_caller() (20261007020000) is the one test.
--
--   group_url_prefixes   — its address, to members and its founder
--   page_founder_public  — its founder's name, to its roster
--   member_public_pages  — its name, in a member's own list
--   page_posts           — its posts, to a founder who no longer manages it
--   group_memberships    — its roster, to its members (each still reads their own row)
--
-- RSVPs to its items need nothing here: item_responses' party policy reads
-- items, which 20261007020000 already closed.
--
-- ORDER: after 20261007020000_archived_pages_every_path and #472's 20261007150000,
-- which production already holds.

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
    and not public.page_hidden_from_caller(g.id)
$$;

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
     and m.deleted_at is null
     and m.login_disabled = false
     and (
       g.founder_member_id = auth.uid()
       or g.id in (select public.current_member_roster_group_ids())
     )
     and not public.page_hidden_from_caller(g.id)
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
     and not public.page_hidden_from_caller(v.group_id)
   order by v.name
$$;

create policy page_posts_page_hidden_owner_only on public.page_posts as restrictive for select
  using (not public.page_hidden_from_caller(group_id));

create policy memberships_page_hidden_owner_only on public.group_memberships as restrictive for select
  using (member_id = (select auth.uid()) or not public.page_hidden_from_caller(group_id));
