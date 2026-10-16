-- #874 (Don, 2026-10-16): "Local will be solely determined by if money comes back to where it was generated."
-- For now local is the owner's Locally Owned claim and nothing geographic, so the badge no longer asks whether
-- the claim's ZIP is in the Page's MSA. A Page with no active claim (every unclaimed Page) has none.
-- Same signature, same visibility rule, still a boolean and nothing else (#246).
create or replace function public.page_local_owner_badge(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select true
      from public.groups g
      join public.member_business_jurisdictions j
        on j.group_id = g.id and j.removed_at is null
     where g.id = p_group_id
       and (
         (g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
         or g.founder_member_id = auth.uid()
         or exists (
           select 1 from public.group_memberships gm
            where gm.group_id = g.id and gm.member_id = auth.uid() and gm.left_at is null
         )
       )
     limit 1
  ), false)
$$;
