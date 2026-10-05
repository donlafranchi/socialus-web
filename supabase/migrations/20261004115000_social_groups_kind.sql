-- #361 — three social groups were stored as businesses: the old walkthrough
-- created every Page as `business` while the Page resolver could find no other
-- kind (removed in T156). They're groups (Don, 2026-10-05), so they lose the
-- business-only features (the Locally Owned badge and question).
--
-- The founder's managing role follows the kind (managingRoleForKind: owner for
-- business, steward otherwise), so it moves first, or the Page would have no
-- manager. Their group_businesses rows are kept, not deleted.

update public.group_memberships
   set role = 'steward'
 where role = 'owner'
   and left_at is null
   and group_id in (
     '5eff4220-a441-4785-a567-57e7fb34792c', -- SacRiver Floaters
     'dd3867ac-f45d-4c34-b41a-7c7c2b5c9e9a', -- Stare at the stars
     '52bffd79-2513-4164-a95f-c6145e3232c0'  -- Folsom Lake Floaters
   );

update public.groups
   set kind = 'interest'
 where kind = 'business'
   and id in (
     '5eff4220-a441-4785-a567-57e7fb34792c',
     'dd3867ac-f45d-4c34-b41a-7c7c2b5c9e9a',
     '52bffd79-2513-4164-a95f-c6145e3232c0'
   );
