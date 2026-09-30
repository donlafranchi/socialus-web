-- bug #246 — a business registration is collected and never displayed.
--
-- Spec anchors:
--   socialus-web #246                       (launch-blocking)
--   ops-pattern/DECISIONS.md 2026-09-29     (registration details are never
--                                            displayed; the public artifact is a badge)
--
-- 024 made member_business_jurisdictions public-readable on purpose: "the
-- Group surface renders the claim". What the surface renders is one badge,
-- "Claimed local owner"; to compute it, every stranger could read the member
-- id, zip, state and legal entity name behind it (production, 2026-09-29).
--
-- Now: the member reads their own row (the owner's claim widget shows them
-- their zip); nobody else reads any. The badge is page_local_owner_badge(),
-- which returns a boolean and nothing else, so no caller and no later edit to
-- its body can hand back a column the return type does not have.
--
-- Safe to apply before the merge: code still reading the table as a stranger
-- gets an error and shows no badge until the new code is live. Nothing 404s.

drop policy if exists mbj_select_public_active on public.member_business_jurisdictions;

create policy mbj_select_own
  on public.member_business_jurisdictions
  for select
  to authenticated
  using (member_id = auth.uid() and removed_at is null);

revoke select on public.member_business_jurisdictions from anon;

-- True when any active registration on the Page has a zip in the same metro as
-- the Page's anchor Location — the test resolveLocalOwnerBadge ran in the app.
-- Answers only for a Page the caller could see.
create or replace function public.page_local_owner_badge(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select bool_or(public.zip_is_proximal_to_location(j.zip, g.anchor_location_id))
      from public.groups g
      join public.member_business_jurisdictions j
        on j.group_id = g.id and j.removed_at is null
     where g.id = p_group_id
       and g.anchor_location_id is not null
       and (
         (g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
         or g.founder_member_id = auth.uid()
         or exists (
           select 1 from public.group_memberships gm
            where gm.group_id = g.id and gm.member_id = auth.uid() and gm.left_at is null
         )
       )
  ), false)
$$;

revoke all on function public.page_local_owner_badge(uuid) from public;
grant execute on function public.page_local_owner_badge(uuid) to anon, authenticated;
