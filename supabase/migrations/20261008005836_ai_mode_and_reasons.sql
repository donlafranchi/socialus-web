-- #486/#487 — F100 criterion 8 and F101 criterion 10.
--
-- 1. The AI's mode is data the PM flips, not a deploy: 'shadow' (the default,
--    advice only) or 'live' (the AI's severity can raise a row's severity and
--    order; remove, restore and strikes stay a person's tap). One row.
--    Flip it with: update public.moderation_settings set ai_mode = 'live';
-- 2. The one-tap Remove records a reason that matches the row's category, so
--    report_decisions.reason_code gains harassment, threat_of_harm, violence,
--    nudity, sensitive_content and spam.

create table public.moderation_settings (
  singleton boolean primary key default true check (singleton),
  ai_mode   text not null default 'shadow' check (ai_mode in ('shadow', 'live')),
  updated_at timestamptz not null default now()
);
insert into public.moderation_settings default values;

alter table public.moderation_settings enable row level security;
-- No policy, deliberately: the operator reads and flips it over the server connection.

alter table public.report_decisions drop constraint report_decisions_reason_code_check;
alter table public.report_decisions add constraint report_decisions_reason_code_check
  check (reason_code in (
    'nothing_wrong', 'reported_by_mistake',
    'not_a_real_place', 'someone_elses_photo', 'not_suitable', 'person_did_not_agree',
    'harassment', 'threat_of_harm', 'violence', 'nudity', 'sensitive_content', 'spam',
    'other'
  ));
