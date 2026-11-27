-- Overrule powers stay with the PM's own key (#1549), whatever the
-- department-limits switch says (the PM, 2026-11-27).
--
-- Why. 20261127120000 made knowledge._agent() answer every key as an operator
-- while the switch is off. Every check read that flag, so any agent key could
-- also unsettle a record the PM settled, write a condition's check (which the
-- scheduled job ran with full database access) and mark a condition met: the
-- second-session review on #1519 reproduced all three. The PM's ruling: the
-- store's rules are guidelines only the PM can overrule. Agents keep sight of
-- every record and do ordinary work; the overrule powers check the key's real
-- knowledge.agents.operator, through knowledge._pm_key() (20261127210000, #1538), which this builds on.
--
-- Sorted, every operator gate in the knowledge migrations:
--   Overrule, PM key only (changed here): decide; set_settled; settling in
--     record(); a decision in someone else's name; philosophies, patterns,
--     practices, new-territory and unclassified decisions going live; changing
--     a record's strength, path, ring or audience; revising or retiring a
--     philosophy, pattern, practice, new-territory or absolute record; dating a
--     change in the past (_context); writing a condition's check (record,
--     revise, _conditions_before); a condition made part of another;
--     set_condition; a concept's status, names and events, and lineage links;
--     the plan (_plan_writer) and which feature a slice belongs to; a map item
--     live or changed, drawing or moving a slice, deciding a map change
--     (_map_writer); moving an item the PM placed (place); an experiment's terms
--     set by someone other than its recorder; confirming a practice; drop_idea.
--   A job acting for the PM, unchanged (reads _agent() as today, and every job
--     mints a real operator key anyway): set_live_state, set_capability and a
--     capability's feature link, record_run, set_routine, link_pr, a run or idea
--     written directly, record_shipped, announce.
--   Sight and ordinary work, unchanged (open while the switch is off): can_see
--     and every read policy, the agents / unanswered / refusals reads, filing a
--     record under any department, revising or retiring another person's
--     well-worn call (_own_call).
--   Rules that bind every key, unchanged: a decision is retired only with its
--     replacement, a settled record refuses changes, history is append-only.
--
-- With the switch on, _agent().operator is the real flag, so every function
-- below behaves exactly as before this migration.
--
-- And the condition checks. scripts/knowledge/conditions.ts ran each check
-- query as the login it connects with (postgres.<ref>), so a check could read
-- any member's data. Now it calls knowledge._run_check(), owned by
-- knowledge_check: a no-login role that reads the knowledge schema and nothing
-- else. Being a security-definer function, it also cannot change role
-- (Postgres refuses SET ROLE and SET SESSION AUTHORIZATION inside one), so a
-- check cannot step back up to the caller. Production held no checks when this
-- was written (2026-11-27), so none breaks.
--
-- Tests: supabase/tests/knowledge_department_limits.sql.


-- A record that only the PM changes in place: his rulings, and what he has
-- marked absolute or new territory.
create function knowledge._pm_rule_guard(r knowledge.records) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if r.kind in ('philosophy', 'pattern', 'practice') or r.path = 'new territory' or r.strength = 'absolute' then
    raise exception 'Only the PM changes a philosophy, pattern, practice, new-territory or absolute record; propose a newer record instead.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- Overrule: dating a change in the past.
