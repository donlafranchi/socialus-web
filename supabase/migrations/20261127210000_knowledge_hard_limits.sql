-- #1537: hard limits that no switch lifts, and checks that cannot see member data.
--
-- Why. The department-limits switch (20261127120000, #1518) answers every key
-- as an operator while it is off. The second-session review of #1519 found two
-- powers that should never ride on it (both reproduced):
--   1. Settling. Any key could set_settled(..., false) and then revise the
--      record, so "settled" meant "until any agent unsettles it".
--   2. Conditions. Any key could write a condition's check, a SQL query the
--      scheduled job runs on the project owner's connection: one number per
--      run is enough to read member data (auth.users, public.*). Any key could
--      also mark a condition met by hand, which opens an Issue and unparks work.
-- The PM (2026-11-27): keep the two apart, the switch for day-to-day editing
-- and a short list of hard limits for the PM's key only, until the store has
-- its own database.
--
-- What.
--   · knowledge._pm_key(): the key's own operator flag from knowledge.agents,
--     read past _agent(), so the switch never reaches it. The PM's key and the
--     keys the workflows mint (operator = true) pass; an agent's key does not.
--   · set_settled, set_condition and the checked_by gate in _conditions_before
--     read it. Their bodies are otherwise as 20261110120000 and 20261111120000
--     left them; only the marked line changed.
--   · knowledge_checker: a role with no login and no grants beyond usage on an
--     empty schema, knowledge_checks. The scheduled job runs every check query
--     as this role (scripts/knowledge/conditions.ts), so a check sees no table
--     at all, the PM's own included. No condition has a query check today (the
--     last run ran 0), so nothing breaks. A check that needs a count later gets
--     an aggregate view in knowledge_checks, by migration, reviewed like any other.
--     What it can still do: call functions executable by PUBLIC, which hold no
--     member rows for a caller with no session. A separate database for the
--     store removes even that.
-- Tests: supabase/tests/knowledge_department_limits.sql.

create function knowledge._pm_key() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.operator from knowledge.agents a
     where a.key_hash = encode(sha256(convert_to(nullif(current_setting('knowledge.key', true), ''), 'UTF8')), 'hex')
       and a.revoked_at is null), false)
$$;
comment on function knowledge._pm_key() is
  'Whether the key is an operator in its own right (the PM''s key, or a workflow''s minted operator key). Not lifted by the department-limits switch: settling, a condition''s check and marking a condition by hand read this.';
revoke all on function knowledge._pm_key() from public, anon, authenticated, service_role, knowledge_store;

create or replace function knowledge.set_settled(p_id text, p_settled boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  v integer;
begin
  if not knowledge._pm_key() then  -- #1537
    raise exception 'Only an operator settles or unsettles a record.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  update knowledge.records set settled = p_settled where id = p_id returning version into v;
  if not found then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'version', v, 'settled', p_settled);
end $$;


create or replace function knowledge._conditions_before() returns trigger
language plpgsql set search_path = '' as $$
declare
  problem text;
  via_set boolean := coalesce(current_setting('knowledge.via', true), '') = 'set_condition';
begin
  if new.checked_by is not null and new.kind <> 'condition' then
    raise exception 'Only a condition has a check.' using errcode = 'check_violation';
  end if;
  if new.kind = 'condition' then
    if coalesce(btrim(new.owner), '') = '' then
      raise exception 'A condition needs an owner: who answers for it being met.' using errcode = 'check_violation';
    end if;
    problem := knowledge._check_problem(new.checked_by);
    if problem is not null then
      raise exception 'Not a check: %.', problem using errcode = 'check_violation';
    end if;
    if (tg_op = 'INSERT' and new.checked_by is not null)
       or (tg_op = 'UPDATE' and new.checked_by is distinct from old.checked_by) then
      if not knowledge._pm_key() then  -- #1537: the real operator flag, whatever the switch says
        raise exception 'Only an operator writes a condition''s check: the scheduled job runs it.'
          using errcode = 'insufficient_privilege';
      end if;
    end if;
    if (tg_op = 'INSERT' and new.status <> 'not started')
       or (tg_op = 'UPDATE' and new.status is distinct from old.status and not via_set) then
      raise exception 'A condition starts not started; its status changes only through knowledge.set_condition.'
        using errcode = 'check_violation';
    end if;
  end if;
  if new.status = 'building' and (tg_op = 'INSERT' or old.status is distinct from 'building')
     and knowledge.is_parked(new.id) then
    raise exception '%', knowledge._parked_reason(new.id) using errcode = 'check_violation';
  end if;
  return new;
end $$;


create or replace function knowledge.set_condition(p_id text, p_status text, p_reason text, p_evidence jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  allowed text[];
  v integer;
begin
  if not knowledge._pm_key() then  -- #1537
    raise exception 'Only an operator marks a condition: the PM, or the scheduled check acting for him.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into r from knowledge.records where id = p_id for update;
  if not found or r.kind <> 'condition' then
    raise exception 'No condition %.', p_id using errcode = 'no_data_found';
  end if;
  select statuses into allowed from knowledge.kinds where slug = 'condition';
  if not p_status = any (allowed) then
    raise exception 'A condition takes a status from: %; not %.', array_to_string(allowed, ', '), p_status
      using errcode = 'check_violation';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'set_condition', 'This record is settled: the PM has said do not re-raise it.');
  end if;
  if exists (select 1 from knowledge.links l where l.to_id = p_id and l.type = 'part_of')
     and p_status not in ('withdrawn', 'not started') then
    raise exception 'The status of % is computed from its parts; by hand it is only withdrawn, or brought back as not started.', p_id
      using errcode = 'check_violation';
  end if;
  if r.status = p_status then
    return jsonb_build_object('id', p_id, 'version', r.version, 'status', p_status, 'unchanged', true);
  end if;
  perform knowledge._context(w, p_reason, p_evidence, null);
  perform set_config('knowledge.via', 'set_condition', true);
  update knowledge.records set status = p_status where id = p_id returning version into v;
  perform set_config('knowledge.via', '', true);
  return jsonb_build_object('id', p_id, 'version', v, 'status', p_status);
end $$;


-- The sealed room for check queries.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'knowledge_checker') then
    create role knowledge_checker nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;
  end if;
end $$;
comment on role knowledge_checker is
  'Runs condition check queries (#1537). Sees only the knowledge_checks schema, which holds no tables: a check that needs a count gets a reviewed aggregate view there.';
create schema if not exists knowledge_checks;
comment on schema knowledge_checks is
  'What a condition''s check query may read: aggregate views only, added by migration. Empty for now.';
revoke all on schema knowledge_checks from public;
grant usage on schema knowledge_checks to knowledge_checker;
-- The job's own login switches to it for each check (set local role).
do $$ begin execute format('grant knowledge_checker to %I', current_user); end $$;

-- Review nit on #1519: the per-session setting only ever turns the limits ON.
comment on function knowledge.department_limits_on() is
  'Whether department and operator limits apply to agent keys. Off: every registered key counts as the PM''s own, except for the hard limits (knowledge._pm_key, #1537). A session may set knowledge.department_limits = on for itself, never off: one-way on purpose, so a key can only make itself weaker.';
