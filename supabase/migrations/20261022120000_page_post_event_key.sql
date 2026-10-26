-- #997 (Don, 2026-10-22) — a venue's real shows, imported daily from its own calendar.
--   page_posts.event_key   one post per venue + night + title, so a re-import updates in place. Null on every other post.
--   page_posts.ticket_url  the venue's own ticket link for that show: the one link besides Directions that leaves the app.
--   post_reminders.shows_group_id  "Remind me every time" on a venue: each of its shows, as they are imported.
alter table public.page_posts
  add column if not exists event_key text,
  add column if not exists ticket_url text check (ticket_url is null or ticket_url ~ '^https?://');
create unique index if not exists page_posts_group_event_key on public.page_posts (group_id, event_key) where event_key is not null;

alter table public.post_reminders
  add column if not exists shows_group_id uuid references public.groups(id) on delete cascade,
  drop constraint if exists post_reminders_one_target,
  add constraint post_reminders_one_target check (num_nonnulls(post_id, series_id, stall_id, shows_group_id) = 1);
create unique index if not exists post_reminders_member_shows on public.post_reminders (member_id, shows_group_id) where shows_group_id is not null;
