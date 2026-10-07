-- F082 — one row each time a member agrees to the rules to publish a Page.
-- Path: well-worn (Airbnb host terms and Etsy seller policy are click-to-agree
-- and re-accepted when they change).
--
-- Criterion 6: each agreement carries the rules version and a timestamp, and is
-- seen only by Don and operators. Nothing typed, nothing checked (criterion 2),
-- no badge (criterion 3): this is a record, never a projection.
--
-- ORDER: applies after 20261007170000_member_default_metro. Touches
-- nothing that migration redefines.

create table public.creator_rules_agreements (
  id            uuid        not null default gen_random_uuid() primary key,
  member_id     uuid        not null references public.members(id) on delete cascade,
  -- The Page it was agreed for: every new Page asks again (criterion 1).
  group_id      uuid        not null references public.groups(id) on delete cascade,
  rules_version integer     not null check (rules_version >= 1),
  agreed_at     timestamptz not null default now()
);

create index idx_creator_rules_agreements_member
  on public.creator_rules_agreements (member_id, rules_version);

alter table public.creator_rules_agreements enable row level security;

-- No policy, deliberately, as on public.reports: writes go through
-- group.activate over DATABASE_URL, and no client reads one. If a SELECT policy
-- ever appears on this table it is a bug.

revoke all on public.creator_rules_agreements from anon, authenticated;

comment on table public.creator_rules_agreements is
  'F082: a member agreed to the rules (version, time) to publish a Page. RLS on with zero policies and no client grants: action-layer writes only, read by Don and operators server-side. Never projected to peers (F082 criterion 3).';
