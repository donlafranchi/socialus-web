-- #987 — an unclaimed Page is claimed self-serve (2026-10-21, "build the system, then get out of the way").
-- The signed-in claimant proves the business by a code sent to an address at its own website domain, or to
-- the phone on the Page (behind CLAIM_BY_PHONE until texting is live). A verified code makes them the owner
-- at once. A Page with neither offers a claim with proof, which an operator decides: the only staff step.

-- When the Page was claimed. unclaimed_at clears on claim; this keeps the seeder from making it again.
alter table public.groups add column claimed_at timestamptz,
  add constraint groups_claimed_not_unclaimed check (claimed_at is null or unclaimed_at is null);
grant select (claimed_at) on public.groups to anon, authenticated;
create index groups_claimed_idx on public.groups (claimed_at) where claimed_at is not null;

-- One row per attempt. code_hash is a SHA-256 of the claim id and the code; the code itself is never stored.
create table public.page_claims (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  claimant_member_id uuid not null references public.members(id) on delete cascade,
  method text not null check (method in ('email', 'phone', 'proof')),
  target text check (target is null or length(target) between 3 and 320),
  code_hash text check (code_hash is null or code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz,
  attempts int not null default 0 check (attempts >= 0),
  proof_url text check (proof_url is null or proof_url ~ '^https://'),
  proof_note text check (proof_note is null or length(proof_note) <= 1000),
  status text not null default 'pending'
    check (status in ('pending', 'review', 'verified', 'approved', 'declined', 'superseded')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check ((method = 'proof') = (proof_url is not null)),
  check (method = 'proof' or (target is not null and code_hash is not null and expires_at is not null))
);
create index page_claims_claimant_idx on public.page_claims (claimant_member_id, created_at);
create index page_claims_group_idx on public.page_claims (group_id, created_at);
alter table public.page_claims enable row level security;

-- The claim log: every start, sent code, wrong code, verify, proof, decision. Operators only, append-only.
create table public.page_claim_events (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.page_claims(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  event_kind text not null check (event_kind in (
    'claim.started', 'claim.code_failed', 'claim.verified', 'claim.proof_submitted',
    'claim.approved', 'claim.declined', 'claim.superseded', 'claim.refused_claimed'
  )),
  acting_member_id uuid references public.members(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index page_claim_events_group_idx on public.page_claim_events (group_id, created_at);
alter table public.page_claim_events enable row level security;

create or replace function public.page_claim_events_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'page_claim_events is append-only';
end $$;
create trigger page_claim_events_append_only before update on public.page_claim_events
  for each row execute function public.page_claim_events_append_only();

-- A claimant reads their own claims' status, never the code hash. Nobody writes from the browser: the
-- handlers do, server-side. The log has no policy at all, like page_claim_requests.
create policy page_claims_select_own on public.page_claims for select to authenticated
  using (claimant_member_id = auth.uid());
revoke all on public.page_claims, public.page_claim_events from anon, authenticated;
grant select (id, group_id, method, status, created_at, expires_at) on public.page_claims to authenticated;

-- The claim itself is a Page event (the new owner's own act); the attempts stay in the operator-only log.
alter table public.group_events
  drop constraint group_events_event_kind_check,
  add constraint group_events_event_kind_check
  check (event_kind in (
    'group.created',
    'group.activated',
    'group.member_joined',
    'group.member_left',
    'group.role_changed',
    'group.steward_transferred',
    'group.dormant',
    'group.dormancy_extended',
    'group.revived',
    'group.dissolved',
    'group.photo_set',
    'group.photo_removed',
    'group.updated',
    'group.reported',
    'group.photo_hidden',
    'group.photo_restored',
    'group.post_created',
    'group.post_edited',
    'group.post_deleted',
    'group.unclaimed_hidden',
    'group.unclaimed_restored',
    'group.archived',
    'group.restored',
    'group.post_hidden',
    'group.post_restored',
    'group.post_removed',
    'group.decision_reversed',
    'group.words_hidden',
    'group.words_restored',
    'group.words_removed',
    -- #909: a featured product or service
    'group.item_hidden',
    'group.item_restored',
    'group.item_removed',
    -- #987
    'group.claimed'
  ));
