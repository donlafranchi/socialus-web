-- bug #241, part 1 of 2 — the reads a signed-out page needs, without a member id.
--
-- Spec anchors:
--   socialus-web #241                        (launch-blocking)
--   ops-pattern/DECISIONS.md 2026-09-21      (canonical URL: no member derivable;
--                                             two member-identity leaks)
--
-- ADDITIVE ONLY, so it is safe with the code on either side of it. Part 2
-- (20260929170100) takes the membership view and groups.founder_member_id away
-- from anon; it can only go in once the code that stops reading them is live,
-- or every signed-out Page 404s in between.

-- One direction only: a member's Pages, never a Page's members. A stranger
-- gets nothing for a member who is not marked public, matching
-- members_anon_read_public (#178).
create or replace function public.member_public_pages(p_member_id uuid)
returns table (slug text, name text, kind text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.slug, v.name, v.kind::text
    from public.member_public_group_memberships v
    join public.members m on m.id = v.member_id
   where v.member_id = p_member_id
     and m.deleted_at is null
     and (auth.uid() is not null or m.stakeholder_visibility = 'public')
   order by v.name
$$;

revoke all on function public.member_public_pages(uuid) from public;
grant execute on function public.member_public_pages(uuid) to anon, authenticated;

-- "Founded by", without the id. Returned only where the caller can see the
-- Page and could see the founder: a stranger sees a public founder of a listed
-- Page; a signed-in member also sees their own and their co-members' Pages.
create or replace function public.page_founder_public(p_group_id uuid)
returns table (handle text, display_name text, avatar_url text, has_published boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.handle::text,
         m.display_name::text,
         m.avatar_url::text,
         exists (select 1 from public.member_public_has_published p where p.member_id = m.id)
    from public.groups g
    join public.members m on m.id = g.founder_member_id
   where g.id = p_group_id
     and m.deleted_at is null
     and m.login_disabled = false
     and (
       (g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
       or g.founder_member_id = auth.uid()
       or exists (
         select 1 from public.group_memberships gm
          where gm.group_id = g.id and gm.member_id = auth.uid() and gm.left_at is null
       )
     )
     and (auth.uid() is not null or m.stakeholder_visibility = 'public')
$$;

revoke all on function public.page_founder_public(uuid) from public;
grant execute on function public.page_founder_public(uuid) to anon, authenticated;
