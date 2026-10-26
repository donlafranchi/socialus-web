-- #626: the first report is a courtesy notice to the owner (kind 'courtesy'), and the
-- owner's one answer is a single "This is a mistake" tap (answer kind 'mistake', no reason).
alter table public.member_notices drop constraint member_notices_kind_check;
alter table public.member_notices
  add constraint member_notices_kind_check check (kind in ('content_hidden', 'courtesy'));

alter table public.report_answers drop constraint report_answers_kind_check;
alter table public.report_answers
  add constraint report_answers_kind_check check (kind in ('fix_and_repost', 'wrong', 'mistake'));
