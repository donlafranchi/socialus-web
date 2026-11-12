-- F117 (#1079) — Wonders v1: a post kind with a threshold and optional sizes, "I'm in" with a size,
-- "I can help as <role>" from the eight playbook roles, the poster accepting helpers. No money.
--   page_posts.kind             'announcement' or 'wonder'. A Wonder is a post, so reports, hiding,
--                               deletion and browse already cover it.
--   page_posts.wonder_*         the threshold (a whole number), the sizes, and how many are in: a count
--                               the handlers keep, so the total rides on the post's own RLS.
--   wonder_interest             one row per member per Wonder, with their size. Read by its member and
--                               the Page's managers only (criterion 7).
--   wonder_offers               a member's offer to help in a role. Read by its member and the Page's
--                               managers only; accepted helpers reach everyone else through wonder_view,
--                               by display name, never by member id (#241, #246).
-- Writes go through the action layer (ADR-7): no write policies.

alter table public.page_posts
  add column kind text not null default 'announcement' check (kind in ('announcement', 'wonder')),
  add column wonder_threshold integer check (wonder_threshold between 1 and 1000000),
  add column wonder_options text[] check (
    wonder_options is null
    or (cardinality(wonder_options) between 1 and 12 and array_position(wonder_options, null) is null)
  ),
  add column wonder_in_count integer not null default 0 check (wonder_in_count >= 0),
  add constraint page_posts_wonder_shape check (
    (kind = 'wonder') = (wonder_threshold is not null)
    and (kind = 'wonder' or wonder_options is null)
  );

comment on column public.page_posts.kind is
  'F117 — announcement (every post before Wonders) or wonder: a post that asks who is in, toward a threshold.';
comment on column public.page_posts.wonder_in_count is
  'F117 — how many members are in. Kept by wonder.join and wonder.leave in the same transaction as the row.';

create table public.wonder_interest (
  post_id     uuid        not null references public.page_posts(id) on delete cascade,
  member_id   uuid        not null references public.members(id) on delete cascade,
  option      text        check (option is null or char_length(option) between 1 and 40),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (post_id, member_id)
);
create index wonder_interest_member on public.wonder_interest (member_id);

create table public.wonder_offers (
  id          uuid        not null default gen_random_uuid() primary key,
  post_id     uuid        not null references public.page_posts(id) on delete cascade,
  member_id   uuid        not null references public.members(id) on delete cascade,
  role        text        not null check (role in ('lead', 'designer', 'pattern_maker', 'sourcing', 'quality', 'logistics', 'support', 'treasurer')),
  note        text        check (note is null or char_length(note) between 1 and 140),
  status      text        not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  unique (post_id, member_id, role)
);
create index wonder_offers_member on public.wonder_offers (member_id);

alter table public.wonder_interest enable row level security;
alter table public.wonder_offers enable row level security;
revoke all on public.wonder_interest, public.wonder_offers from anon, authenticated;
grant select on public.wonder_interest, public.wonder_offers to authenticated;

create policy wonder_interest_select_own_or_manager on public.wonder_interest for select to authenticated
  using (
    member_id = (select auth.uid())
    or exists (select 1 from public.page_posts p
                where p.id = wonder_interest.post_id
                  and p.group_id in (select public.current_member_managing_group_ids()))
  );

create policy wonder_offers_select_own_or_manager on public.wonder_offers for select to authenticated
  using (
    member_id = (select auth.uid())
    or exists (select 1 from public.page_posts p
                where p.id = wonder_offers.post_id
                  and p.group_id in (select public.current_member_managing_group_ids()))
  );

-- What the caller may see of one Wonder, as one projection. Null when the caller is signed out or the
-- post is not a Wonder they could read (live, listed, not hidden, on a live listed Page — or theirs to
-- manage). Everyone who can see it: the total, the threshold, the sizes, their own size and offers, and
-- the accepted helpers by display name. The Page's managers also get the count per size, who is in with
-- their size, and every offer (criteria 3, 4, 6, 7).
create or replace function public.wonder_view(p_post_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  w as (
    select p.id, p.group_id, p.wonder_threshold, p.wonder_options, p.wonder_in_count,
           p.group_id in (select public.current_member_managing_group_ids()) as manages
      from public.page_posts p
      join public.groups g on g.id = p.group_id
     where p.id = p_post_id
       and p.kind = 'wonder'
       and p.dissolved_at is null
       and (select id from me) is not null
       and (
         p.group_id in (select public.current_member_managing_group_ids())
         or (p.lifecycle_state = 'active' and p.discoverability = 'listed' and p.hidden_at is null and p.removed_at is null
             and g.lifecycle_state = 'active' and g.discoverability = 'listed' and g.dissolved_at is null)
       )
  )
  select jsonb_build_object(
    'total', w.wonder_in_count,
    'threshold', w.wonder_threshold,
    'options', to_jsonb(coalesce(w.wonder_options, '{}'::text[])),
    'mine', (select jsonb_build_object('option', i.option)
               from public.wonder_interest i where i.post_id = w.id and i.member_id = (select id from me)),
    'myOffers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'role', o.role, 'status', o.status) order by o.created_at, o.role)
                            from public.wonder_offers o where o.post_id = w.id and o.member_id = (select id from me)), '[]'::jsonb),
    'helpers', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'role', o.role) order by o.decided_at, o.role)
                           from public.wonder_offers o join public.members m on m.id = o.member_id
                          where o.post_id = w.id and o.status = 'accepted' and m.deleted_at is null), '[]'::jsonb)
  )
  || case when not w.manages then '{}'::jsonb else jsonb_build_object(
    'byOption', coalesce((select jsonb_agg(jsonb_build_object('option', u.opt, 'count',
                            (select count(*) from public.wonder_interest i where i.post_id = w.id and i.option = u.opt)) order by u.ord)
                            from unnest(w.wonder_options) with ordinality as u(opt, ord)), '[]'::jsonb),
    'people', coalesce((select jsonb_agg(jsonb_build_object('name', m.display_name, 'option', i.option) order by i.created_at)
                          from public.wonder_interest i join public.members m on m.id = i.member_id where i.post_id = w.id), '[]'::jsonb),
    'offers', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'name', m.display_name, 'role', o.role, 'note', o.note, 'status', o.status)
                                         order by o.created_at, o.role)
                          from public.wonder_offers o join public.members m on m.id = o.member_id where o.post_id = w.id), '[]'::jsonb)
  ) end
  from w
$$;

revoke all on function public.wonder_view(uuid) from public;
grant execute on function public.wonder_view(uuid) to anon, authenticated;
