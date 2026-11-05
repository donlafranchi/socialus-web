-- #1183 — a member posts without a Page (plan #270, Don ruled B): Lost & found, Free / for sale, Ask a neighbor.
-- Signed with display name, avatar and neighborhood; never a profile. Each expires on its own, a member has a few
-- live at once, and the only answer is "I'm interested" / "I saw it", which the poster alone sees, by display name.
-- Reportable on the courtesy-first path (subject kind member_post). Signed-in readers only, through
-- member_posts_read(); writes go through the action layer (ADR-7), so there are no write policies.

create table public.member_posts (
  id               uuid        primary key default gen_random_uuid(),
  member_id        uuid        not null references public.members(id) on delete cascade,
  kind             text        not null check (kind in ('lost_found', 'free_sale', 'ask')),
  body             text        not null check (char_length(btrim(body)) between 1 and 1000),
  place_id         uuid        not null references public.places(id),
  -- A yard sale's day, and its street, shown until that day ends. Only on Free / for sale.
  sale_on          date,
  street           text        check (street is null or char_length(btrim(street)) between 1 and 120),
  labels_pinned    boolean     not null default false,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  withdrawn_at     timestamptz,
  hidden_at        timestamptz,
  removed_at       timestamptz,
  hide_locked_body text,
  constraint member_posts_sale_day check (sale_on is null or kind = 'free_sale'),
  constraint member_posts_street_on_a_sale check (street is null or sale_on is not null)
);
create index member_posts_live on public.member_posts (expires_at desc)
  where withdrawn_at is null and hidden_at is null and removed_at is null;
create index member_posts_member on public.member_posts (member_id, created_at desc);

create table public.member_post_tags (
  post_id uuid not null references public.member_posts(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (post_id, tag_id)
);

create table public.member_post_responses (
  post_id    uuid        not null references public.member_posts(id) on delete cascade,
  member_id  uuid        not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, member_id)
);

alter table public.member_posts enable row level security;
alter table public.member_post_tags enable row level security;
alter table public.member_post_responses enable row level security;
revoke all on public.member_posts, public.member_post_tags, public.member_post_responses from anon, authenticated;
-- A member reads their own rows directly; everyone else's go through member_posts_read().
grant select on public.member_posts, public.member_post_responses to authenticated;
create policy member_posts_select_own on public.member_posts for select to authenticated
  using (member_id = (select auth.uid()));
create policy member_post_responses_select_own on public.member_post_responses for select to authenticated
  using (member_id = (select auth.uid()));

-- What a signed-in reader may see: live posts in scope (a metro or a place), one post, or a search. A post's own
-- author also sees who answered, by display name. Never a member id of anyone else, never their area.
create or replace function public.member_posts_read(
  p_metro_id uuid default null,
  p_place_id uuid default null,
  p_post_id  uuid default null,
  p_search   text default null,
  p_limit    int  default 30
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (select (select auth.uid()) as id),
  scope as (
    select mp.geography::public.geometry as g from public.metro_polygons mp where p_metro_id is not null and mp.id = p_metro_id
    union all
    select pl.geography::public.geometry from public.places pl where p_place_id is not null and pl.id = p_place_id and pl.deleted_at is null
  ),
  live as (
    select p.*, pl.display_name as place_name
      from public.member_posts p
      join public.places pl on pl.id = p.place_id
      join public.members m on m.id = p.member_id and m.deleted_at is null
     where (select id from me) is not null
       and p.removed_at is null
       and (p.member_id = (select id from me)
            or (p.withdrawn_at is null and p.hidden_at is null and p.expires_at > now()))
       and (p_post_id is null or p.id = p_post_id)
       and (p_post_id is not null
            or exists (select 1 from scope s
                        where public.st_intersects(s.g, coalesce(pl.centroid::public.geometry, public.st_pointonsurface(pl.geography::public.geometry)))))
       and (p_post_id is not null or (p.withdrawn_at is null and p.hidden_at is null and p.expires_at > now()))
       and (p_search is null or strpos(lower(p.body), lower(p_search)) > 0
            or exists (select 1 from public.member_post_tags pt join public.tags t on t.id = pt.tag_id
                        where pt.post_id = p.id and strpos(t.normalized, lower(p_search)) > 0))
     order by p.created_at desc
     limit greatest(1, least(p_limit, 60))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', l.id,
    'kind', l.kind,
    'body', l.body,
    'placeName', l.place_name,
    'saleOn', l.sale_on,
    -- The street shows until the sale's day is over, in the metro's time.
    'street', case when l.sale_on >= (now() at time zone 'America/Los_Angeles')::date then l.street end,
    'createdAt', l.created_at,
    'expiresAt', l.expires_at,
    'labelsPinned', l.labels_pinned,
    'displayName', m.display_name,
    'avatarUrl', m.avatar_url,
    'mine', l.member_id = (select id from me),
    'ended', l.withdrawn_at is not null or l.hidden_at is not null or l.expires_at <= now(),
    'answered', exists (select 1 from public.member_post_responses r where r.post_id = l.id and r.member_id = (select id from me)),
    'labels', coalesce((select jsonb_agg(t.label order by t.label) from public.member_post_tags pt join public.tags t on t.id = pt.tag_id where pt.post_id = l.id), '[]'::jsonb),
    'answers', case when l.member_id = (select id from me) then coalesce((
        select jsonb_agg(jsonb_build_object('displayName', rm.display_name, 'at', r.created_at) order by r.created_at desc)
          from public.member_post_responses r join public.members rm on rm.id = r.member_id and rm.deleted_at is null
         where r.post_id = l.id), '[]'::jsonb) end
  ) order by l.created_at desc), '[]'::jsonb)
    from live l
    join public.members m on m.id = l.member_id
