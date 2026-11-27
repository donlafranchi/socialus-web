-- #1535: three powers stay with the PM's own key whatever the department switch says.
--
-- 20261127120000 made knowledge._agent() answer every key as an operator while the department limits are off,
-- and every operator check reads _agent(). Three of those checks were never department limits: they are the
-- PM's own powers, and the second-session review of #1519 reproduced each with a building key:
--   1. settling or unsettling a record (knowledge.set_settled): unsettle, then revise, and "settled" means nothing;
--   2. writing a condition's check (knowledge._conditions_before): the scheduled job runs that SQL with full
--      database access, so it could read member data one number at a time;
--   3. marking a condition by hand (knowledge.set_condition): that opens an Issue and unparks work.
-- Each now asks knowledge._pm_key(): is the key's own registered row an operator, ignoring the switch.
-- Precedent: an owner-only setting stays with the owner role whatever a feature flag says (GitHub org owners).
-- Bodies are otherwise unchanged from 20261110120000 and 20261111120000. Tests: supabase/tests/knowledge_department_limits.sql.

create function knowledge._pm_key() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.operator from knowledge.agents a
     where a.key_hash = encode(sha256(convert_to(nullif(current_setting('knowledge.key', true), ''), 'UTF8')), 'hex')
       and a.revoked_at is null), false)
$$;
comment on function knowledge._pm_key() is
  'Whether the calling key is registered as an operator, whatever the department switch says. For the PM''s own powers.';

create or replace function knowledge.set_settled(p_id text, p_settled boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  v integer;
begin
  if not knowledge._pm_key() then
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
      if not knowledge._pm_key() then
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
  if not knowledge._pm_key() then
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
