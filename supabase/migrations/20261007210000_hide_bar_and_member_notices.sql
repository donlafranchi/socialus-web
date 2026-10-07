-- #220 (F078 criteria 3, 6–8; ruled 2026-09-27 and 2026-10-07 option A).
--
-- 1. The hide bar is data on the metro, changed without a migration or deploy,
--    like creator_threshold. Starting value 0: every report hides, exactly as
--    20260913211209_reports_and_photo_hiding.sql does today. One number per
--    metro; nothing raises it automatically.
-- 2. member_notices: the in-app message to a poster when something of theirs is
--    hidden (never email). Written by the action layer only; a member reads
--    their own and nobody else's.

alter table public.metro_polygons
  add column hide_bar numeric not null default 0
    check (hide_bar >= 0 and hide_bar <= 1);

comment on column public.metro_polygons.hide_bar is
  'F078: a report whose score is below this does not hide on its own. 0 means every report hides. A children or threat-of-harm report hides at any bar. Content whose metro cannot be resolved uses 0.';

create table public.member_notices (
  id              uuid        not null default gen_random_uuid() primary key,
  member_id       uuid        not null references public.members(id) on delete cascade,
  kind            text        not null check (kind in ('content_hidden')),
  report_id       uuid        references public.reports(id) on delete set null,
  subject_kind    text        not null check (subject_kind in ('group')),
  subject_id      uuid        not null,
  -- The reporter's chosen reason, never their words or identity.
  category        text        not null,
  message         text        not null check (char_length(message) between 1 and 600),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index idx_member_notices_member on public.member_notices (member_id, created_at desc);

alter table public.member_notices enable row level security;
revoke all on public.member_notices from anon;
grant select on public.member_notices to authenticated;

-- A member reads their own. Writes go through the action layer (ADR-7).
create policy member_notices_select_own on public.member_notices for select
  to authenticated
  using (member_id = auth.uid());
