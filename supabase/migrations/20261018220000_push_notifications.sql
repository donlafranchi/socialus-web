-- #904 (Don, 2026-10-18, option A) — opt-in web push. Members choose each kind; nothing is on by default.
--   push_subscriptions       a member's browsers and phones (the push endpoint and its keys). Private: no API role reads it.
--   notification_prefs       which kinds a member turned on, quiet hours, pause. A member reads their own.
--   notification_queue       followed Pages' new real posts waiting to go out, batched by the sender.
--   notification_sends       when a member was last sent each kind: the daily cap. Kept 30 days, never reported.
--   notification_weekly      aggregate counts per kind per week: the review loop reads only this. No member ids.
--   notification_cursor      how far the sender has read page_posts.
-- Writes go through the action layer or the sender (service role); RLS is on everywhere.

create table public.push_subscriptions (
  id          uuid        not null default gen_random_uuid() primary key,
  member_id   uuid        not null references public.members(id) on delete cascade,
  endpoint    text        not null unique check (char_length(endpoint) between 12 and 2000 and endpoint like 'https://%'),
  p256dh      text        not null check (char_length(p256dh) between 1 and 200),
  auth        text        not null check (char_length(auth) between 1 and 100),
  platform    text        not null check (platform in ('ios', 'android', 'desktop', 'other')),
  created_at  timestamptz not null default now()
);
create index idx_push_subscriptions_member on public.push_subscriptions (member_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create table public.notification_prefs (
  member_id     uuid        not null primary key references public.members(id) on delete cascade,
  follow_posts  boolean     not null default false,
  weekend       boolean     not null default false,
  paused        boolean     not null default false,
  quiet_start   smallint    not null default 21 check (quiet_start between 0 and 23),
  quiet_end     smallint    not null default 8 check (quiet_end between 0 and 23),
  updated_at    timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
revoke all on public.notification_prefs from anon;
grant select on public.notification_prefs to authenticated;
create policy notification_prefs_select_own on public.notification_prefs for select
  to authenticated
  using (member_id = auth.uid());

create table public.notification_queue (
  member_id  uuid        not null references public.members(id) on delete cascade,
  post_id    uuid        not null references public.page_posts(id) on delete cascade,
  queued_at  timestamptz not null default now(),
  primary key (member_id, post_id)
);
alter table public.notification_queue enable row level security;
revoke all on public.notification_queue from anon, authenticated;

create table public.notification_sends (
  member_id  uuid        not null references public.members(id) on delete cascade,
  kind       text        not null check (kind in ('follow_posts', 'weekend')),
  sent_at    timestamptz not null default now()
);
create index idx_notification_sends_member on public.notification_sends (member_id, kind, sent_at desc);
alter table public.notification_sends enable row level security;
revoke all on public.notification_sends from anon, authenticated;

create table public.notification_weekly (
  week_start        date    not null,
  kind              text    not null check (kind in ('follow_posts', 'weekend')),
  sends             integer not null default 0,
  opens             integer not null default 0,
  opt_ins           integer not null default 0,
  unsubscribes      integer not null default 0,
  mutes             integer not null default 0,
  opted_in_members  integer,
  members           integer,
  primary key (week_start, kind)
);
alter table public.notification_weekly enable row level security;
revoke all on public.notification_weekly from anon, authenticated;

comment on table public.notification_weekly is
  '#904: counts only, one row per kind per week (Monday, Pacific). mutes counts "pause all" (written under both kinds); opted_in_members and members are a snapshot taken by the weekly send.';

create table public.notification_cursor (
  id       smallint    not null primary key default 1 check (id = 1),
  read_to  timestamptz not null
);
alter table public.notification_cursor enable row level security;
revoke all on public.notification_cursor from anon, authenticated;
insert into public.notification_cursor (id, read_to) values (1, now());

-- Adds n to one count for this week. Only the service role and the action layer (postgres) call it.
create function public.notification_count(p_kind text, p_field text, p_n integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wk date := date_trunc('week', now() at time zone 'America/Los_Angeles')::date;
begin
  if p_field not in ('sends', 'opens', 'opt_ins', 'unsubscribes', 'mutes') then
    raise exception 'notification_count: unknown field %', p_field;
  end if;
  insert into public.notification_weekly (week_start, kind) values (wk, p_kind) on conflict do nothing;
  execute format('update public.notification_weekly set %I = %I + $1 where week_start = $2 and kind = $3', p_field, p_field)
    using p_n, wk, p_kind;
end;
$$;
revoke all on function public.notification_count(text, text, integer) from public, anon, authenticated;
