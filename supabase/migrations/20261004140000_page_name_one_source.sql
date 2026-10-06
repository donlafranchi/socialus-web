-- Bug #410 — a business Page's name and description live on two rows:
-- groups (read by Explore and the feed) and group_businesses (read by the Page
-- and checked by group.activate). Editing a published Page wrote only groups,
-- so a renamed Page kept its old name on its own Page.
--
-- groups is the source of truth. The business row is kept equal to it by the
-- database, whichever row a handler writes, so no writer can split them again.

-- 1. Reconcile once. The groups row holds the owner's latest edit, except where
--    it is empty or still the draft placeholder and the business row is not.
update public.groups g
   set name = b.display_name
  from public.group_businesses b
 where b.group_id = g.id
   and (g.name is null or btrim(g.name) = '' or g.name = 'untitled-draft')
   and btrim(coalesce(b.display_name, '')) not in ('', 'untitled-draft');

update public.groups g
   set description = b.public_description
  from public.group_businesses b
 where b.group_id = g.id
   and btrim(coalesce(g.description, '')) = ''
   and btrim(coalesce(b.public_description, '')) <> '';

update public.group_businesses b
   set display_name = g.name,
       public_description = g.description
  from public.groups g
 where g.id = b.group_id
   and (b.display_name is distinct from g.name or b.public_description is distinct from g.description);

-- 2. Keep them equal. Each trigger writes only when the other row differs, so
--    the pair settles after one hop.
create or replace function public.mirror_group_text_to_business()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_businesses b
     set display_name = new.name,
         public_description = new.description
   where b.group_id = new.id
     and (b.display_name is distinct from new.name or b.public_description is distinct from new.description);
  return null;
end;
$$;

create or replace function public.mirror_business_text_to_group()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.groups g
     set name = new.display_name,
         description = new.public_description
   where g.id = new.group_id
     and (g.name is distinct from new.display_name or g.description is distinct from new.public_description);
  return null;
end;
$$;

revoke all on function public.mirror_group_text_to_business() from public, anon, authenticated;
revoke all on function public.mirror_business_text_to_group() from public, anon, authenticated;

create trigger groups_mirror_text_to_business
  after update of name, description on public.groups
  for each row
  when (old.name is distinct from new.name or old.description is distinct from new.description)
  execute function public.mirror_group_text_to_business();

create trigger group_businesses_mirror_text_to_group
  after update of display_name, public_description on public.group_businesses
  for each row
  when (old.display_name is distinct from new.display_name or old.public_description is distinct from new.public_description)
  execute function public.mirror_business_text_to_group();
