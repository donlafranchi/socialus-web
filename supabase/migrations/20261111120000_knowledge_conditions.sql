-- F126 / T1020 (#1223) — conditions: what decisions and features wait on,
-- with parts. The store side; the lookup tool's unlocks/waits_on are #1219,
-- and turning today's `[for now]` until-text and scenario gates into proposed
-- conditions is a follow-on to the import (#1218).
--
-- Scenario: socialus-plan planning/scenario-F126.md (approved 2026-11-10).
-- Tests: supabase/tests/knowledge_conditions.sql, run by
-- tests/knowledge-conditions-db.test.ts; the scheduled check is
-- scripts/knowledge/conditions.ts, run by .github/workflows/knowledge-conditions.yml.
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · `condition`, a new kind: a why, an owner, a status (not started,
--     partial, met, withdrawn) and, where one decides it, a check.
--   · `part_of`, `starts_when` and `ends_when`, three new link types. A part
--     is part_of its parent; a decision or feature starts_when a condition
--     (parked until it is met) or ends_when one (holds until it is met).
--     Waiting on one part is not waiting on the whole.
--   · `checked_by` on a record: the check that decides a condition, either a
--     query ({"query", optionally "at_least" and "line": a number crossing a
--     line}) or a named test file ({"test": "tests/….test.ts"}). The scheduled
--     job runs it. Only an operator writes one, because the job runs it.
--   · knowledge.set_condition: the one way a condition's status changes, by an
--     operator (the PM, or the scheduled check acting for him), with a reason,
--     and a history row like every other change.
--   · knowledge.condition_status: a parent's status, computed from its parts
--     all the way down and never stored: met when every part not withdrawn is
--     met, partial when some are, not started when none are. A parent is only
--     ever withdrawn (or brought back) by hand.
--   · knowledge.is_parked, and a refusal: work that starts_when an unmet
--     condition cannot be marked building. Through revise the refusal is
--     answered and logged, naming the condition and its unmet parts; any other
--     path raises.
--   · knowledge.announcements: what the scheduled job last announced for each
--     condition, so one Issue goes out each time a condition or part becomes
--     met, however it became met. The job records "met" first and the Issue's
--     address after opening it, so a failed run never opens one twice.
--   · Only an operator links a part (part_of): a part changes its parent's
--     computed status, and links are never removed. Any key may record that
--     something starts_when or ends_when a condition.
--
-- record() and revise() are replaced whole (same signatures) to take
-- `checked_by` and to route a condition's status through set_condition; every
-- other line of them is as #1217 wrote it.

-- ---------------------------------------------------------------------------
-- The kind and the link types: rows, as #1217 designed for.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('condition', '{not started,partial,met,withdrawn}', true, 'CN');

insert into knowledge.link_types (slug) values ('part_of'), ('starts_when'), ('ends_when');

comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains; and for conditions part_of, starts_when, ends_when. Marked stated, or inferred when an import guessed it.';

-- ---------------------------------------------------------------------------
-- The check that decides a condition.

alter table knowledge.records add column checked_by jsonb;
comment on column knowledge.records.checked_by is
  'For a condition: the check that decides it is met. {"query": "<SQL returning one number or true/false>", "at_least": N, "line": "<what N counts>"} or {"test": "tests/<file>.test.ts"}. Run by the scheduled job; written only by an operator.';

create function knowledge._check_problem(c jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when c is null then null
    when jsonb_typeof(c) <> 'object' then 'a check is an object'
    when exists (select 1 from jsonb_object_keys(c) k where k not in ('query', 'at_least', 'line', 'test'))
      then 'a check takes only query, at_least, line or test'
    when (c ? 'query') = (c ? 'test') then 'a check is either a query or a named test, one of the two'
    when c ? 'query' and (jsonb_typeof(c->'query') <> 'string' or btrim(c->>'query') = '')
      then 'a check''s query is its SQL'
    when c ? 'at_least' and (not c ? 'query' or jsonb_typeof(c->'at_least') <> 'number')
      then 'a threshold is a number, on a check that is a query'
    when c ? 'line' and jsonb_typeof(c->'line') <> 'string' then 'a check''s line is words'
    when c ? 'test' and (jsonb_typeof(c->'test') <> 'string'
                         or c->>'test' !~ '^tests/[A-Za-z0-9_./-]+\.test\.ts$' or c->>'test' ~ '\.\.')
      then 'a named test is a file under tests/, ending .test.ts'
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- What the scheduled job last announced for each condition. Append-only.

create table knowledge.announcements (
  id        bigint generated always as identity primary key,
  record_id text not null references knowledge.records (id),
  status    text not null check (status in ('not started', 'partial', 'met', 'withdrawn')),
  issue_url text,
  person    text not null,
  agent     text not null,
  at        timestamptz not null default clock_timestamp()
);
create index announcements_record on knowledge.announcements (record_id, id desc);
comment on table knowledge.announcements is
  'Each time the scheduled check saw a condition''s status change, and the Issue it opened when the condition became met. Append-only.';

create trigger announcements_append_only before update or delete on knowledge.announcements
  for each row execute function knowledge._append_only();
create trigger announcements_no_truncate before truncate on knowledge.announcements
  for each statement execute function knowledge._append_only();

-- ---------------------------------------------------------------------------
-- Status, computed. Security definer so a parent reads the same whoever asks;
-- what a key may read of the parts themselves is still row-level security.

create function knowledge._condition_status(p_id text, p_depth integer) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  own text;
  n_parts integer := 0;
  n_met integer := 0;
  n_started integer := 0;
  s text;
  part text;
begin
  select status into own from knowledge.records where id = p_id and kind = 'condition';
  if own is null or own = 'withdrawn' or p_depth > 50 then
    return own;
  end if;
  for part in select l.from_id from knowledge.links l where l.to_id = p_id and l.type = 'part_of' loop
    s := knowledge._condition_status(part, p_depth + 1);
    continue when s is null or s = 'withdrawn';
    n_parts := n_parts + 1;
    if s = 'met' then n_met := n_met + 1; end if;
    if s in ('met', 'partial') then n_started := n_started + 1; end if;
  end loop;
  if not exists (select 1 from knowledge.links l where l.to_id = p_id and l.type = 'part_of') then
    return own;
  end if;
  return case
    -- Every part withdrawn: the parent keeps its own status. Withdrawing a
    -- parent stays a decision made by hand.
    when n_parts = 0 then own
    when n_met = n_parts then 'met'
    when n_started > 0 then 'partial'
    else 'not started'
  end;
end $$;

create function knowledge.condition_status(p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select knowledge._condition_status(p_id, 0)
$$;
comment on function knowledge.condition_status(text) is
  'A condition''s status. A condition with parts: computed from them all the way down, never stored (met when every part not withdrawn is met, partial when some are, not started when none are); withdrawn only by hand.';

-- The unmet conditions a record starts_when, and under each the unmet parts
-- at the bottom of it: the words a refusal gives.
create function knowledge._unmet_leaves(p_id text, p_depth integer) returns setof text
language plpgsql stable security definer set search_path = '' as $$
declare
  part text;
  s text;
  any_part boolean := false;
begin
  s := knowledge.condition_status(p_id);
  if s in ('met', 'withdrawn') or p_depth > 50 then
    return;
  end if;
  for part in select l.from_id from knowledge.links l where l.to_id = p_id and l.type = 'part_of' order by l.from_id loop
    any_part := true;
    return query select knowledge._unmet_leaves(part, p_depth + 1);
  end loop;
  if not any_part then
    return next p_id;
  end if;
end $$;

create function knowledge.is_parked(p_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from knowledge.links l
     where l.from_id = p_id and l.type = 'starts_when'
       and knowledge.condition_status(l.to_id) not in ('met', 'withdrawn'))
$$;
comment on function knowledge.is_parked(text) is
  'Whether a record starts_when a condition or part that is not yet met. A withdrawn condition no longer parks anything.';

create function knowledge._parked_reason(p_id text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  c record;
  leaves text;
  parts text := '';
begin
  for c in
    select r.id, r.answer, r.audience, r.departments, knowledge.condition_status(r.id) as status
      from knowledge.links l join knowledge.records r on r.id = l.to_id
     where l.from_id = p_id and l.type = 'starts_when'
       and knowledge.condition_status(r.id) not in ('met', 'withdrawn')
     order by r.id
  loop
    if not knowledge.can_see(c.audience, c.departments) then
      parts := parts || '; a condition this key cannot read';
      continue;
    end if;
    select string_agg(format('%s "%s"', x.id, x.answer), ', ' order by x.id) into leaves
      from knowledge.records x
     where x.id in (select knowledge._unmet_leaves(c.id, 0)) and x.id <> c.id
       and knowledge.can_see(x.audience, x.departments);
    parts := parts || format('; %s "%s" (%s%s)', c.id, c.answer, c.status,
                             case when leaves is null then '' else ', waiting on ' || leaves end);
  end loop;
  return format('%s is parked: it starts when these are met%s.', p_id, coalesce(parts, ''));
end $$;

-- ---------------------------------------------------------------------------
-- The rules a condition keeps, whichever path writes it.

create function knowledge._conditions_before() returns trigger
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
      if not knowledge.is_operator() then
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

create trigger records_conditions before insert or update on knowledge.records
  for each row execute function knowledge._conditions_before();

-- Links for conditions: what may be a part, what may wait, and no loops.
create function knowledge._condition_links() returns trigger
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
    if not knowledge.is_operator() then
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

create trigger links_conditions before insert on knowledge.links
  for each row execute function knowledge._condition_links();

-- ---------------------------------------------------------------------------
-- The one way a condition's status changes.

create function knowledge.set_condition(p_id text, p_status text, p_reason text, p_evidence jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  allowed text[];
  v integer;
begin
  if not w.operator then
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
comment on function knowledge.set_condition(text, text, text, jsonb) is
  'Marks a condition not started, partial, met or withdrawn, with a reason and evidence, writing a history row. Operators only. A condition with parts is computed from them; by hand it is only withdrawn or brought back.';

create function knowledge.announce(p_id text, p_status text, p_issue_url text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  new_id bigint;
begin
  if not w.operator then
    raise exception 'Only an operator records an announcement.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from knowledge.records where id = p_id and kind = 'condition') then
    raise exception 'No condition %.', p_id using errcode = 'no_data_found';
  end if;
  insert into knowledge.announcements (record_id, status, issue_url, person, agent)
  values (p_id, p_status, p_issue_url, w.person, w.name) returning id into new_id;
  return new_id;
end $$;

-- ---------------------------------------------------------------------------
-- One row per condition: what it is, its stored and computed status, its
-- parts, its check, and what was last announced. Row-level security on
-- records decides which rows a key sees.

create view knowledge.conditions with (security_invoker = true) as
  select r.id, r.answer, r.why, r.owner, r.concern, r.audience, r.departments,
         r.status as own_status,
         knowledge.condition_status(r.id) as status,
         r.checked_by,
         array(select l.from_id from knowledge.links l where l.to_id = r.id and l.type = 'part_of' order by l.from_id) as parts,
         array(select l.to_id from knowledge.links l where l.from_id = r.id and l.type = 'part_of' order by l.to_id) as part_of,
         (select a.status from knowledge.announcements a where a.record_id = r.id order by a.id desc limit 1) as announced,
         (select a.issue_url from knowledge.announcements a where a.record_id = r.id order by a.id desc limit 1) as announced_issue
    from knowledge.records r
   where r.kind = 'condition';
comment on view knowledge.conditions is
  'Every condition a key can read: its own status, its status computed from its parts, its parts, its check, and what the scheduled job last announced.';

-- ---------------------------------------------------------------------------
-- record() and revise(), replaced whole: they take checked_by, and a
-- condition's status goes through set_condition. Marked "F126" where changed.

create or replace function knowledge.record(p jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  k text := p->>'kind';
  allowed text[] := array['id', 'kind', 'concern', 'answer', 'why', 'status', 'strength', 'enforced_by', 'scope',
                          'audience', 'departments', 'owner', 'decided_by', 'decided_on', 'path', 'holds', 'until',
                          'settled', 'as_of', 'source', 'tags', 'embedding',
                          'checked_by'];  -- F126
  extra text;
  the_id text;
  the_status text;
  the_audience text := coalesce(p->>'audience', 'operators');
  the_departments text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p->'departments') x), '{}');
  pm_only boolean := k in ('philosophy', 'pattern') or p->>'path' = 'new territory'
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
      raise exception 'Philosophies, patterns and new-territory decisions go live only when the PM decides.'
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
                                 settled, as_of, source, tags, embedding, checked_by)
  values (the_id, k, p->>'concern', p->>'answer', p->>'why', the_status, coalesce(p->>'strength', 'guideline'),
          p->>'enforced_by', p->>'scope', the_audience, the_departments, p->>'owner',
          coalesce(p->>'decided_by', w.person),
          case when p ? 'decided_by' then null else w.name end,
          coalesce((p->>'decided_on')::date, coalesce(p_effective, now())::date),
          p->>'path', p->>'holds', p->>'until',
          coalesce((p->>'settled')::boolean, false), (p->>'as_of')::date, p->>'source',
          coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'),
          the_embedding,
          case when jsonb_typeof(p->'checked_by') <> 'null' then p->'checked_by' end);  -- F126
  return the_id;
end $$;

create or replace function knowledge.revise(p_id text, p_changes jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  allowed text[] := array['concern', 'answer', 'why', 'status', 'strength', 'enforced_by', 'scope', 'audience',
                          'departments', 'owner', 'path', 'holds', 'until', 'as_of', 'source', 'tags', 'embedding',
                          'checked_by'];  -- F126
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
  if not w.operator then
    -- F126: only an operator writes a check, which the scheduled job runs.
    if p_changes ? 'checked_by' then
      raise exception 'Only an operator writes a condition''s check: the scheduled job runs it.'
        using errcode = 'insufficient_privilege';
    end if;
    perform knowledge._own_call(w, r);
    if p_changes ?| array['strength', 'path', 'audience', 'departments'] then
      raise exception 'Only an operator changes how strict a record is, its path, or who may read it.'
        using errcode = 'insufficient_privilege';
    end if;
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
                    else checked_by end
  where id = p_id
  returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;

-- ---------------------------------------------------------------------------
-- Access: read like the rest of the store, write only through the functions.

alter table knowledge.announcements enable row level security;
create policy announcements_of_visible_records on knowledge.announcements for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = record_id));

revoke all on knowledge.announcements, knowledge.conditions from public, anon, authenticated, service_role;
revoke all on sequence knowledge.announcements_id_seq from public, anon, authenticated, service_role;
revoke all on function
  knowledge._check_problem(jsonb), knowledge._condition_status(text, integer), knowledge.condition_status(text),
  knowledge._unmet_leaves(text, integer), knowledge.is_parked(text), knowledge._parked_reason(text),
  knowledge._conditions_before(), knowledge._condition_links(),
  knowledge.set_condition(text, text, text, jsonb), knowledge.announce(text, text, text)
  from public, anon, authenticated, service_role;

grant select on knowledge.announcements, knowledge.conditions to knowledge_store;
grant execute on function
  knowledge.condition_status(text), knowledge.is_parked(text),
  knowledge.set_condition(text, text, text, jsonb), knowledge.announce(text, text, text)
  to knowledge_store;
