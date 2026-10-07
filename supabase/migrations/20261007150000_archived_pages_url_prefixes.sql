-- #439 — the one read path 20261007020000_archived_pages_every_path left out:
-- group_url_prefixes. It is security definer, so the restrictive groups policy
-- doesn't reach it, and a joined member or founder could still resolve an
-- archived or deleted Page's address. Now the founded and joined paths admit
-- draft and active Pages only; a manager still resolves their own archived
-- Page, so its owner's link works.
--
-- ORDER: after 20261007020000_archived_pages_every_path (which redefines
-- discoverable_items, venue_hosted_items and the refresh trigger, and not
-- this function).

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
      or (g.lifecycle_state in ('draft', 'active') and (
            g.id in (select public.current_member_explicit_group_ids())
         or g.id in (select public.current_member_founded_group_ids())
      ))
      or g.id in (select public.current_member_managing_group_ids())
    )
$$;
