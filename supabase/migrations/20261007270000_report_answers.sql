-- #488 — F102: the poster answers first. A hide leaves the poster one notice
-- (member_notices); the poster gives ONE answer to it: fix and repost, or say
-- the report is wrong. Unique per notice, so one answer per hide. RLS: a poster
-- reads their own; writes only through the action layer.

alter table public.member_notices
  -- Where "Fix it" leads: the Page, whichever kind of thing was reported.
  add column page_id uuid references public.groups(id) on delete cascade;

alter table public.page_posts
  -- A second hide on the same post offers no second repost (criterion 2).
  add column repost_used boolean not null default false;

create table public.report_answers (
  id            uuid        not null default gen_random_uuid() primary key,
  notice_id     uuid        not null unique references public.member_notices(id) on delete cascade,
  member_id     uuid        not null references public.members(id) on delete cascade,
  kind          text        not null check (kind in ('fix_and_repost', 'wrong')),
  wrong_reason  text        check (wrong_reason in ('mistaken', 'malicious', 'misusing_reports')),
  note          text        check (char_length(note) between 1 and 280),
  created_at    timestamptz not null default now(),
  constraint report_answers_wrong_has_reason
    check ((kind = 'wrong') = (wrong_reason is not null))
);

alter table public.report_answers enable row level security;
revoke all on public.report_answers from anon;
grant select on public.report_answers to authenticated;
create policy report_answers_select_own on public.report_answers for select
  to authenticated using (member_id = auth.uid());
