-- F067 — a follower and a member are different things.
--
-- Spec: planning/scenario-F067.md
--       product/systems/groups.md § Membership
--       ADR-7 (action-layer writes)
--
-- `member_follows` is member-to-member only, so a Page cannot be followed at
-- all today. The fix is one column on the row that already models attachment
-- to a Page, rather than a second table: same row, same guards, one new word.
--
-- WHICH ONE APPLIES IS DECIDED BY PRIVACY, not by kind (Don, 2026-09-15).
-- A private Page is joined; anything else is followed. F067 acceptance 1 keyed
-- this on `kind` (business = follower, group = member); that is superseded.
-- The reason privacy is the better hinge: a bakery and a run club can both be
-- open to anyone, and what differs is whether the thing is closed, not what
-- sort of thing it is.
--
-- Default 'member' is the honest backfill: every row that exists today was
-- written by group.create or group.member_join, both explicit joins.

alter table public.group_memberships
  add column relationship text not null default 'member'
    check (relationship in ('member', 'follower'));

-- The follower list of an open Page is read by nobody, so the index that
-- matters is the count and the "am I following" lookup.
create index idx_group_memberships_relationship
  on public.group_memberships (group_id, relationship)
  where left_at is null;

comment on column public.group_memberships.relationship is
  'member or follower. Privacy decides which is written (Don, 2026-09-15): a private Page is joined as a member, anything else is followed. Confers no authorization of its own — F067 acceptance 4 — and every guard rail F065 established still holds. Followers are written with source=''soft_via_follow'', which is what keeps them out of memberships_select_listed_group and satisfies F067 acceptance 2.';

-- NO RLS CHANGE, and that is the load-bearing part.
--
-- `memberships_select_listed_group` already reads:
--     discoverability = 'listed' AND left_at is null AND source = 'explicit'
--
-- A follower is written with source='soft_via_follow', so that policy does not
-- return them. F067 acceptance 2 — "a business Page's followers are never
-- visible to anyone, including the business's own visitors" — is therefore
-- satisfied by the policy that is already there, provided the handler writes
-- the right source. The handler test asserts the source for that reason.
--
-- Members of a social group stay visible to each other through
-- `memberships_select_co_member`, whose helper filters source='explicit'
-- (F067 acceptance 3). A follower is not a co-member and reads nobody.

------------------------------------------------------------
-- The one policy that does need changing
------------------------------------------------------------

-- `memberships_select_co_member` admits every membership row of any group the
-- reader is an explicit member of. Followers of an open Page should not be in
-- that set for every member of the Page. But the Page's OWNER should see them
-- (Don, 2026-09-15) — knowing who follows you is the point of being followed.
--
-- So the policy narrows for members and opens for whoever runs the Page.
--
-- OPEN, and deliberately not built either way: whether followers can see EACH
-- OTHER. Don has not ruled. It stays closed here, because closed is reversible
-- and open is not — once a follower list has been shown to other followers,
-- it cannot be unshown. A follower is not an explicit member, so
-- current_member_explicit_group_ids() excludes them and they read nobody.

-- Mirrors current_member_explicit_group_ids: SECURITY DEFINER so the policy
-- below can consult group_memberships without recursing into its own RLS.
-- The managing role differs by kind — 'owner' for a business Page, 'steward'
-- for the community kinds (see managingRoleForKind) — so both count.
create or replace function public.current_member_managed_group_ids()
returns setof uuid
language sql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $fn$
  select group_id
    from public.group_memberships
   where member_id = auth.uid()
     and left_at is null
     and source = 'explicit'
     and role in ('owner', 'steward');
$fn$;

revoke all on function public.current_member_managed_group_ids() from public;
grant execute on function public.current_member_managed_group_ids() to anon, authenticated;

comment on function public.current_member_managed_group_ids() is
  'Groups the current member runs — role owner or steward, the two managing roles. Used by memberships_select_co_member so a Page owner can read their own follower list (Don, 2026-09-15) while ordinary members cannot.';

drop policy if exists memberships_select_co_member on public.group_memberships;

create policy memberships_select_co_member
  on public.group_memberships
  for select
  using (
    group_id in (select current_member_explicit_group_ids())
    and (
      -- Members of a Page see each other, as they always have.
      relationship <> 'follower'
      -- ...and whoever runs the Page also sees who follows it.
      or group_id in (select current_member_managed_group_ids())
    )
  );

comment on policy memberships_select_co_member on public.group_memberships is
  'Explicit members of a Group read that Group''s memberships. Followers are excluded EXCEPT for whoever runs the Page (role owner or steward), who may read their own follower list (Don, 2026-09-15). Whether followers can see each other is undecided and stays closed: a follower is not an explicit member, so this policy never returns anything to one. A member''s own row stays readable through memberships_select_self whatever the relationship, which is what the follow control reads.';
