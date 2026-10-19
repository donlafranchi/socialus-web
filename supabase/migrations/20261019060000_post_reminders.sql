-- #945 (Don, 2026-10-18) — Remind me on a dated post: this one, or every time for a post that repeats.
--   post_reminders   a member's reminders. Exactly one of post_id (this one) or series_id (every time). Private:
--                    a member reads their own; nobody else, the Page owner included. Not item_responses: that points
--                    at Items and its counts are public.
--   reminder_sends   which reminder went for which occurrence and when (evening before, 1 hour before), so each goes once.
-- notification_prefs gains the two timings (both on by default; they only apply once a member asks for a reminder).
-- notification_weekly counts reminders as a kind, and how many went by email.

create table public.post_reminders (
  id          uuid        not null default gen_random_uuid() primary key,
  member_id   uuid        not null references public.members(id) on delete cascade,
  post_id     uuid        references public.page_posts(id) on delete cascade,
  series_id   uuid        references public.post_series(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint post_reminders_one_target check ((post_id is null) <> (series_id is null))
);
create unique index post_reminders_member_post on public.post_reminders (member_id, post_id) where post_id is not null;
create unique index post_reminders_member_series on public.post_reminders (member_id, series_id) where series_id is not null;
alter table public.post_reminders enable row level security;
revoke all on public.post_reminders from anon;
grant select on public.post_reminders to authenticated;
create policy post_reminders_select_own on public.post_reminders for select
  to authenticated
  using (member_id = auth.uid());

create table public.reminder_sends (
  reminder_id  uuid        not null references public.post_reminders(id) on delete cascade,
  occurs_at    timestamptz not null,
  slot         text        not null check (slot in ('evening', 'hour')),
  sent_at      timestamptz not null default now(),
  primary key (reminder_id, occurs_at, slot)
);
alter table public.reminder_sends enable row level security;
revoke all on public.reminder_sends from anon, authenticated;

alter table public.notification_prefs
  add column remind_evening boolean not null default true,
  add column remind_hour    boolean not null default true;

alter table public.notification_weekly drop constraint notification_weekly_kind_check;
alter table public.notification_weekly add constraint notification_weekly_kind_check check (kind in ('follow_posts', 'weekend', 'reminder'));
alter table public.notification_weekly add column emails integer not null default 0;

create or replace function public.notification_count(p_kind text, p_field text, p_n integer default 1)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  wk date := date_trunc('week', now() at time zone 'America/Los_Angeles')::date;
begin
  if p_field not in ('sends', 'opens', 'opt_ins', 'unsubscribes', 'mutes', 'emails') then
    raise exception 'notification_count: unknown field %', p_field;
  end if;
  insert into public.notification_weekly (week_start, kind) values (wk, p_kind) on conflict do nothing;
  execute format('update public.notification_weekly set %I = %I + $1 where week_start = $2 and kind = $3', p_field, p_field)
    using p_n, wk, p_kind;
end;
$$;
revoke all on function public.notification_count(text, text, integer) from public, anon, authenticated;
