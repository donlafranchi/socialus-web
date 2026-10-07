-- #353 — real businesses as unclaimed Pages (Don, 2026-10-04, "full B").
-- An unclaimed Page is founded by the system member, has no owner or steward
-- until claimed, and carries what it was built from. A removal request hides
-- it at once, before anyone reviews it; only an operator restores it.
--
-- One Page picture, credited (2026-10-05: one picture per Page, a gallery
-- comes after beta — newer than the four-photo guardrail, so it wins). It is
-- the business's own photo (Don, 2026-10-05, #378 option A), removable on its
-- own; the copyright exposure is an accepted risk in socialus-plan.

alter table public.groups
  add column unclaimed_at timestamptz,
  add column unclaimed_hidden_at timestamptz,
  -- The organization's own site or social profile: the description's and the
  -- picture's credit link. Public, because the credit is.
  add column public_info_url text check (public_info_url is null or public_info_url ~ '^https://'),
  add column photo_credit text,
  add column photo_source_url text check (photo_source_url is null or photo_source_url ~ '^https://'),
  add constraint groups_unclaimed_hidden_needs_unclaimed
    check (unclaimed_hidden_at is null or unclaimed_at is not null);

-- groups is granted column by column (#246). These are public: the tag and the
-- credits are on the front door, signed in or out.
grant select (unclaimed_at, unclaimed_hidden_at, public_info_url, photo_credit, photo_source_url)
  on public.groups to anon, authenticated;

-- Restrictive: a hidden unclaimed Page answers no member and no visitor. The
-- operator reads it server-side, outside RLS.
create policy groups_unclaimed_not_hidden on public.groups as restrictive for select
  to anon, authenticated using (unclaimed_hidden_at is null);

-- Where each field came from. Operators only, append-only.
create table public.page_sources (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  field text not null check (field in ('name', 'description', 'photo', 'phone', 'address', 'hours', 'website', 'social')),
  url text not null check (url ~ '^https://'),
  captured_on date not null,
  captured_by text not null,
  created_at timestamptz not null default now()
);
create index page_sources_group_idx on public.page_sources (group_id);
alter table public.page_sources enable row level security;

create or replace function public.page_sources_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'page_sources is append-only';
end $$;
create trigger page_sources_append_only before update or delete on public.page_sources
  for each row when (pg_trigger_depth() < 1) execute function public.page_sources_append_only();

-- "Ask us to remove it." Anyone, signed in or out, through page.request_removal,
-- which hides the Page in the same transaction. device_hash is a SHA-256 of a
-- random per-browser id, never an address; it only counts requests per day.
create table public.page_removal_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  -- The whole Page, or just its photo (Don, 2026-10-05: the photo is removable on its own).
  scope text not null default 'page' check (scope in ('page', 'photo')),
  contact text not null check (length(contact) between 3 and 200),
  reason text check (reason is null or length(reason) <= 1000),
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index page_removal_requests_device_idx on public.page_removal_requests (device_hash, created_at);
create index page_removal_requests_group_idx on public.page_removal_requests (group_id);
alter table public.page_removal_requests enable row level security;

-- "Claim this Page": a contact form for now. Claiming itself is a later ticket.
create table public.page_claim_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  contact text not null check (length(contact) between 3 and 200),
  message text check (message is null or length(message) <= 2000),
  device_hash text not null check (device_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index page_claim_requests_device_idx on public.page_claim_requests (device_hash, created_at);
alter table public.page_claim_requests enable row level security;

-- No policies on the three tables, on purpose (as reports, #12): members and
-- visitors neither read nor write them; the handlers and the operator page
-- reach them server-side.
revoke all on public.page_sources, public.page_removal_requests, public.page_claim_requests from anon, authenticated;

-- The hide and the restore are events. A removal request has no member behind
-- it, so its hide is recorded as the system member's, pointing at the request.
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
    -- #353
    'group.unclaimed_hidden',
    'group.unclaimed_restored'
  ));
