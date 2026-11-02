-- #1171 (socialus-plan #269, Don 2026-11-02): "I kinda like both Heart and Save", "As separate things".
--   hearts   "I like this", on a post or a Page. Its member reads their own rows. The Page's managers see who, by
--            display name, newest first, only through heart_view (option A, ruled 2026-11-02); never a member id.
--            A heart subscribes no one. It is a declared interest signal: created_at is kept for the taste scale.
--   saves    "Keep this for later", on a post. Private: only its member reads it.
-- heart_view returns each count to anyone who may see the Page; whether a count shows publicly is the app's flag
-- (PUBLIC_HEART_COUNT), because public counts are open for review, not ruled.
-- Writes go through the action layer (ADR-7): no write policies.

create table public.hearts (
  member_id   uuid        not null references public.members(id) on delete cascade,
  post_id     uuid        references public.page_posts(id) on delete cascade,
  group_id    uuid        references public.groups(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint hearts_one_target check (num_nonnulls(post_id, group_id) = 1)
);
create unique index hearts_member_post on public.hearts (member_id, post_id) where post_id is not null;
create unique index hearts_member_group on public.hearts (member_id, group_id) where group_id is not null;
create index hearts_post on public.hearts (post_id, created_at desc) where post_id is not null;
create index hearts_group on public.hearts (group_id, created_at desc) where group_id is not null;

create table public.saves (
  member_id   uuid        not null references public.members(id) on delete cascade,
  post_id     uuid        not null references public.page_posts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (member_id, post_id)
);

alter table public.hearts enable row level security;
alter table public.saves enable row level security;
revoke all on public.hearts, public.saves from anon, authenticated;
grant select on public.hearts, public.saves to authenticated;

create policy hearts_select_own on public.hearts for select to authenticated using (member_id = (select auth.uid()));
create policy saves_select_own on public.saves for select to authenticated using (member_id = (select auth.uid()));

-- The hearts on one Page and its posts, for a signed-in caller who may see the Page. Everyone gets the counts;
-- the Page's managers also get the names, newest first, at most 50 each. A deleted member is neither.
create or replace function public.heart_view(p_group_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with g as (
    select g.id, g.id in (select public.current_member_managing_group_ids()) as manages
      from public.groups g
     where g.id = p_group_id
       and (select auth.uid()) is not null
       and g.dissolved_at is null
       and (
         g.id in (select public.current_member_managing_group_ids())
         or (g.lifecycle_state = 'active' and g.unclaimed_hidden_at is null
             and (g.discoverability = 'listed' or g.id in (select public.current_member_roster_group_ids())))
       )
  ),
  h as (
    select h.post_id, h.group_id, h.created_at, h.member_id, m.display_name
      from public.hearts h
      join public.members m on m.id = h.member_id and m.deleted_at is null
      left join public.page_posts p on p.id = h.post_id
     where h.group_id = (select id from g)
        or (p.group_id = (select id from g) and p.dissolved_at is null and p.removed_at is null
            and ((select manages from g) or (p.lifecycle_state = 'active' and p.hidden_at is null)))
  ),
  per_post as (
    select h.post_id, count(*)::int as n,
           (array_agg(h.display_name order by h.created_at desc, h.member_id))[1:50] as names
      from h where h.post_id is not null group by h.post_id
  )
  select jsonb_build_object(
    'manages', g.manages,
    'page', jsonb_build_object('count', (select count(*)::int from h where h.group_id is not null))
            || case when g.manages then jsonb_build_object('names', coalesce(
                 (select to_jsonb((array_agg(h.display_name order by h.created_at desc, h.member_id))[1:50]) from h where h.group_id is not null),
                 '[]'::jsonb)) else '{}'::jsonb end,
    'posts', coalesce((select jsonb_agg(jsonb_build_object('postId', pp.post_id, 'count', pp.n)
                                        || case when g.manages then jsonb_build_object('names', to_jsonb(pp.names)) else '{}'::jsonb end
                                        order by pp.post_id)
                         from per_post pp), '[]'::jsonb)
  )
  from g
$$;

revoke all on function public.heart_view(uuid) from public;
grant execute on function public.heart_view(uuid) to anon, authenticated;

-- Follow becomes "Get updates" (#269); the shelf it feeds keeps its id and kind.
update public.shelves set name = 'Updates from your Pages' where id = 'from-who-you-follow';
