-- F127 (#1238): versions are plans of feature slices that can change without
-- breaking. Stage 3 of the F125 store, after conditions (F126) and concepts (F130).
--
-- Scenario: socialus-plan planning/scenario-F127.md (approved 2026-11-10).
-- Tests: supabase/tests/knowledge_plans.sql, run by
-- tests/knowledge-plans-db.test.ts. The import that brings today's plan in is
-- scripts/knowledge/plans.ts; the lookup tool's verbs are
-- src/lib/knowledge/plans.ts.
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · `slice`, a new kind: one cut of a feature, smallest to full. Statuses
--     planned, building, shipped, withdrawn. A slice carries a horizon (now,
--     next, later) and a rank, and waits on conditions through F126's
--     `starts_when` link; F126's refusal to mark parked work building
--     covers it through revise(), and add_slice refuses a parked slice made
--     as building. Its id is its feature's plus -S and a number.
--   · `version`, a new kind, ids VN-0001 on: a plan. Statuses planned,
--     current, done, dropped. Its `plan` holds the outcomes it is for, an
--     appetite, the slices it includes, and the slices it leaves out, each
--     with a reason and, where one exists, the condition that brings it back.
--   · `slice_of`, a link type: a slice belongs to one feature, for good.
--   · Four columns on records: `horizon` and `rank` (a slice's, required
--     there, refused elsewhere), `plan` (a version's only) and `due_on` (a
--     version's only: no feature or slice carries a date, F127.3).
--   · A plan changes only through knowledge.replan, with a why that names
--     the outcome that changed. Every change is a new version in the store's
--     history, so the earlier plan stays readable (F127.4). Membership lives
--     in the plan, not in links, because links are never removed.
--   · Left out is not forgotten (F127.6): each leave-out is stamped with the
--     outcomes it was decided under; knowledge.left_out_due lists it again
--     when its condition is met or the version's outcomes are no longer those.
--   · Reads, one call each (F127.5): knowledge.plan_as_of, plan_changes,
--     left_out_due and roadmap (Now / Next / Later by rank, F127.7).
--   · Writes are an operator's (the PM, or the import for him): add_slice,
--     move_slice, plan_version, replan.
--
-- record() and revise() are not replaced: neither can write horizon, rank,
-- plan or due_on, and a slice or version made through record() is refused by
-- the trigger below for want of them. revise() still changes a slice's or a
-- version's status, answer and why, with history like every other record.
--
-- No app table changes. Nothing in the app reads the schema.

-- ---------------------------------------------------------------------------
-- The kinds and the link type: rows, as #1217 designed for.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('slice',   '{planned,building,shipped,withdrawn}', false, null),
  ('version', '{planned,current,done,dropped}',       true,  'VN');

insert into knowledge.link_types (slug) values ('slice_of');

comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains; for conditions part_of, starts_when, ends_when; for concepts split_from, merged_into, became, scopes; for plans slice_of. Marked stated, or inferred when an import guessed it.';

-- ---------------------------------------------------------------------------
-- The columns.

alter table knowledge.records
  add column horizon text check (horizon in ('now', 'next', 'later')),
  add column rank    integer check (rank > 0),
  add column plan    jsonb,
  add column due_on  date;

comment on column knowledge.records.horizon is 'A slice''s horizon: now, next or later. Slices only.';
comment on column knowledge.records.rank is 'A slice''s rank within its horizon, 1 first. Slices only.';
comment on column knowledge.records.plan is
  'A version''s plan: {"outcomes": [..], "appetite": "..", "includes": [slice ids], "leaves_out": [{"slice", "reason", "condition"?, "outcomes_then"}]}. Changed only through knowledge.replan.';
comment on column knowledge.records.due_on is 'A version''s date, if it has one. No feature or slice carries a date.';

-- ---------------------------------------------------------------------------
-- What a plan must hold. Returns the first problem, or null.

create function knowledge._plan_problem(p jsonb) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  s text;
  x jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return 'a plan is {outcomes, appetite, includes, leaves_out}';
  end if;
  if exists (select 1 from jsonb_object_keys(p) k where k not in ('outcomes', 'appetite', 'includes', 'leaves_out')) then
    return 'a plan holds only outcomes, appetite, includes and leaves_out';
  end if;
  if jsonb_typeof(p->'outcomes') is distinct from 'array' or jsonb_array_length(p->'outcomes') = 0
     or exists (select 1 from jsonb_array_elements(p->'outcomes') o where jsonb_typeof(o) <> 'string' or btrim(o #>> '{}') = '') then
    return 'a plan names at least one outcome, each in words';
  end if;
  if jsonb_typeof(p->'appetite') is distinct from 'string' or btrim(p->>'appetite') = '' then
    return 'a plan has an appetite: how much it is worth, in words';
  end if;
  if jsonb_typeof(coalesce(p->'includes', '[]')) <> 'array' or jsonb_typeof(coalesce(p->'leaves_out', '[]')) <> 'array' then
    return 'includes and leaves_out are lists';
  end if;
  for s in select jsonb_array_elements_text(coalesce(p->'includes', '[]')) loop
    if not exists (select 1 from knowledge.records r where r.id = s and r.kind = 'slice') then
      return format('%s is not a slice', s);
    end if;
  end loop;
  for x in select jsonb_array_elements(coalesce(p->'leaves_out', '[]')) loop
    if jsonb_typeof(x) <> 'object'
       or exists (select 1 from jsonb_object_keys(x) k where k not in ('slice', 'reason', 'condition', 'outcomes_then')) then
      return 'a leave-out is {slice, reason, condition}';
    end if;
    if not exists (select 1 from knowledge.records r where r.id = x->>'slice' and r.kind = 'slice') then
      return format('%s is not a slice', coalesce(x->>'slice', 'a leave-out with no slice'));
    end if;
    if coalesce(btrim(x->>'reason'), '') = '' then
      return format('leaving out %s needs a reason', x->>'slice');
    end if;
    if x ? 'condition' and jsonb_typeof(x->'condition') <> 'null'
       and not exists (select 1 from knowledge.records r where r.id = x->>'condition' and r.kind = 'condition') then
      return format('%s is not a condition', x->>'condition');
    end if;
  end loop;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p->'includes', '[]')) i
              group by i having count(*) > 1)
     or exists (select 1 from jsonb_array_elements(coalesce(p->'leaves_out', '[]')) lo
                 group by lo->>'slice' having count(*) > 1) then
    return 'a slice is named once in a plan';
  end if;
  if exists (select 1 from jsonb_array_elements_text(coalesce(p->'includes', '[]')) i
               join jsonb_array_elements(coalesce(p->'leaves_out', '[]')) lo on lo->>'slice' = i) then
    return 'a slice is either included or left out, not both';
  end if;
  return null;
end $$;

-- The outcomes of a plan, as a sorted set, for comparing.
create function knowledge._outcomes(p jsonb) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array(select distinct btrim(o) from jsonb_array_elements_text(coalesce(p->'outcomes', '[]')) o order by 1), '{}')
$$;

