-- #363 — purpose first, type for listing (Don ruled A, 2026-10-05). Every Page
-- has ONE primary purpose, what it mainly accomplishes: gather, sell, offer (a
-- service, or teaching) or create. Beta's four match Create's four answers.
-- The type (business or group) follows from the purpose by default, can be
-- changed in settings, and drives browsing, filters and the Locally owned badge.
-- groups.purpose holds the purpose; groups.kind holds the type.
--
-- The six stored kinds map: business -> sell; place, interest, event_anchored
-- -> gather; practice -> offer; family -> gather, private. Types are kept as
-- they are (business stays business, the rest become group), so no founder's
-- managing role moves: a practice Page is an offer-purpose group until its
-- owner changes the type. The SQL that branches on kind only ever asked
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
  add column purpose text check (purpose in ('gather', 'sell', 'offer', 'create'));

update public.groups
   set purpose = case kind when 'business' then 'sell' when 'practice' then 'offer' else 'gather' end,
       discoverability = case when kind = 'family' then 'private' else discoverability end,
       kind = case when kind = 'business' then 'business' else 'group' end;

alter table public.groups
  alter column purpose set not null,
  add constraint groups_kind_check check (kind in ('business', 'group'));

-- A new Page without a purpose takes its type's: sell for a business, gather
-- for a group. The family kind that defaulted to private is gone (privacy is
-- chosen, not implied).
--
-- BACKWARD COMPATIBLE ON PURPOSE. This applies before its code reaches main
-- (#364 is stacked), and main's Create still inserts the old kinds. A BEFORE
-- INSERT trigger runs ahead of the CHECK, so an old kind is translated here, as
-- the backfill above maps it: practice -> an offer group; place, interest,
-- event_anchored -> a gather group; family -> a private gather group.
create or replace function public.groups_default_discoverability()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if NEW.kind in ('place', 'interest', 'event_anchored', 'family', 'practice') then
    if NEW.purpose is null then
      NEW.purpose := case NEW.kind when 'practice' then 'offer' else 'gather' end;
    end if;
    if NEW.kind = 'family' then
      NEW.discoverability := 'private';
    end if;
    NEW.kind := 'group';
  end if;
  if NEW.discoverability is null then
    NEW.discoverability := 'listed';
  end if;
  if NEW.purpose is null then
    NEW.purpose := case NEW.kind when 'business' then 'sell' else 'gather' end;
  end if;
  return NEW;
end;
$$;

-- groups is granted column by column: a new column is read by nobody until named.
grant select (purpose) on public.groups to anon, authenticated;
