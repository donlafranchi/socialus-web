-- #1227 Feature flags of our own, builder accounts first (PM, 2026-11-10;
-- socialus-plan scenario-F128: "Unfinished work merges dark behind flags of our
-- own, held in our database and on for builder accounts first; no flag vendor
-- until go-live").
--
-- A flag is declared in code (src/lib/flags/registry.ts: what it hides, the
-- date it comes out). This table holds only who it is on for, so the PM can
-- switch it without a deploy. A declared flag with no row here is on for
-- builders only: that is the default, so new work starts dark.
--
-- Read server-side only, like public.builders: RLS on, no policies, no grants.

create table public.feature_flags (
  key        text primary key check (key ~ '^[a-z][a-z0-9-]{1,47}$'),
  audience   text not null default 'builders' check (audience in ('off', 'builders', 'everyone')),
  updated_at timestamptz not null default now()
);

alter table public.feature_flags enable row level security;
revoke all on public.feature_flags from anon, authenticated;

comment on table public.feature_flags is
  '#1227: who each code-declared flag is on for. No row means builders only.';