-- ---------------------------------------------------------------------------
-- The rules on records, for slices and versions.

create function knowledge._plans_before() returns trigger
language plpgsql set search_path = '' as $$
declare
  problem text;
begin
  if new.kind = 'slice' then
    if new.horizon is null or new.rank is null then
      raise exception 'A slice has a horizon (now, next or later) and a rank: record it through knowledge.add_slice.'
        using errcode = 'check_violation';
    end if;
  elsif new.horizon is not null or new.rank is not null then
    raise exception 'Only a slice has a horizon and a rank; % is a %.', new.id, new.kind using errcode = 'check_violation';
  end if;
  if new.due_on is not null and new.kind <> 'version' then
    raise exception 'No % carries a date: only a version may (%).', new.kind, new.id using errcode = 'check_violation';
  end if;
  if new.kind in ('feature', 'slice') and new.until is not null then
    raise exception 'No % carries a date: only a version may (%).', new.kind, new.id using errcode = 'check_violation';
  end if;
  if new.kind = 'version' then
    problem := knowledge._plan_problem(new.plan);
    if problem is not null then
      raise exception 'A version is a plan: %.', problem using errcode = 'check_violation';
    end if;
    if (case when tg_op = 'INSERT' then true else new.plan is distinct from old.plan end)
       and coalesce(current_setting('knowledge.replanning', true), '') <> 'on' then
      raise exception 'A plan changes only through knowledge.replan, with the outcome that changed: never an edit.'
        using errcode = 'check_violation';
    end if;
  elsif new.plan is not null then
    raise exception 'Only a version has a plan; % is a %.', new.id, new.kind using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger records_plans before insert or update on knowledge.records
  for each row execute function knowledge._plans_before();

