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


-- record(), replaced whole from 20261111230000_knowledge_practices.sql: a
-- record created settled is settled, so the same hard limit (review of #1539).
create or replace function knowledge.record(p jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  k text := p->>'kind';
  allowed text[] := array['id', 'kind', 'concern', 'answer', 'why', 'status', 'strength', 'enforced_by', 'scope',
                          'audience', 'departments', 'owner', 'decided_by', 'decided_on', 'path', 'holds', 'until',
                          'settled', 'as_of', 'source', 'tags', 'embedding',
                          'checked_by',   -- F126
                          'ring'];        -- F128
  extra text;
  the_id text;
  the_status text;
  the_audience text := coalesce(p->>'audience', 'operators');
  the_departments text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p->'departments') x), '{}');
  -- F128: a practice, like a principle, goes live only when the PM decides.
  pm_only boolean := k in ('philosophy', 'pattern', 'practice') or p->>'path' = 'new territory'
                     or (k = 'decision' and p->>'path' is null and not w.operator);
  the_embedding knowledge.records.embedding%type := p->>'embedding';
begin
  perform knowledge._context(w, p_reason, p_evidence, p_effective);

  select string_agg(key, ', ') into extra from jsonb_object_keys(p) key where key <> all (allowed);
  if extra is not null then
    raise exception 'A record has no field %.', extra using errcode = 'undefined_column';
  end if;
  if not exists (select 1 from knowledge.kinds x where x.slug = k) then
    raise exception 'No such kind: %. A new kind is a new row in knowledge.kinds.', k using errcode = 'foreign_key_violation';
  end if;
  if (select needs_why from knowledge.kinds x where x.slug = k) and coalesce(btrim(p->>'why'), '') = '' then
    raise exception 'A % needs a why.', k using errcode = 'check_violation';
  end if;
  -- F126: only an operator writes a check, which the scheduled job runs.
  if p ? 'checked_by' and jsonb_typeof(p->'checked_by') <> 'null' and not w.operator then
    raise exception 'Only an operator writes a condition''s check: the scheduled job runs it.'
      using errcode = 'insufficient_privilege';
  end if;

  the_status := coalesce(p->>'status', (
    select case
             when pm_only and not w.operator and 'proposed' = any (x.statuses) then 'proposed'
             when 'live' = any (x.statuses) then 'live'
             else x.statuses[1] end
      from knowledge.kinds x where x.slug = k));
  if the_status = 'retired' then
    raise exception 'A record is retired through knowledge.retire, with what replaced it.' using errcode = 'check_violation';
  end if;
  if not w.operator then
    if pm_only and the_status = 'live' then
      raise exception 'Philosophies, patterns, practices and new-territory decisions go live only when the PM decides.'  -- F128: practices
        using errcode = 'insufficient_privilege';
    end if;
    if p ? 'decided_by' or p ? 'decided_on' then
      raise exception 'Only an operator records a decision in someone else''s name; an agent''s decision names its own person.'
        using errcode = 'insufficient_privilege';
    end if;
    if coalesce((p->>'settled')::boolean, false) then
      raise exception 'Only an operator settles a record.' using errcode = 'insufficient_privilege';
    end if;
    if not knowledge.can_see(the_audience, the_departments) or not the_departments <@ w.departments then
      raise exception 'An agent writes only records its key can read, filed under its own departments.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  -- #1537: settling is a hard limit, whatever the department-limits switch says.
  if coalesce((p->>'settled')::boolean, false) and not knowledge._pm_key() then
    raise exception 'Only an operator settles a record.' using errcode = 'insufficient_privilege';
  end if;

  the_id := coalesce(p->>'id', knowledge._next_id(k));

  insert into knowledge.records (id, kind, concern, answer, why, status, strength, enforced_by, scope, audience,
                                 departments, owner, decided_by, decided_through, decided_on, path, holds, until,
                                 settled, as_of, source, tags, embedding, checked_by, ring)
  values (the_id, k, p->>'concern', p->>'answer', p->>'why', the_status, coalesce(p->>'strength', 'guideline'),
          p->>'enforced_by', p->>'scope', the_audience, the_departments, p->>'owner',
          coalesce(p->>'decided_by', w.person),
          case when p ? 'decided_by' then null else w.name end,
          coalesce((p->>'decided_on')::date, coalesce(p_effective, now())::date),
          p->>'path', p->>'holds', p->>'until',
          coalesce((p->>'settled')::boolean, false), (p->>'as_of')::date, p->>'source',
          coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'),
          the_embedding,
          case when jsonb_typeof(p->'checked_by') <> 'null' then p->'checked_by' end,  -- F126
          p->>'ring');  -- F128
  return the_id;
end $$;

-- _condition_links(), replaced whole from 20261111120000_knowledge_conditions.sql:
-- a part makes its parent met, so adding one is marking by another door
-- (review of #1539).
create or replace function knowledge._condition_links() returns trigger
language plpgsql set search_path = '' as $$
declare
  from_kind text;
  to_kind text;
begin
  if new.type not in ('part_of', 'starts_when', 'ends_when') then
    return new;
  end if;
  select kind into from_kind from knowledge.records where id = new.from_id;
  select kind into to_kind from knowledge.records where id = new.to_id;
  if to_kind is distinct from 'condition' then
    raise exception 'A % link points at a condition; % is a %.', new.type, new.to_id, to_kind
      using errcode = 'check_violation';
  end if;
  if new.type = 'part_of' then
    -- A part changes its parent's computed status, and links are never
    -- removed: only an operator adds one.
    if not knowledge._pm_key() then  -- #1537
      raise exception 'Only an operator makes one condition a part of another: it changes the parent''s status.'
        using errcode = 'insufficient_privilege';
    end if;
    if from_kind is distinct from 'condition' then
      raise exception 'Only a condition is a part of a condition; % is a %.', new.from_id, from_kind
        using errcode = 'check_violation';
    end if;
    if exists (
      with recursive up (id, depth) as (
        select new.to_id, 0
        union
        select l.to_id, up.depth + 1 from up join knowledge.links l on l.from_id = up.id and l.type = 'part_of'
         where up.depth < 50
      )
      select 1 from up where up.id = new.from_id) then
      raise exception 'That would make a loop: % is already a part of %.', new.to_id, new.from_id
        using errcode = 'check_violation';
    end if;
  elsif from_kind = 'condition' then
    raise exception 'A condition waits on another as one of its parts (part_of), not with %.', new.type
      using errcode = 'check_violation';
  end if;
  return new;
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
