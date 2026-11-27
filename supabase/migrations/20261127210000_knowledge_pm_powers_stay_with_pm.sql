-- #1535: three powers stay with the PM's own key whatever the department switch says.
--
-- 20261127120000 made knowledge._agent() answer every key as an operator while the department limits are off,
-- and every operator check reads _agent(). Three of those checks were never department limits: they are the
-- PM's own powers, and the second-session review of #1519 reproduced each with a building key:
--   1. settling or unsettling a record (knowledge.set_settled): unsettle, then revise, and "settled" means nothing;
--   2. writing a condition's check (knowledge._conditions_before): the scheduled job runs that SQL with full
--      database access, so it could read member data one number at a time;
--   3. marking a condition by hand (knowledge.set_condition), or making it met by linking a met condition
--      part_of it (knowledge._condition_links): either opens an Issue and unparks work, and links are never removed;
--   4. creating a record already settled (knowledge.record).
-- Each now asks knowledge._pm_key(): is the key's own registered row an operator, ignoring the switch.
-- Precedent: an owner-only setting stays with the owner role whatever a feature flag says (GitHub org owners).
-- Bodies are otherwise unchanged from their latest definitions: 20261110120000 (set_settled), 20261111120000
-- (_conditions_before, _condition_links, set_condition) and 20261111230000 (record). Tests: supabase/tests/knowledge_department_limits.sql.

create function knowledge._pm_key() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select a.operator from knowledge.agents a
     where a.key_hash = encode(sha256(convert_to(nullif(current_setting('knowledge.key', true), ''), 'UTF8')), 'hex')
       and a.revoked_at is null), false)
$$;
comment on function knowledge._pm_key() is
  'Whether the calling key is registered as an operator, whatever the department switch says. For the PM''s own powers.';
-- The trigger functions are not security definer and call it as the store's login.
revoke all on function knowledge._pm_key() from public, anon, authenticated, service_role;
grant execute on function knowledge._pm_key() to knowledge_store;

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
    if not knowledge._pm_key() then
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
  -- #1535: settling is the PM's own power, whatever the department switch says.
  if coalesce((p->>'settled')::boolean, false) and not knowledge._pm_key() then
    raise exception 'Only an operator settles a record.' using errcode = 'insufficient_privilege';
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