-- A slice belongs to one feature, for good: slice_of runs from a slice to a
-- feature, once per slice, and only an operator writes it.
create function knowledge._plan_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type <> 'slice_of' then
    return new;
  end if;
  if not knowledge.is_operator() then
    raise exception 'Only an operator says which feature a slice belongs to: a link is never removed.'
      using errcode = 'insufficient_privilege';
  end if;
  if (select kind from knowledge.records where id = new.from_id) is distinct from 'slice'
     or (select kind from knowledge.records where id = new.to_id) is distinct from 'feature' then
    raise exception 'A slice is a slice_of a feature: % to %.', new.from_id, new.to_id using errcode = 'check_violation';
  end if;
  if exists (select 1 from knowledge.links l where l.from_id = new.from_id and l.type = 'slice_of' and l.to_id <> new.to_id) then
    raise exception '% already belongs to another feature.', new.from_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger links_plans before insert on knowledge.links
  for each row execute function knowledge._plan_links();

-- ---------------------------------------------------------------------------
-- Writes. Operators only: a plan is the PM's.

create function knowledge._plan_writer() returns knowledge.agents
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not w.operator then
    raise exception 'Only an operator changes the plan: what is in a version is the PM''s.'
      using errcode = 'insufficient_privilege';
  end if;
  return w;
end $$;