create or replace function knowledge._context(w knowledge.agents, p_reason text, p_evidence jsonb, p_effective timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Every change gives a reason.' using errcode = 'check_violation';
  end if;
  if p_effective is not null and not knowledge._pm_key() then
    raise exception 'Only an operator dates a change in the past.' using errcode = 'insufficient_privilege';
  end if;
  if p_effective > now() then
    raise exception 'A change cannot be dated in the future.' using errcode = 'check_violation';
  end if;
  perform set_config('knowledge.reason', p_reason, true);
  perform set_config('knowledge.evidence', coalesce(p_evidence::text, ''), true);
  perform set_config('knowledge.effective', coalesce(p_effective::text, ''), true);
end $$;

-- record(): as F128 left it, except the overrule gates (marked #1549) read the PM key.
create or replace function knowledge.record(p jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  pm boolean := knowledge._pm_key();  -- #1549: the overrule gates read this
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
                     or (k = 'decision' and p->>'path' is null and not pm);  -- #1549
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
  if p ? 'checked_by' and jsonb_typeof(p->'checked_by') <> 'null' and not pm then  -- #1549
    raise exception 'Only an operator writes a condition''s check: the scheduled job runs it.'
      using errcode = 'insufficient_privilege';
  end if;

  the_status := coalesce(p->>'status', (
    select case
             when pm_only and not pm and 'proposed' = any (x.statuses) then 'proposed'
             when 'live' = any (x.statuses) then 'live'
             else x.statuses[1] end
      from knowledge.kinds x where x.slug = k));
  if the_status = 'retired' then
    raise exception 'A record is retired through knowledge.retire, with what replaced it.' using errcode = 'check_violation';
  end if;
  -- #1549: the PM's own key only, whatever the switch says.
  if not pm then
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
  end if;
  -- Ordinary work: off, every key files anywhere it can read.
  if not w.operator then
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

-- revise(): as F128 left it, except the overrule gates (marked #1549) read the PM key.
create or replace function knowledge.revise(p_id text, p_changes jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  pm boolean := knowledge._pm_key();  -- #1549
  r knowledge.records;
  allowed text[] := array['concern', 'answer', 'why', 'status', 'strength', 'enforced_by', 'scope', 'audience',
                          'departments', 'owner', 'path', 'holds', 'until', 'as_of', 'source', 'tags', 'embedding',
                          'checked_by',   -- F126
                          'ring'];        -- F128
  extra text;
  new_audience text;
  new_departments text[];
  the_embedding knowledge.records.embedding%type := p_changes->>'embedding';
  v integer;
begin
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  select * into r from knowledge.records where id = p_id for update;
  if not found or not knowledge.can_see(r.audience, r.departments) then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'revise', 'This record is settled: the PM has said do not re-raise it.');
  end if;

  select string_agg(key, ', ') into extra from jsonb_object_keys(p_changes) key where key <> all (allowed);
  if extra is not null then
    raise exception 'A revise cannot change %.', extra using errcode = 'check_violation';
  end if;
  -- F126: a condition's status goes through set_condition.
  if p_changes ? 'status' and r.kind = 'condition' then
    raise exception 'A condition''s status changes only through knowledge.set_condition.' using errcode = 'check_violation';
  end if;
  if p_changes ? 'status' and (p_changes->>'status' in ('live', 'retired')
                               or (select 'retired' = any (x.statuses) from knowledge.kinds x where x.slug = r.kind)) then
    raise exception 'A % changes status through knowledge.decide or knowledge.retire.', r.kind using errcode = 'check_violation';
  end if;
  if p_changes ? 'why' and (select x.needs_why from knowledge.kinds x where x.slug = r.kind)
     and coalesce(btrim(p_changes->>'why'), '') = '' then
    raise exception 'A % needs a why.', r.kind using errcode = 'check_violation';
  end if;
  if p_changes ? 'why' and p_changes->>'why' is distinct from r.why and p_evidence is null then
    raise exception 'A new why names its evidence: the decisions, exceptions or signals that prompted it.'
      using errcode = 'check_violation';
  end if;

  new_audience := coalesce(p_changes->>'audience', r.audience);
  new_departments := case when p_changes ? 'departments'
    then coalesce((select array_agg(x) from jsonb_array_elements_text(p_changes->'departments') x), '{}')
    else r.departments end;
  -- #1549: the overrule gates read the PM key, whatever the switch says.
  if not pm then
    -- F126: only an operator writes a check, which the scheduled job runs.
    if p_changes ? 'checked_by' then
      raise exception 'Only an operator writes a condition''s check: the scheduled job runs it.'
        using errcode = 'insufficient_privilege';
    end if;
    if p_changes ?| array['strength', 'path', 'audience', 'departments', 'ring'] then  -- F128: ring
      raise exception 'Only an operator changes how strict a record is, its ring, its path, or who may read it.'
        using errcode = 'insufficient_privilege';
    end if;
    perform knowledge._pm_rule_guard(r);
  end if;
  -- Ordinary work: off, every key revises any other call.
  if not w.operator then
    perform knowledge._own_call(w, r);
  end if;

  -- F126: parked work is not marked building. Answered, and logged.
  if p_changes->>'status' = 'building' and r.status <> 'building' and knowledge.is_parked(p_id) then
    return knowledge._refuse(w, p_id, 'revise', knowledge._parked_reason(p_id));
  end if;

  update knowledge.records set
    concern     = case when p_changes ? 'concern'     then p_changes->>'concern'     else concern end,
    answer      = case when p_changes ? 'answer'      then p_changes->>'answer'      else answer end,
    why         = case when p_changes ? 'why'         then p_changes->>'why'         else why end,
    status      = case when p_changes ? 'status'      then p_changes->>'status'      else status end,
    strength    = case when p_changes ? 'strength'    then p_changes->>'strength'    else strength end,
    enforced_by = case when p_changes ? 'enforced_by' then p_changes->>'enforced_by' else enforced_by end,
    scope       = case when p_changes ? 'scope'       then p_changes->>'scope'       else scope end,
    audience    = new_audience,
    departments = new_departments,
    owner       = case when p_changes ? 'owner'       then p_changes->>'owner'       else owner end,
    path        = case when p_changes ? 'path'        then p_changes->>'path'        else path end,
    holds       = case when p_changes ? 'holds'       then p_changes->>'holds'       else holds end,
    until       = case when p_changes ? 'until'       then p_changes->>'until'       else until end,
    as_of       = case when p_changes ? 'as_of'       then (p_changes->>'as_of')::date else as_of end,
    source      = case when p_changes ? 'source'      then p_changes->>'source'      else source end,
    tags        = case when p_changes ? 'tags'
                    then coalesce((select array_agg(x) from jsonb_array_elements_text(p_changes->'tags') x), '{}')
                    else tags end,
    embedding   = case when p_changes ? 'embedding'   then the_embedding else embedding end,
    checked_by  = case when p_changes ? 'checked_by'                                       -- F126
                    then case when jsonb_typeof(p_changes->'checked_by') <> 'null' then p_changes->'checked_by' end
                    else checked_by end,
    ring        = case when p_changes ? 'ring'        then p_changes->>'ring'        else ring end  -- F128
  where id = p_id
  returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;

-- Overrule: deciding a proposal.
create or replace function knowledge.decide(p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  v integer;
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator decides a proposal.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  select * into r from knowledge.records where id = p_id for update;
  if not found then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'decide', 'This record is settled: the PM has said do not re-raise it.');
  end if;
  if r.status <> 'proposed' then
    raise exception 'Only a proposed record is decided; % is %.', p_id, r.status using errcode = 'check_violation';
  end if;
  update knowledge.records set status = 'live', decided_by = w.person, decided_through = w.name, decided_on = current_date
   where id = p_id returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;

-- retire(): unchanged but for the PM-rule guard (#1549). A decision still goes only with its replacement.
create or replace function knowledge.retire(p_id text, p_replaced_by text, p_reason text, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  newer knowledge.records;
  v integer;
begin
  perform knowledge._context(w, p_reason, null, p_effective);
  select * into r from knowledge.records where id = p_id for update;
  if not found or not knowledge.can_see(r.audience, r.departments) then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'retire', 'This record is settled: the PM has said do not re-raise it.');
  end if;
  if not (select 'retired' = any (x.statuses) from knowledge.kinds x where x.slug = r.kind) then
    raise exception 'A % changes status through knowledge.revise.', r.kind using errcode = 'check_violation';
  end if;
  if r.status = 'retired' then
    raise exception '% is already retired.', p_id using errcode = 'check_violation';
  end if;
  if not knowledge._pm_key() then  -- #1549: a philosophy, pattern, practice, new-territory or absolute record is the PM's
    perform knowledge._pm_rule_guard(r);
  end if;
  if not w.operator then
    perform knowledge._own_call(w, r);
  end if;

  if p_replaced_by is not null then
    select * into newer from knowledge.records where id = p_replaced_by;
  end if;
  if r.kind = 'decision'
     and (p_replaced_by is null or p_replaced_by = p_id or newer.id is null or newer.status <> 'live'
          or not knowledge.can_see(newer.audience, newer.departments)) then
    raise exception 'A decision is retired only with a link to the newer record that replaces it.'
      using errcode = 'check_violation';
  end if;
  if p_replaced_by is not null and newer.id is null then
    raise exception 'No record %.', p_replaced_by using errcode = 'no_data_found';
  end if;

  if newer.id is not null then
    insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
    values (newer.id, p_id, 'replaces', 'stated', p_reason, w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
  end if;
  update knowledge.records set status = 'retired' where id = p_id returning version into v;
  return jsonb_build_object('id', p_id, 'version', v, 'replaced_by', newer.id);
end $$;

-- Overrule: settling and unsettling.
create or replace function knowledge.set_settled(p_id text, p_settled boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  v integer;
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator settles or unsettles a record.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  update knowledge.records set settled = p_settled where id = p_id returning version into v;
  if not found then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'version', v, 'settled', p_settled);
end $$;

-- Overrule: writing a condition's check, whichever path writes it.
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
      if not knowledge._pm_key() then  -- #1549
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

-- Overrule: making one condition a part of another (it changes the parent's status, for good).
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
    if not knowledge._pm_key() then  -- #1549
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

-- Overrule: marking a condition. The scheduled check holds a real operator key, so it is unaffected.
create or replace function knowledge.set_condition(p_id text, p_status text, p_reason text, p_evidence jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  allowed text[];
  v integer;
begin
  if not knowledge._pm_key() then  -- #1549: the PM, or the scheduled check holding an operator key
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

-- Overrule: a concept's name and status are the PM's rulings.
create or replace function knowledge._concepts_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind <> 'concept' or knowledge._pm_key() then  -- #1549
    return new;
  end if;
  if tg_op = 'INSERT' and new.status <> 'idea' then
    raise exception 'Only an operator records a concept as %: any key may record an idea.', new.status
      using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Only an operator changes a concept: its name and status are the PM''s rulings.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;

-- Overrule: a lineage link is never removed.
create or replace function knowledge._concept_links() returns trigger
language plpgsql set search_path = '' as $$
declare
  from_kind text;
  to_kind text;
begin
  if new.type not in ('split_from', 'merged_into', 'became', 'scopes') then
    return new;
  end if;
  -- Links are never removed, so a wrong lineage link would be history for good.
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator links a concept''s lineage (%): a link is never removed.', new.type
      using errcode = 'insufficient_privilege';
  end if;
  select kind into from_kind from knowledge.records where id = new.from_id;
  select kind into to_kind from knowledge.records where id = new.to_id;
  if new.type = 'scopes' then
    if from_kind <> 'feature' or to_kind <> 'concept' then
      raise exception 'A scenario scopes a concept: % is a %, % is a %.', new.from_id, from_kind, new.to_id, to_kind
        using errcode = 'check_violation';
    end if;
  elsif from_kind not in ('concept', 'feature') or to_kind not in ('concept', 'feature') then
    raise exception 'Lineage (%) joins concepts and scenarios: % is a %, % is a %.', new.type, new.from_id, from_kind, new.to_id, to_kind
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Overrule: a concept's names and events, dated in the past.
create or replace function knowledge._concept_writer(p_concept text) returns knowledge.agents
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator records a concept''s names and events: they are dated, often in the past.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from knowledge.records r where r.id = p_concept and r.kind = 'concept') then
    raise exception 'No concept %.', p_concept using errcode = 'no_data_found';
  end if;
  return w;
end $$;

-- Overrule: which feature or journey a slice belongs to, for good (as F129 left it).
create or replace function knowledge._plan_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type <> 'slice_of' then
    return new;
  end if;
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator says which feature a slice belongs to: a link is never removed.'
      using errcode = 'insufficient_privilege';
  end if;
  if (select kind from knowledge.records where id = new.from_id) is distinct from 'slice'
     or (select kind from knowledge.records where id = new.to_id) not in ('feature', 'journey') then
    raise exception 'A slice is a slice_of a feature or a journey: % to %.', new.from_id, new.to_id using errcode = 'check_violation';
  end if;
  if exists (select 1 from knowledge.links l where l.from_id = new.from_id and l.type = 'slice_of' and l.to_id <> new.to_id) then
    raise exception '% already belongs to another feature or journey.', new.from_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- Overrule: changing the plan (add_slice, move_slice, plan_version, replan).
create or replace function knowledge._plan_writer() returns knowledge.agents
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator changes the plan: what is in a version is the PM''s.'
      using errcode = 'insufficient_privilege';
  end if;
  return w;
end $$;

-- Overrule: setting, once and for good, the terms of someone else's experiment.
create or replace function knowledge.set_experiment_terms(p_experiment text, p_practice text, p_baseline text, p_measure text,
                                               p_verdict_on date)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  e knowledge.records;
  p knowledge.records;
  t knowledge.experiment_terms;
begin
  select * into e from knowledge.records where id = p_experiment;
  if e.id is null or e.kind <> 'experiment' or not knowledge.can_see(e.audience, e.departments) then
    raise exception 'No experiment %.', p_experiment using errcode = 'no_data_found';
  end if;
  select * into p from knowledge.records where id = p_practice;
  if p.id is null or p.kind <> 'practice' or not knowledge.can_see(p.audience, p.departments) then
    raise exception 'An experiment changes a practice; % is not one.', p_practice using errcode = 'check_violation';
  end if;
  -- Terms are set once, so only whoever may judge the experiment sets them:
  -- an operator, or the person whose experiment it is.
  if not knowledge._pm_key() and e.decided_by is distinct from w.person then  -- #1549
    raise exception 'Only an operator, or whoever recorded %, sets its terms: they are set once.', p_experiment
      using errcode = 'insufficient_privilege';
  end if;
  select * into t from knowledge.experiment_terms where experiment_id = p_experiment;
  if t.experiment_id is not null then
    if (t.practice_id, t.baseline, t.measure, t.verdict_on)
       is not distinct from (p_practice, btrim(p_baseline), btrim(p_measure), p_verdict_on) then
      return jsonb_build_object('id', p_experiment, 'unchanged', true);
    end if;
    raise exception 'An experiment''s terms are set once: % already has its practice, baseline, measure and verdict date. Start a new experiment instead.', p_experiment
      using errcode = 'check_violation';
  end if;
  insert into knowledge.experiment_terms (experiment_id, practice_id, baseline, measure, verdict_on, person, agent)
  values (p_experiment, p_practice, btrim(p_baseline), btrim(p_measure), p_verdict_on, w.person, w.name);
  insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
  values (p_experiment, p_practice, 'changes', 'stated', 'The practice this experiment changes.', w.person, w.name)
  on conflict (from_id, to_id, type) do nothing;
  return jsonb_build_object('id', p_experiment, 'practice', p_practice, 'verdict_on', p_verdict_on);
end $$;

-- Overrule: confirming a practice.
create or replace function knowledge.confirm(p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  v integer;
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator confirms a practice.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  update knowledge.records set as_of = current_date where id = p_id and kind = 'practice' returning version into v;
  if not found then
    raise exception 'No practice %.', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'version', v, 'confirmed_on', current_date);
end $$;

-- Overrule: a map item recorded live or changed (the PM rules on journeys).
create or replace function knowledge._maps_before() returns trigger
language plpgsql set search_path = '' as $$
declare
  pk text;
  anc text;
  depth integer := 0;
begin
  if knowledge._is_map_kind(new.kind) then
    if new.place is null then
      raise exception 'A % has a place under its parent: record it through knowledge.map_item.', new.kind
        using errcode = 'check_violation';
    end if;
    if new.kind = 'journey' then
      if new.parent is not null then
        raise exception 'A journey is the whole map: it has no parent.' using errcode = 'check_violation';
      end if;
    else
      select kind into pk from knowledge.records where id = new.parent;
      if new.parent is null or pk is distinct from knowledge._map_parent_kind(new.kind) then
        raise exception 'A % sits under a %: % is %.', new.kind, knowledge._map_parent_kind(new.kind),
          coalesce(new.parent, 'nothing'), coalesce('a ' || pk, 'not a record') using errcode = 'check_violation';
      end if;
    end if;
    if new.takes is not null then
      raise exception 'Only a slice takes items; % is a %.', new.id, new.kind using errcode = 'check_violation';
    end if;
    -- The PM rules on journeys: an agent proposes, an operator decides.
    if not knowledge._pm_key() then  -- #1549
      if tg_op = 'UPDATE' then
        raise exception 'Only an operator changes a map item: propose it with knowledge.map_propose.'
          using errcode = 'insufficient_privilege';
      end if;
      if new.status <> 'proposed' then
        raise exception 'Any key may propose a %; only an operator records one as %.', new.kind, new.status
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  else
    if new.parent is not null or new.place is not null then
      raise exception 'Only a story-map item has a parent and a place; % is a %.', new.id, new.kind
        using errcode = 'check_violation';
    end if;
    if new.takes is not null and new.kind <> 'slice' then
      raise exception 'Only a slice takes items; % is a %.', new.id, new.kind using errcode = 'check_violation';
    end if;
    if new.takes is not null and (tg_op = 'INSERT' or new.takes is distinct from old.takes)
       and coalesce(current_setting('knowledge.via', true), '') <> 'map_slice' then
      raise exception 'A slice''s line moves only through knowledge.map_slice or knowledge.map_retake.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

-- Overrule: drawing or moving a slice, deciding a map change.
create or replace function knowledge._map_writer() returns knowledge.agents
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only an operator draws or moves a slice: the PM rules on journeys and slices.'
      using errcode = 'insufficient_privilege';
  end if;
  return w;
end $$;

-- Overrule: moving an item the PM placed. A placement counts as the PM's only when the PM's key made it.
create or replace function knowledge.place(p_item text, p_on text, p_reason text, p_stands_on text[] default '{}',
                                p_needs_first text[] default '{}', p_clashes text[] default '{}',
                                p_basis text default 'stated', p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  pm boolean := knowledge._pm_key();  -- #1549
  it knowledge.records;
  target knowledge.records;
  cur knowledge.placements;
  new_id bigint;
begin
  select * into it from knowledge.records where id = p_item;
  if it.id is null or not knowledge.can_see(it.audience, it.departments) then
    raise exception 'No record %.', p_item using errcode = 'no_data_found';
  end if;
  if it.kind not in ('feature', 'concept') then
    raise exception 'A feature or an idea is placed on a map; % is a %.', p_item, it.kind using errcode = 'check_violation';
  end if;
  if p_on is not null then
    select * into target from knowledge.records where id = p_on;
    if target.id is null or not knowledge.can_see(target.audience, target.departments) then
      raise exception 'No record %.', p_on using errcode = 'no_data_found';
    end if;
    if target.kind not in ('task', 'detail') then
      raise exception 'A feature or an idea sits on a task or a detail; % is a %.', p_on, target.kind
        using errcode = 'check_violation';
    end if;
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Every placement gives a reason.' using errcode = 'check_violation';
  end if;
  select * into cur from knowledge.placements where item_id = p_item order by id desc limit 1;
  if cur.id is not null
     and (cur.on_id, cur.basis, cur.stands_on, cur.needs_first, cur.clashes, cur.note)
         is not distinct from (p_on, coalesce(p_basis, 'stated'), coalesce(p_stands_on, '{}'), coalesce(p_needs_first, '{}'),
                               coalesce(p_clashes, '{}'), p_note) then
    return jsonb_build_object('item', p_item, 'on', p_on, 'unchanged', true);
  end if;
  -- A stated place is not undone by a guess, and one an operator made is
  -- changed only by an operator: built is derived from it.
  if cur.id is not null and cur.basis = 'stated' and coalesce(p_basis, 'stated') = 'inferred' then
    return jsonb_build_object('item', p_item, 'on', cur.on_id, 'kept', 'a stated place is not replaced by an inferred one');
  end if;
  if cur.id is not null and cur.by_operator and cur.basis = 'stated' and not pm then  -- #1549
    return jsonb_build_object('item', p_item, 'on', cur.on_id,
                              'kept', 'the PM placed it; only an operator moves it, so raise it with the PM');
  end if;
  insert into knowledge.placements (item_id, on_id, basis, stands_on, needs_first, clashes, note, reason, by_operator, person, agent)
  values (p_item, p_on, coalesce(p_basis, 'stated'), coalesce(p_stands_on, '{}'), coalesce(p_needs_first, '{}'),
          coalesce(p_clashes, '{}'), p_note, p_reason, pm, w.person, w.name)  -- #1549: only the PM's key places for the PM
  returning id into new_id;
  return jsonb_build_object('item', p_item, 'on', p_on, 'placement', new_id);
end $$;

-- Overrule: dropping an idea.
create or replace function knowledge.drop_idea(p_id text, p_why text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
begin
  if not knowledge._pm_key() then  -- #1549
    raise exception 'Only the PM drops an idea.' using errcode = 'insufficient_privilege';
  end if;
  select * into r from knowledge.records where id = p_id;
  if r.id is null or r.kind <> 'idea' then
    raise exception 'No idea %.', p_id using errcode = 'no_data_found';
  end if;
  if r.status <> 'open' then
    raise exception '% is already %.', p_id, r.status using errcode = 'check_violation';
  end if;
  perform knowledge._context(w, p_why, null, null);
  perform knowledge._move(p_id, 'dropped');
  return jsonb_build_object('id', p_id, 'status', 'dropped', 'on', current_date);
end $$;

-- ---------------------------------------------------------------------------
-- Condition checks run as knowledge_check: reads the knowledge schema only.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'knowledge_check') then
    create role knowledge_check nologin;
  end if;
end $$;
comment on role knowledge_check is
  'Runs condition check queries (knowledge._run_check). No login; reads the knowledge schema and nothing else.';
grant usage on schema knowledge to knowledge_check;

-- Every knowledge table but the keys and the switch, every row: a check is
-- written by the PM's key and counts, it does not show.
do $$
declare
  t text;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'knowledge' and c.relkind in ('r', 'v', 'm', 'p')
              and c.relname not in ('agents', 'settings')
  loop
    execute format('grant select on knowledge.%I to knowledge_check', t);
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                where n.nspname = 'knowledge' and c.relname = t and c.relrowsecurity) then
      execute format('create policy %I on knowledge.%I for select to knowledge_check using (true)', t || '_for_checks', t);
    end if;
  end loop;
end $$;

-- Volatile on purpose: a stable function is refused writes and SET before the
-- read-only transaction and the role rule can say why.
create function knowledge._run_check(p_query text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  result text;
begin
  execute p_query into result;
  return result;
end $$;
comment on function knowledge._run_check(text) is
  'Runs one condition check query as knowledge_check and returns its first value as text. Called by the scheduled job inside a read-only transaction.';

revoke all on function knowledge._pm_rule_guard(knowledge.records), knowledge._run_check(text)
  from public, anon, authenticated, service_role, knowledge_store;
-- Triggers run as the caller, so the store's login asks _pm_key itself.

-- Hand _run_check to knowledge_check. The new owner needs create in the schema
-- while ownership moves, and only the owner grants on it afterwards (a grant
-- made before the move goes with the old owner), so the one grant, to the
-- job's own login, is made as knowledge_check. Nothing is left behind.
grant create on schema knowledge to knowledge_check;
grant knowledge_check to current_user;
alter function knowledge._run_check(text) owner to knowledge_check;
set role knowledge_check;
grant execute on function knowledge._run_check(text) to postgres;
reset role;
revoke knowledge_check from current_user;
revoke create on schema knowledge from knowledge_check;
