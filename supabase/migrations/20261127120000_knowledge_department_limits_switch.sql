-- A switch for the per-department limits on the knowledge store: OFF now, ON
-- later, not a deletion (the PM, 2026-11-27: there are no departments yet,
-- only the PM and their own account, so an agent they ask to do something
-- must be able to do it).
--
-- Why. A non-operator agent key is refused by knowledge._own_call, sees only
-- what its departments can see (knowledge.can_see), and cannot decide a
-- proposal, settle a record or write a condition's check. With every agent
-- acting for the PM that only blocks work the PM asked for.
--
-- What changes. One setting, knowledge.settings 'department_limits'. While it
-- is 'off', knowledge._agent() (the one place every check reads the key's
-- standing from: _writer, can_see, is_operator, every row-level policy) answers
-- every registered key as an operator. So an agent can see everything and may
-- retire, propose, revise, decide and settle anything the PM could. Nothing
-- else moves: the settled flag is the PM's own rule and still refuses a change
-- to a settled record, add_agent / revoke_agent are untouched (keys are still
-- registered only by the schema owner, by the manual knowledge-keys
-- workflow), and the settings table is not readable or writable by the
-- store's login, so no key can flip the switch.
--
-- Switch it back on (departments exist):
--   select knowledge.set_department_limits(true, 'why');
-- Tests: supabase/tests/knowledge_department_limits.sql. Every other
-- knowledge suite turns the limits on in its preamble: it tests them.

create table knowledge.settings (
  key        text primary key,
  value      text not null,
  why        text not null check (btrim(why) <> ''),
  changed_at timestamptz not null default now()
);
comment on table knowledge.settings is
  'Switches for the store as a whole. Owner-only: the store''s login can neither read nor write it.';
alter table knowledge.settings enable row level security;
revoke all on knowledge.settings from knowledge_store;

insert into knowledge.settings (key, value, why)
values ('department_limits', 'off',
        'The PM, 2026-11-27: no departments yet, only the PM and their own account; agents they ask to do something must be able to do it. Switch back on when departments exist.');

-- A missing row means the limits are ON: the safe side.
create function knowledge.department_limits_on() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.value <> 'off' from knowledge.settings s where s.key = 'department_limits'), true)
$$;
comment on function knowledge.department_limits_on() is
  'Whether department and operator limits apply to agent keys. Off: every registered key counts as the PM''s own.';

create function knowledge.set_department_limits(p_on boolean, p_why text) returns void
language sql security definer set search_path = '' as $$
  insert into knowledge.settings (key, value, why)
  values ('department_limits', case when p_on then 'on' else 'off' end, p_why)
  on conflict (key) do update set value = excluded.value, why = excluded.why, changed_at = now()
$$;

-- Not granted to knowledge_store (default privileges revoke it): only the
-- schema owner flips the switch.

create or replace function knowledge._agent() returns knowledge.agents
language sql stable security definer set search_path = '' as $$
  select a.name, a.person, a.departments,
         (a.operator or not knowledge.department_limits_on()) as operator,
         a.key_hash, a.created_at, a.revoked_at
    from knowledge.agents a
   where a.key_hash = encode(sha256(convert_to(nullif(current_setting('knowledge.key', true), ''), 'UTF8')), 'hex')
     and a.revoked_at is null
$$;