create function knowledge.add_slice(p_feature text, p_answer text, p_horizon text, p_rank integer, p_reason text,
                                    p_waits_on text[] default '{}', p_status text default 'planned',
                                    p_id text default null, p_evidence jsonb default null,
                                    p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._plan_writer();
  f knowledge.records;
  the_id text;
  n integer;
  c text;
begin
  select * into f from knowledge.records where id = p_feature;
  if f.id is null or f.kind <> 'feature' then
    raise exception 'No feature %.', p_feature using errcode = 'no_data_found';
  end if;
  if p_id is null then
    select coalesce(max(substring(r.id from '-S(\d+)$')::integer), 0) + 1 into n
      from knowledge.records r where r.kind = 'slice' and r.id like p_feature || '-S%';
    the_id := p_feature || '-S' || n;
  else
    the_id := p_id;
  end if;
  -- F126: parked work is never marked building, here as in revise().
  if p_status = 'building' and exists (
       select 1 from unnest(coalesce(p_waits_on, '{}')) cw
        where coalesce(knowledge.condition_status(cw), '') not in ('met', 'withdrawn')) then
    raise exception 'A slice that waits on an unmet condition is not started as building.' using errcode = 'check_violation';
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  insert into knowledge.records (id, kind, concern, answer, status, audience, departments, decided_by, decided_through,
                                 decided_on, source, horizon, rank)
  values (the_id, 'slice', f.concern, p_answer, p_status, f.audience, f.departments, w.person, w.name,
          coalesce(p_effective, now())::date, f.source, p_horizon, p_rank);
  insert into knowledge.links (from_id, to_id, type, reason, person, agent)
  values (the_id, p_feature, 'slice_of', 'A slice of its feature.', w.person, w.name);
  foreach c in array coalesce(p_waits_on, '{}') loop
    if not exists (select 1 from knowledge.records r where r.id = c and r.kind = 'condition') then
      raise exception '% is not a condition.', c using errcode = 'check_violation';
    end if;
    insert into knowledge.links (from_id, to_id, type, reason, person, agent)
    values (the_id, c, 'starts_when', 'The slice waits on it.', w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
  end loop;
  return the_id;
end $$;
comment on function knowledge.add_slice(text, text, text, integer, text, text[], text, text, jsonb, timestamptz) is
  'Records a slice of a feature with its horizon, rank and the conditions it waits on. Operators only. Its id is the feature''s plus -S and the next number, unless given.';

create function knowledge.move_slice(p_id text, p_horizon text, p_rank integer, p_reason text,
                                     p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._plan_writer();
  v integer;
begin
  if not exists (select 1 from knowledge.records r where r.id = p_id and r.kind = 'slice') then
    raise exception 'No slice %.', p_id using errcode = 'no_data_found';
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  update knowledge.records set horizon = p_horizon, rank = p_rank
   where id = p_id and (horizon, rank) is distinct from (p_horizon, p_rank)
  returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;
comment on function knowledge.move_slice(text, text, integer, text, jsonb, timestamptz) is
  'Moves a slice to a horizon and rank, with a reason; a new version of the slice. Operators only; no change, no version.';

-- Stamps each leave-out with the outcomes it was decided under: a leave-out
-- carried over unchanged (same slice, same reason) keeps its stamp; a new one,
-- or one with a new reason, is re-decided now. The caller never sets it.
create function knowledge._stamp(p_new jsonb, p_old jsonb) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'outcomes', p_new->'outcomes',
    'appetite', p_new->'appetite',
    'includes', coalesce(p_new->'includes', '[]'),
    'leaves_out', coalesce((
      select jsonb_agg(
               (x - 'outcomes_then' - 'condition')
               || case when jsonb_typeof(x->'condition') = 'string' then jsonb_build_object('condition', x->'condition') else '{}' end
               || jsonb_build_object('outcomes_then', coalesce(
                    (select o->'outcomes_then'
                       from jsonb_array_elements(coalesce(p_old->'leaves_out', '[]')) o
                      where o->>'slice' = x->>'slice' and btrim(o->>'reason') = btrim(x->>'reason')),
                    to_jsonb(knowledge._outcomes(p_new))))
               order by ord)
        from jsonb_array_elements(coalesce(p_new->'leaves_out', '[]')) with ordinality as t(x, ord)), '[]'))
$$;

-- A new plan does not include a withdrawn slice. Checked when a plan is
-- written, not by the trigger, so a slice withdrawn later never blocks a
-- change to its version's status.
create function knowledge._withdrawn_included(p jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(r.id, ', ' order by r.id)
    from jsonb_array_elements_text(coalesce(p->'includes', '[]')) i
    join knowledge.records r on r.id = i and r.status = 'withdrawn'
$$;

create function knowledge.plan_version(p jsonb, p_reason text, p_evidence jsonb default null,
                                       p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._plan_writer();
  the_id text;
  problem text;
begin
  if exists (select 1 from jsonb_object_keys(p) k
              where k not in ('id', 'answer', 'why', 'status', 'concern', 'due_on', 'outcomes', 'appetite', 'includes', 'leaves_out')) then
    raise exception 'A version takes id, answer, why, status, concern, due_on, outcomes, appetite, includes and leaves_out.'
      using errcode = 'undefined_column';
  end if;
  problem := knowledge._plan_problem(p - 'id' - 'answer' - 'why' - 'status' - 'concern' - 'due_on');
  if problem is not null then
    raise exception 'A version is a plan: %.', problem using errcode = 'check_violation';
  end if;
  if knowledge._withdrawn_included(p) is not null then
    raise exception 'A plan does not include a withdrawn slice: %.', knowledge._withdrawn_included(p) using errcode = 'check_violation';
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  the_id := coalesce(p->>'id', knowledge._next_id('version'));
  perform set_config('knowledge.replanning', 'on', true);
  insert into knowledge.records (id, kind, concern, answer, why, status, audience, departments, decided_by, decided_through,
                                 decided_on, plan, due_on)
  values (the_id, 'version', p->>'concern', p->>'answer', p->>'why', coalesce(p->>'status', 'planned'),
          'department', '{building}', w.person, w.name, coalesce(p_effective, now())::date,
          knowledge._stamp(p, null), (p->>'due_on')::date);
  perform set_config('knowledge.replanning', '', true);
  return the_id;
end $$;
comment on function knowledge.plan_version(jsonb, text, jsonb, timestamptz) is
  'Records a version: its name (answer), why, outcomes, appetite, the slices it includes and those it leaves out with a reason and the condition that brings each back. Operators only.';

create function knowledge.replan(p_version text, p_plan jsonb, p_why text, p_outcome text,
                                 p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._plan_writer();
  r knowledge.records;
  problem text := knowledge._plan_problem(p_plan);
  next_plan jsonb;
  v integer;
begin
  select * into r from knowledge.records where id = p_version and kind = 'version' for update;
  if r.id is null then
    raise exception 'No version %.', p_version using errcode = 'no_data_found';
  end if;
  if problem is not null then
    raise exception 'A version is a plan: %.', problem using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_why), '') = '' then
    raise exception 'A change of plan gives its why.' using errcode = 'check_violation';
  end if;
  if knowledge._withdrawn_included(p_plan) is not null then
    raise exception 'A plan does not include a withdrawn slice: %.', knowledge._withdrawn_included(p_plan) using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_outcome), '') = ''
     or not (btrim(p_outcome) = any (knowledge._outcomes(r.plan) || knowledge._outcomes(p_plan))) then
    raise exception 'A change of plan names the outcome that changed, one of: %.',
      array_to_string(knowledge._outcomes(r.plan) || knowledge._outcomes(p_plan), '; ')
      using errcode = 'check_violation';
  end if;
  next_plan := knowledge._stamp(p_plan, r.plan);
  if next_plan = r.plan then
    raise exception 'That is the plan as it stands; nothing changed.' using errcode = 'check_violation';
  end if;
  perform knowledge._context(w, p_why,
    coalesce(p_evidence, '{}'::jsonb) || jsonb_build_object('outcome', btrim(p_outcome)), p_effective);
  perform set_config('knowledge.replanning', 'on', true);
  update knowledge.records set plan = next_plan where id = p_version returning version into v;
  perform set_config('knowledge.replanning', '', true);
  return jsonb_build_object('id', p_version, 'version', v);
end $$;
comment on function knowledge.replan(text, jsonb, text, text, jsonb, timestamptz) is
  'The one way a plan changes: the whole new plan, a why, and the outcome that changed (one from the old or new plan). A new version of the record; the earlier plan stays readable. Operators only.';

-- ---------------------------------------------------------------------------
-- Reads. Security invoker: row-level security decides what each key sees.

-- A slice's words, feature and status, for a plan's lines.
-- A slice's words, feature and status as they read at a given time, for a
-- plan's lines: a plan read as of a past day shows its slices as they were.
create function knowledge._slice_line(p_id text, p_at timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('slice', h.record_id, 'answer', h.snapshot->>'answer', 'status', h.snapshot->>'status',
                            'horizon', h.snapshot->>'horizon', 'rank', (h.snapshot->>'rank')::integer,
                            'feature', l.to_id, 'feature_answer', f.answer)
    from knowledge.history h
    left join knowledge.links l on l.from_id = h.record_id and l.type = 'slice_of'
    left join knowledge.records f on f.id = l.to_id
   where h.record_id = p_id and h.valid_from <= p_at and (h.valid_to is null or h.valid_to > p_at)
$$;

create function knowledge.plan_as_of(p_version text, p_at timestamptz default now()) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', h.record_id, 'name', h.snapshot->>'answer', 'status', h.snapshot->>'status', 'why', h.snapshot->>'why',
    'due_on', h.snapshot->'due_on', 'version', h.version, 'since', h.valid_from, 'because', h.reason,
    'outcome', h.evidence->>'outcome',
    'outcomes', h.snapshot->'plan'->'outcomes', 'appetite', h.snapshot->'plan'->'appetite',
    'includes', coalesce((select jsonb_agg(coalesce(knowledge._slice_line(i, p_at), jsonb_build_object('slice', i)) order by ord)
                            from jsonb_array_elements_text(h.snapshot->'plan'->'includes') with ordinality t(i, ord)), '[]'),
    'leaves_out', coalesce((select jsonb_agg(coalesce(knowledge._slice_line(x->>'slice', p_at), jsonb_build_object('slice', x->>'slice'))
                                             || jsonb_build_object('reason', x->>'reason', 'condition', x->>'condition',
                                                                   'condition_status', knowledge.condition_status(x->>'condition'))
                                             order by ord)
                              from jsonb_array_elements(h.snapshot->'plan'->'leaves_out') with ordinality t(x, ord)), '[]'))
    from knowledge.history h
   where h.record_id = p_version and h.snapshot->>'kind' = 'version'
     and h.valid_from <= p_at and (h.valid_to is null or h.valid_to > p_at)
$$;
comment on function knowledge.plan_as_of(text, timestamptz) is
  'One call: what a version held at a given time (now by default): outcomes, appetite, each included slice, each left-out slice with its reason and condition, and the why of that plan.';

create function knowledge.plan_changes(p_from timestamptz, p_to timestamptz, p_version text default null)
returns table (version_id text, name text, version integer, at timestamptz, why text, outcome text, person text,
               outcomes_before jsonb, outcomes_after jsonb, appetite_before text, appetite_after text,
               included text[], dropped text[], left_out text[], brought_back text[])
language sql stable set search_path = '' as $$
  with h as (
    select h.*, prev.snapshot->'plan' as before, h.snapshot->'plan' as after
      from knowledge.history h
      left join knowledge.history prev on prev.record_id = h.record_id and prev.version = h.version - 1
     where h.snapshot->>'kind' = 'version'
       and (p_version is null or h.record_id = p_version)
       and h.valid_from > p_from and h.valid_from <= p_to
       and (prev.record_id is null or prev.snapshot->'plan' is distinct from h.snapshot->'plan')
  )
  select h.record_id, h.snapshot->>'answer', h.version, h.valid_from, h.reason, h.evidence->>'outcome', h.person,
         h.before->'outcomes', h.after->'outcomes', h.before->>'appetite', h.after->>'appetite',
         array(select i from jsonb_array_elements_text(h.after->'includes') i
                except select i from jsonb_array_elements_text(coalesce(h.before->'includes', '[]')) i order by 1),
         array(select i from jsonb_array_elements_text(coalesce(h.before->'includes', '[]')) i
                except select i from jsonb_array_elements_text(h.after->'includes') i order by 1),
         array(select x->>'slice' from jsonb_array_elements(h.after->'leaves_out') x
                except select x->>'slice' from jsonb_array_elements(coalesce(h.before->'leaves_out', '[]')) x order by 1),
         array(select x->>'slice' from jsonb_array_elements(coalesce(h.before->'leaves_out', '[]')) x
                except select x->>'slice' from jsonb_array_elements(h.after->'leaves_out') x order by 1)
    from h
   order by h.valid_from, h.record_id, h.version
$$;
comment on function knowledge.plan_changes(timestamptz, timestamptz, text) is
  'One call: every change of plan after one time and up to another, for one version or all, each with its why, the outcome that changed, the outcomes and appetite before and after, and the slices included, dropped, left out and no longer left out.';

create function knowledge.left_out_due(p_version text default null)
returns table (version_id text, version_name text, slice text, answer text, reason text, condition text, due text)
language sql stable set search_path = '' as $$
  select v.id, v.answer, x->>'slice', s.answer, x->>'reason', x->>'condition',
         case
           when knowledge.condition_status(x->>'condition') = 'met'
             then format('its condition %s is met', x->>'condition')
           when knowledge.condition_status(x->>'condition') = 'withdrawn'
             then format('its condition %s was withdrawn, so nothing brings it back on its own', x->>'condition')
           else format('the outcomes changed since it was left out: then %s, now %s',
                       array_to_string(array(select jsonb_array_elements_text(x->'outcomes_then')), '; '),
                       array_to_string(knowledge._outcomes(v.plan), '; '))
         end
    from knowledge.records v
    cross join lateral jsonb_array_elements(v.plan->'leaves_out') x
    left join knowledge.records s on s.id = x->>'slice'
   where v.kind = 'version' and v.status in ('planned', 'current')
     and (p_version is null or v.id = p_version)
     and coalesce(s.status, '') not in ('shipped', 'withdrawn')
     and (knowledge.condition_status(x->>'condition') in ('met', 'withdrawn')
          or array(select jsonb_array_elements_text(x->'outcomes_then') o order by 1) <> knowledge._outcomes(v.plan))
   order by v.id, x->>'slice'
$$;
comment on function knowledge.left_out_due(text) is
  'Left out is not forgotten: every slice a planned or current version leaves out whose condition is now met or withdrawn, or whose version''s outcomes are no longer the ones it was left out under.';

create function knowledge.roadmap()
returns table (horizon text, rank integer, slice text, answer text, status text, feature text, feature_answer text,
               waits_on text[])
language sql stable set search_path = '' as $$
  select s.horizon, s.rank, s.id, s.answer, s.status, l.to_id, f.answer,
         array(select w.to_id from knowledge.links w
                where w.from_id = s.id and w.type = 'starts_when'
                  and coalesce(knowledge.condition_status(w.to_id), '') not in ('met', 'withdrawn') order by 1)
    from knowledge.records s
    left join knowledge.links l on l.from_id = s.id and l.type = 'slice_of'
    left join knowledge.records f on f.id = l.to_id
   where s.kind = 'slice' and s.status in ('planned', 'building')
   order by array_position(array['now', 'next', 'later'], s.horizon), s.rank, s.id
$$;
comment on function knowledge.roadmap() is
  'Now / Next / Later: every slice not shipped or withdrawn, by horizon and rank, with its feature and the unmet conditions it waits on.';

-- ---------------------------------------------------------------------------
-- Grants. Reads and writes only through the functions; the columns ride on
-- records, which the store's login already reads under row-level security.

revoke all on function
  knowledge._plans_before(), knowledge._plan_links(), knowledge._withdrawn_included(jsonb),
  knowledge._plan_problem(jsonb), knowledge._outcomes(jsonb), knowledge._plan_writer(),
  knowledge._stamp(jsonb, jsonb), knowledge._slice_line(text, timestamptz),
  knowledge.add_slice(text, text, text, integer, text, text[], text, text, jsonb, timestamptz),
  knowledge.move_slice(text, text, integer, text, jsonb, timestamptz),
  knowledge.plan_version(jsonb, text, jsonb, timestamptz),
  knowledge.replan(text, jsonb, text, text, jsonb, timestamptz),
  knowledge.plan_as_of(text, timestamptz),
  knowledge.plan_changes(timestamptz, timestamptz, text),
  knowledge.left_out_due(text),
  knowledge.roadmap()
  from public, anon, authenticated, service_role;

grant execute on function
  knowledge._outcomes(jsonb), knowledge._slice_line(text, timestamptz),
  knowledge.add_slice(text, text, text, integer, text, text[], text, text, jsonb, timestamptz),
  knowledge.move_slice(text, text, integer, text, jsonb, timestamptz),
  knowledge.plan_version(jsonb, text, jsonb, timestamptz),
  knowledge.replan(text, jsonb, text, text, jsonb, timestamptz),
  knowledge.plan_as_of(text, timestamptz),
  knowledge.plan_changes(timestamptz, timestamptz, text),
  knowledge.left_out_due(text),
  knowledge.roadmap()
  to knowledge_store;
