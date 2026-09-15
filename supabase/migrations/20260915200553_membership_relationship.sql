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
-- reader is an explicit member of. The Page's own owner is an explicit member,
-- so without this change the owner — and every other member — can read the
-- follower list of their own open Page.
--
-- F067 acceptance 2 is explicit that this includes the Page's own side:
-- "a business Page's followers are never visible to anyone, including the
-- business's own visitors, except a count where it earns its place."
--
-- Found by tests/follower-privacy-db.test.ts rather than by reading the
-- policy, which is why the test reads through RLS as three different people
-- rather than asserting the DDL.
--
-- Narrowed, not closed: co-members of a private Page still see each other,
-- because their rows carry relationship = 'member' (acceptance 3). The count
-- is unaffected — it is read server-side, where RLS does not apply.

drop policy if exists memberships_select_co_member on public.group_memberships;

create policy memberships_select_co_member
  on public.group_memberships
  for select
  using (
    group_id in (select current_member_explicit_group_ids())
    and relationship <> 'follower'
  );

comment on policy memberships_select_co_member on public.group_memberships is
  'Explicit members of a Group read that Group''s memberships, EXCEPT followers. A follower of an open Page is visible to nobody, including the Page''s own owner (F067 acceptance 2). A member''s own row stays readable through memberships_select_self whatever the relationship, which is what the follow control reads.';
