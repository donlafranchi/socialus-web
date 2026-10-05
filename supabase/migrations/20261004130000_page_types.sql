-- #363 — every Page is an organization; its two types are business and group,
-- and the use cases are presets under them (ruled 2026-10-05; socialus-plan
-- planning/PAGE-KINDS.md). The six stored kinds map as PAGE-KINDS.md § The six
-- existing values: business → business/selling; place, interest, practice,
-- event_anchored and family → group/gathering. Family keeps its privacy, which
-- is already its own column. The SQL that branches on kind only ever asked
-- "business or not" (managing role, standing presence), so it stays right.

-- The three social groups stored as businesses (as #362, which this repeats so
-- either order applies cleanly). The managing role follows the type, so it
-- moves first.
update public.group_memberships
   set role = 'steward'
 where role = 'owner'
   and left_at is null
   and group_id in (
     '5eff4220-a441-4785-a567-57e7fb34792c', -- SacRiver Floaters
     'dd3867ac-f45d-4c34-b41a-7c7c2b5c9e9a', -- Stare at the stars
     '52bffd79-2513-4164-a95f-c6145e3232c0'  -- Folsom Lake Floaters
   )
   and exists (select 1 from public.groups g where g.id = group_id and g.kind = 'business');

update public.groups
   set kind = 'interest'
 where kind = 'business'
   and id in (
     '5eff4220-a441-4785-a567-57e7fb34792c',
     'dd3867ac-f45d-4c34-b41a-7c7c2b5c9e9a',
     '52bffd79-2513-4164-a95f-c6145e3232c0'
   );

alter table public.groups drop constraint groups_kind_check;

alter table public.groups
  add column use_case text check (use_case in ('selling', 'service', 'gathering', 'testing_interest'));

update public.groups
   set use_case = case when kind = 'business' then 'selling' else 'gathering' end,
       kind = case when kind = 'business' then 'business' else 'group' end;

alter table public.groups
  alter column use_case set not null,
  add constraint groups_kind_check check (kind in ('business', 'group')),
  add constraint groups_use_case_fits_kind check (
    (kind = 'business' and use_case in ('selling', 'service'))
    or (kind = 'group' and use_case in ('gathering', 'testing_interest'))
  );

-- A new Page without a use case starts on its type's first preset; the family
-- kind that defaulted to private is gone (privacy is chosen, not implied).
create or replace function public.groups_default_discoverability()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if NEW.discoverability is null then
    NEW.discoverability := 'listed';
  end if;
  if NEW.use_case is null then
    NEW.use_case := case NEW.kind when 'business' then 'selling' else 'gathering' end;
  end if;
  return NEW;
end;
$$;

-- groups is granted column by column: a new column is read by nobody until named.
grant select (use_case) on public.groups to anon, authenticated;
