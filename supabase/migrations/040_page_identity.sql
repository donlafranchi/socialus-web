-- T141 — One migration for category, photo column, and the new event types.
-- Spec:   product/systems/groups.md § What a Page carries at creation
--         (category, photo) · § Editing an active Page (group.updated,
--         owed to F056's editor)
-- Ticket: development/tickets/T141-page-identity-migration.md
--
-- Folds three things that would otherwise be three separate hand-pushes
-- across two scenarios into one (F061 review binding note 5): a category
-- column and its free-text capture table, a photo column, and three new
-- group_events kinds. Production migrations are applied by hand right now
-- (T140's drift check is the mechanism that catches a forgotten one) —
-- fewer pushes is fewer chances to forget one.

------------------------------------------------------------
-- 1. groups.category — a self-declared, code-validated attribute
------------------------------------------------------------

-- No CHECK and no enum. The twelve-term vocabulary lives as a named
-- TypeScript constant in the action handler (T144) and will grow to
-- thirteen and beyond — a database constraint would make every vocabulary
-- change a migration. Nullable because Pages created before this exist
-- and are not backfilled; the handler, not the column, makes the field
-- required at publish.
alter table public.groups
  add column category text;

create index idx_groups_category
  on public.groups (category)
  where category is not null;

------------------------------------------------------------
-- 2. groups.photo_url — one photo, set at creation, editable later
------------------------------------------------------------

alter table public.groups
  add column photo_url text;

------------------------------------------------------------
-- 3. group_category_suggestions — captured, not promoted
------------------------------------------------------------

-- Records what a Member typed when "Something else" was chosen. No
-- status/promoted column — promotion is a human reading this table and
-- editing the vocabulary constant; adding either column would quietly
-- build the automatic-promotion path the ratified Intent refuses
-- (groups.md § Other).
create table public.group_category_suggestions (
  id              uuid          not null default gen_random_uuid() primary key,
  group_id        uuid          not null references public.groups(id) on delete cascade,
  member_id       uuid          not null references public.members(id),
  raw_text        text          not null
                                check (length(raw_text) between 1 and 280),
  normalized_text text          not null,
  created_at      timestamptz   not null default now()
);

create index idx_group_category_suggestions_normalized
  on public.group_category_suggestions (normalized_text);

alter table public.group_category_suggestions enable row level security;

-- Written once at Page publish, by the Member publishing it. No update
-- or delete path — a suggestion is a record of what was typed, not a
-- field the Member manages afterward.
create policy "group_category_suggestions insert by author"
  on public.group_category_suggestions for insert
  to authenticated
  with check (member_id = auth.uid());

-- Read is operator-only in practice (there is no browsable surface — the
-- normalized-text index is the whole admin surface per groups.md § Other)
-- but RLS still needs an explicit policy or the table is unreadable to
-- everyone, including the service role's own RLS-respecting paths.
-- Restrict to the authoring Member and the Group's founder — nobody else
-- has a reason to read raw free text a stranger typed.
create policy "group_category_suggestions read by author or group founder"
  on public.group_category_suggestions for select
  to authenticated
  using (
    member_id = auth.uid()
    or group_id in (
      select id from public.groups where founder_member_id = auth.uid()
    )
  );

------------------------------------------------------------
-- 4. group_events — three new kinds
------------------------------------------------------------

-- group.updated is not consumed by any ticket in this stretch — it is
-- F056's (the editor), landing here per binding note 5 so that ticket's
-- own migration doesn't need a separate hand-push.
alter table public.group_events
  drop constraint if exists group_events_event_kind_check;

alter table public.group_events
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
    'group.updated'
  ));