$$;
-- Granted to anon too, and answered empty inside: a revoked function crashes the local stack when anon calls it.
grant execute on function public.member_posts_read(uuid, uuid, uuid, text, int) to anon, authenticated;

-- Reportable like everything else (F078): a new subject kind, with no Page behind it.
alter table public.reports drop constraint reports_subject_kind_check;
alter table public.reports add constraint reports_subject_kind_check
  check (subject_kind in ('group', 'post', 'page_picture', 'post_photo', 'page_words', 'page_item', 'member_post'));
alter table public.member_notices drop constraint member_notices_subject_kind_check;
alter table public.member_notices add constraint member_notices_subject_kind_check
  check (subject_kind in ('group', 'post', 'page_picture', 'post_photo', 'page_words', 'page_item', 'member_post'));
alter table public.legal_holds drop constraint legal_holds_subject_kind_check;
alter table public.legal_holds add constraint legal_holds_subject_kind_check
  check (subject_kind in ('group', 'post', 'page_picture', 'post_photo', 'page_words', 'page_item', 'member_post'));
alter table public.legal_holds alter column group_id drop not null;

-- With no Page, a member post's events are the poster's.
alter table public.member_events drop constraint member_events_event_kind_check;
alter table public.member_events add constraint member_events_event_kind_check
  check (event_kind in (
    'member.created', 'member.profile_updated', 'member.home_location_set', 'member.privacy_changed',
    'member.maker_mode_changed', 'member.followed', 'member.unfollowed', 'member.interest_added',
    'member.interest_removed', 'member.delegation_granted', 'member.delegation_revoked', 'member.deleted',
    'member.restored', 'member.export_requested', 'member.purge_executed', 'member.handle_changed',
    'member.place_interest_added', 'member.place_interest_removed', 'member.place_interest_promoted',
    'member.place_interest_demoted', 'member.saved_search.created', 'member.saved_search.updated',
    'member.saved_search.removed', 'member.business_jurisdiction_set', 'member.business_jurisdiction_removed',
    'member.post_created', 'member.post_withdrawn', 'member.post_reported', 'member.post_hidden',
    'member.post_restored', 'member.post_removed', 'member.decision_reversed'
  ));

-- /neighbors is a route now: no Page or place may take it as an address (#1139).
create or replace function public.url_reserved(p text) returns boolean
language sql immutable parallel safe
set search_path = public
as $$
  select p = any (array[
    'about', 'add-entity-demo', 'admin', 'api', 'apple-icon', 'auth', 'business', 'card-gallery', 'composer-demo',
    'create', 'edit', 'explore', 'favicon', 'following', 'fonts', 'g', 'icons', 'join', 'landing', 'm', 'manifest',
    'map', 'neighbors', 'offline', 'og-default', 'onboarding', 'open', 'p', 'playground', 'posts', 'privacy', 'push-sw', 'qr',
    'register-business', 'report', 'robots', 'rules', 'sitemap', 'storage', 'sw', 'terms', 'unclaimed-demo',
    'welcome', 'you'
  ])
$$;
