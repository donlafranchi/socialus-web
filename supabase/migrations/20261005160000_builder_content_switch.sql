-- #388 — builder content, handled all at once (Don, 2026-10-05: "a way to
-- delete remove hide or archive any agent created stuff", then "prioritise
-- GLOBAL actions"). Two controls:
--
-- 1. A switch, "builder content visible to members", on by default in beta.
--    On, a builder's Pages, Posts, items and locations show to everyone; off,
--    to builders only, as #280 had it. Newer than #280 (2026-10-01), so it
--    replaces that ruling's "builders only" for content.
-- 2. delete_builder_content(): every row a builder account made, gone. The
--    accounts stay, so the daily run can start again.
--
-- A builder's RELATIONS to real Pages — follows, joins, RSVPs — never count,
-- whichever way the switch is set (#280): seed content must not inflate a
-- real owner's numbers. So relations keep the switchless rule.

create table public.builder_content (
  id boolean primary key default true check (id),
  visible boolean not null default true,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.members(id) on delete set null
);
insert into public.builder_content default values;
alter table public.builder_content enable row level security;
revoke all on public.builder_content from anon, authenticated;

create or replace function public.builder_content_visible()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select visible from public.builder_content), true)
$$;

-- Relations: #280's rule, unchanged.
create or replace function public.builder_relation_visible(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select p_member_id is null
      or not public.is_builder(p_member_id)
      or public.current_member_is_builder()
$$;

-- Content: the same, or the switch is on.
create or replace function public.builder_visible(p_member_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select public.builder_relation_visible(p_member_id) or public.builder_content_visible()
$$;

alter policy item_responses_builder_only on public.item_responses
  using (public.builder_relation_visible(responder_member_id));
alter policy group_memberships_builder_only on public.group_memberships
  using (public.builder_relation_visible(member_id));
alter policy member_follows_builder_only on public.member_follows
  using (public.builder_relation_visible(follower_member_id) and public.builder_relation_visible(followed_member_id));

create or replace function public.page_listed_member_counts(p_group_ids uuid[])
returns table (group_id uuid, members integer)
language sql
stable
security definer
set search_path = ''
as $$
  select v.group_id, count(*)::integer
    from public.member_public_group_memberships v
   where v.group_id = any(p_group_ids)
     and public.builder_relation_visible(v.member_id)
   group by v.group_id
$$;

-- Everything a builder made. Member-made rows are never touched, with three
-- consequences stated rather than hidden: a member's follow or join of a
-- builder Page goes with the Page (it points at nothing); tags are kept, since
-- a member's Page may carry one a builder created; and a builder location a
-- member's row still points at is kept. Reports a builder filed go; a member's
-- report about a builder Page stays as the record it is.
create or replace function public.delete_builder_content()
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  n_pages int; n_items int; n_follows int; n_memberships int; n_responses int; n_reports int; n_locations int;
begin
  delete from public.reports r using public.builders b where r.reporter_member_id = b.member_id;
  get diagnostics n_reports = row_count;
  delete from public.member_follows f
   where public.is_builder(f.follower_member_id) or public.is_builder(f.followed_member_id);
  get diagnostics n_follows = row_count;
  delete from public.item_responses r using public.builders b where r.responder_member_id = b.member_id;
  get diagnostics n_responses = row_count;
  delete from public.group_memberships m using public.builders b where m.member_id = b.member_id;
  get diagnostics n_memberships = row_count;
  delete from public.items i using public.builders b where i.member_id = b.member_id;
  get diagnostics n_items = row_count;
  delete from public.groups g using public.builders b where g.founder_member_id = b.member_id;
  get diagnostics n_pages = row_count;
  delete from public.locations l using public.builders b
   where l.member_id = b.member_id
     and not exists (select 1 from public.groups g where g.anchor_location_id = l.id)
     and not exists (select 1 from public.page_posts p where p.location_id = l.id)
     and not exists (select 1 from public.item_locations il where il.location_id = l.id)
     and not exists (select 1 from public.members m where m.home_location_id = l.id)
     and not exists (select 1 from public.member_saved_searches s where s.location_id = l.id);
  get diagnostics n_locations = row_count;
  return jsonb_build_object(
    'pages', n_pages, 'items', n_items, 'follows', n_follows, 'memberships', n_memberships,
    'responses', n_responses, 'reports', n_reports, 'locations', n_locations);
end $$;
revoke all on function public.delete_builder_content() from public, anon, authenticated;
revoke all on function public.builder_content_visible() from public;
grant execute on function public.builder_content_visible() to anon, authenticated;
grant execute on function public.builder_relation_visible(uuid) to anon, authenticated;
