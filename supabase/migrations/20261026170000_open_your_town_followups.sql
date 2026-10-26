-- F118 follow-ups from review (#1093): a ready town is logged until its Issue exists, and the
-- "it's open" message to a town's supporters and makers is retried until each one went out.

alter table public.towns add column issue_logged_at timestamptz;
comment on column public.towns.issue_logged_at is
  'F118: when the "open this town" Issue was created. A ready town without one is logged again on the next run.';

create table public.town_open_notices (
  market_key text        not null,
  member_id  uuid        not null references public.members(id) on delete cascade,
  sent_at    timestamptz not null default now(),
  primary key (market_key, member_id)
);
comment on table public.town_open_notices is
  'F118: who was told their town opened, so a re-run of scripts/market/open-market.ts sends only to the rest. Operator-only.';
alter table public.town_open_notices enable row level security;
-- No policy: read and written by the operator script only.
