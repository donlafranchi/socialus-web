-- #222 (F081) — what signup collects beyond the display name: the legal name
-- and zip (seen only by operators; members read only their own row), and when
-- the member confirmed they are 18 or older with the Terms beside it.
alter table public.members
  add column legal_name        text check (legal_name is null or length(legal_name) between 2 and 120),
  add column zip               text check (zip is null or zip ~ '^[0-9]{5}$'),
  add column adult_confirmed_at timestamptz;

comment on column public.members.legal_name is
  'F081: the legal name given at signup. Seen only by operators; never rendered to another member or visitor.';
comment on column public.members.zip is
  'F081 criterion 2: kept, and never rendered on any surface another member or visitor can reach. It decides home_metro_id and is changed from You.';
comment on column public.members.adult_confirmed_at is
  'F081 criterion 1: when the member ticked "I''m 18 or older and agree to the Terms".';
