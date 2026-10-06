-- #423 — the PM, 2026-10-06: an owner archives or deletes their own Page.
-- Path: well-worn (Facebook Pages unpublish and delete with a 14-day grace;
-- Etsy vacation mode and close shop; Google Business Profile mark closed and
-- remove).
--
--   archived  — a new lifecycle_state. Hidden from everyone but the owner,
--               restorable any time.
--   deleted   — the existing 'dissolved' state, with dissolved_at set (which
--               every reader already filters) and a new delete_after: when
--               purge_deleted_pages() removes it, 14 days on. Restorable until
--               then. A dissolved Page with no delete_after is left alone.

alter table public.groups
  drop constraint groups_lifecycle_state_check,
  add constraint groups_lifecycle_state_check
  check (lifecycle_state in ('draft', 'active', 'archived', 'dissolved'));

alter table public.groups
  add column delete_after timestamptz,
  add constraint groups_delete_after_only_when_deleted
  check (delete_after is null or lifecycle_state = 'dissolved');

-- groups is granted column by column: a new column is read by nobody until
-- named. Only the owner can read a deleted row (below), so this shows nobody
-- else anything.
grant select (delete_after) on public.groups to anon, authenticated;

comment on column public.groups.delete_after is
  '#423 — set by group.delete to 14 days on; purge_deleted_pages() removes the Page once it passes. group.restore clears it.';

-- Restrictive: whatever another policy admits (a joined member, the listed
-- public path), an archived or deleted Page answers its founder only. Posts,
-- tags and items read their Page through this table, so they follow.
create policy groups_hidden_owner_only on public.groups as restrictive for select
  using (lifecycle_state in ('draft', 'active') or founder_member_id = (select auth.uid()));

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
    -- #423
    'group.archived',
    'group.restored'
  ));

-- The permanent removal. Run daily by .github/workflows/page-purge.yml.
-- Never before delete_after. Items do not cascade from their Page (their FK
-- sets null, which would turn them into standalone listings), so they go
-- first; posts, memberships, tags and events cascade with the Page.
create or replace function public.purge_deleted_pages(p_now timestamptz default now())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  doomed uuid[];
begin
  select coalesce(array_agg(id), '{}') into doomed
    from public.groups
   where lifecycle_state = 'dissolved'
     and delete_after is not null
     and delete_after <= p_now;

  delete from public.items where group_id = any (doomed);
  delete from public.groups where id = any (doomed);
  return cardinality(doomed);
end;
$$;

revoke execute on function public.purge_deleted_pages(timestamptz) from public, anon, authenticated;
