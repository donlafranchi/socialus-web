-- F128 (#1237): how we work lives in the store, so any method can be checked
-- against it quickly. Stage 3 of the F125 store.
--
-- Scenario: socialus-plan planning/scenario-F128.md (approved 2026-11-10).
-- Architecture note: the first comment on #1237.
-- Tests: supabase/tests/knowledge_practices.sql, run by
-- tests/knowledge-practices-db.test.ts. The loader is
-- scripts/knowledge/practices.ts, called by the import; the drift step is
-- scripts/knowledge/practice-drift.ts (weekly, knowledge-drift.yml); the pack
-- writer is scripts/knowledge/pack.ts (knowledge-pack.yml).
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · `practice`, a new kind: one rule of how we work, scope process, with
--     its why, how strict it is, the check that enforces it (`enforced_by`,
--     entries "repo:path (what)") and a ring. Statuses proposed, live,
--     retired. `as_of` is the day it was last confirmed.
--   · `ring` on a record: adopt, trial, assess or hold, the Thoughtworks
--     Technology Radar's rings. Every practice has one; nothing else does.
--     It moves only through revise, by an operator, with a reason, so each
--     move is a new version with its why.
--   · `experiment`, a new kind: a change to a practice being tried. Its
--     status is its verdict (running, then keep, fix or revert); its terms
--     (the practice it changes, the baseline, the measure, the verdict date)
--     sit in knowledge.experiment_terms, written once and never moved.
--   · `changes`, a new link type, from an experiment to its practice.
--   · A department, how-we-work, and one concern per area of the work.
--   · knowledge.area_words: the words that point at an area ("devops" points
--     at building, reviewing and shipping). A new word is a new row.
--   · knowledge.how: the live practices for a question or an area, strictest
--     first. knowledge.practice_upkeep: practices not confirmed in 90 days and
--     experiments past their verdict date. knowledge.confirm: an operator
--     marks a practice confirmed today.
--
-- record() and revise() are replaced whole (same signatures) to take `ring`;
-- every other line of them is as F126 (#1223) left it. Marked "F128" where
-- changed. No app table changes. Nothing in the app reads the schema.

-- ---------------------------------------------------------------------------
-- Kinds, link type, department and areas: rows, as #1217 designed for.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('practice',   '{proposed,live,retired}',     true,  'PR'),
  ('experiment', '{running,keep,fix,revert}',   false, 'EX');

insert into knowledge.link_types (slug) values ('changes');

comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains; for conditions part_of, starts_when, ends_when; for concepts split_from, merged_into, became, scopes; for plans slice_of; for experiments changes. Marked stated, or inferred when an import guessed it.';

insert into knowledge.departments (slug, name) values ('how-we-work', 'How we work');

insert into knowledge.concerns (slug, name, department) values
  ('how-deciding',  'How we decide',             'how-we-work'),
  ('how-planning',  'How we plan',               'how-we-work'),
  ('how-building',  'How we build',              'how-we-work'),
  ('how-reviewing', 'How we review',             'how-we-work'),
  ('how-shipping',  'How we ship',               'how-we-work'),
  ('how-words',     'How we write',              'how-we-work'),
  ('how-agents',    'How the agents run',        'how-we-work'),
  ('how-docs',      'How we keep docs',          'how-we-work');

create table knowledge.area_words (
  word    text not null check (word ~ '^[a-z][a-z-]*$'),
  concern text not null references knowledge.concerns (slug),
  primary key (word, concern)
);
comment on table knowledge.area_words is
  'Words that point a question at an area of how we work. One word may point at several areas ("devops"). A new word is a new row.';

insert into knowledge.area_words (word, concern) values
  ('deciding', 'how-deciding'), ('decide', 'how-deciding'), ('decision', 'how-deciding'), ('decisions', 'how-deciding'),
  ('rulings', 'how-deciding'), ('ruling', 'how-deciding'),
  ('planning', 'how-planning'), ('plan', 'how-planning'), ('scenario', 'how-planning'), ('scenarios', 'how-planning'),
  ('tickets', 'how-planning'), ('ticket', 'how-planning'), ('scope', 'how-planning'),
  ('building', 'how-building'), ('build', 'how-building'), ('code', 'how-building'), ('coding', 'how-building'),
  ('tests', 'how-building'), ('testing', 'how-building'), ('devops', 'how-building'),
  ('reviewing', 'how-reviewing'), ('review', 'how-reviewing'), ('reviews', 'how-reviewing'), ('devops', 'how-reviewing'),
  ('shipping', 'how-shipping'), ('ship', 'how-shipping'), ('deploy', 'how-shipping'), ('deploys', 'how-shipping'),
  ('release', 'how-shipping'), ('merge', 'how-shipping'), ('migrations', 'how-shipping'), ('ci', 'how-shipping'),
  ('devops', 'how-shipping'),
  ('words', 'how-words'), ('writing', 'how-words'), ('voice', 'how-words'), ('wording', 'how-words'),
  ('agents', 'how-agents'), ('agent', 'how-agents'), ('loop', 'how-agents'), ('sessions', 'how-agents'),
  ('session', 'how-agents'),
  ('docs', 'how-docs'), ('doc', 'how-docs'), ('documents', 'how-docs'), ('documentation', 'how-docs');

-- ---------------------------------------------------------------------------
-- The ring.

alter table knowledge.records add column ring text check (ring in ('adopt', 'trial', 'assess', 'hold'));
comment on column knowledge.records.ring is
  'A practice''s ring, as the Thoughtworks Technology Radar uses them: adopt, trial, assess, hold. Every practice has one; no other kind does. It moves through revise, with a reason: a new version with its why.';

-- A practice is scope process and has a ring; nothing else has a ring; an
-- experiment is scope process too.
create function knowledge._practices_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'practice' and new.ring is null then
    raise exception 'A practice has a ring: adopt, trial, assess or hold.' using errcode = 'check_violation';
  end if;
  if new.kind <> 'practice' and new.ring is not null then
    raise exception 'Only a practice has a ring; a % does not.', new.kind using errcode = 'check_violation';
  end if;
  if new.kind in ('practice', 'experiment') and new.scope is distinct from 'process' then
    raise exception 'A % is scope process.', new.kind using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger records_practices before insert or update on knowledge.records
  for each row execute function knowledge._practices_before();

-- ---------------------------------------------------------------------------
-- An experiment's terms: written once, never moved.

create table knowledge.experiment_terms (
  experiment_id text primary key references knowledge.records (id),
  practice_id   text not null references knowledge.records (id),
  baseline      text not null check (btrim(baseline) <> ''),
  measure       text not null check (btrim(measure) <> ''),
  verdict_on    date not null,
  person        text not null,
  agent         text not null,
  recorded_at   timestamptz not null default clock_timestamp()
);
comment on table knowledge.experiment_terms is
  'What an experiment changes and how it is judged: the practice, the baseline, the measure and the verdict date. Written once: terms that move after the start are not an experiment.';

create trigger experiment_terms_append_only before update or delete on knowledge.experiment_terms
  for each row execute function knowledge._append_only();
create trigger experiment_terms_no_truncate before truncate on knowledge.experiment_terms
  for each statement execute function knowledge._append_only();

create function knowledge.set_experiment_terms(p_experiment text, p_practice text, p_baseline text, p_measure text,
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
  if not w.operator and e.decided_by is distinct from w.person then
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
comment on function knowledge.set_experiment_terms(text, text, text, text, date) is
  'Sets an experiment''s terms once: the practice it changes (and the changes link), its baseline, its measure and its verdict date. The same terms again change nothing; different ones are refused.';

-- `changes` runs from an experiment to the practice its terms name, and
-- nothing else: set_experiment_terms writes the terms first, then the link.
create function knowledge._changes_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type <> 'changes' then
    return new;
  end if;
  if not exists (select 1 from knowledge.experiment_terms t
                  where t.experiment_id = new.from_id and t.practice_id = new.to_id) then
    raise exception 'A changes link runs from an experiment to the practice its terms name; set it with knowledge.set_experiment_terms.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger links_changes before insert on knowledge.links
  for each row execute function knowledge._changes_link();

-- ---------------------------------------------------------------------------
-- Confirming a practice: the monthly upkeep reads how long since.

create function knowledge.confirm(p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  v integer;
begin
  if not w.operator then
    raise exception 'Only an operator confirms a practice.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  update knowledge.records set as_of = current_date where id = p_id and kind = 'practice' returning version into v;
  if not found then
    raise exception 'No practice %.', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'version', v, 'confirmed_on', current_date);
end $$;
comment on function knowledge.confirm(text, text) is 'An operator marks a practice confirmed today, with a reason: a new version.';

-- ---------------------------------------------------------------------------
-- Reads. Security invoker: row-level security decides what each key sees.

-- The areas a question points at: by its words, or by an area's own name.
create function knowledge.areas_for(p_question text) returns text[]
language sql stable set search_path = '' as $$
  select coalesce(array_agg(distinct c order by c), '{}')
    from (
      select a.concern as c
        from knowledge.area_words a
       where a.word = any (regexp_split_to_array(lower(coalesce(p_question, '')), '[^a-z-]+'))
      union
      select c.slug
        from knowledge.concerns c
       where c.department = 'how-we-work'
         and (c.slug = lower(btrim(p_question)) or c.slug = 'how-' || lower(btrim(p_question)))
    ) x
$$;
comment on function knowledge.areas_for(text) is 'The how-we-work areas a question points at, by knowledge.area_words or by an area''s own name.';

create function knowledge.how(p_question text)
returns table (concern text, id text, answer text, why text, strength text, ring text, holds text,
               enforced_by text, applies text[])
language sql stable set search_path = '' as $$
  select r.concern, r.id, r.answer, r.why, r.strength, r.ring, r.holds, r.enforced_by,
         array(select l.to_id from knowledge.links l
                 join knowledge.records p on p.id = l.to_id
                where l.from_id = r.id and l.type = 'applies' order by l.to_id)
    from knowledge.records r
   where r.kind = 'practice' and r.status = 'live'
     and r.id <> 'practice.review-a-method'  -- the steps, not a line: the review_method verb returns them
     and r.concern = any (knowledge.areas_for(p_question))
   order by r.concern,
            array_position(array['absolute','rule','guideline'], r.strength),
            array_position(array['adopt','trial','assess','hold'], r.ring),
            r.id
$$;
comment on function knowledge.how(text) is
  'How something runs: the live practices for the areas a question points at ("how does our DevOps work", "review", "the agent loop"), strictest first, each with its ring, enforcing check and the philosophies it applies.';

create function knowledge.practice_upkeep(p_today date default current_date)
returns table (id text, kind text, answer text, problem text, since date)
language sql stable set search_path = '' as $$
  select r.id, r.kind, r.answer,
         format('not confirmed since %s', coalesce(r.as_of, r.decided_on)),
         coalesce(r.as_of, r.decided_on)
    from knowledge.records r
   where r.kind = 'practice' and r.status = 'live'
     and coalesce(r.as_of, r.decided_on, '-infinity'::date) < p_today - 90
  union all
  select r.id, r.kind, r.answer,
         format('verdict was due %s and is still %s', t.verdict_on, r.status),
         t.verdict_on
    from knowledge.records r
    join knowledge.experiment_terms t on t.experiment_id = r.id
   where r.kind = 'experiment' and r.status = 'running' and t.verdict_on < p_today
  union all
  select r.id, r.kind, r.answer, 'has no verdict date set', r.decided_on
    from knowledge.records r
   where r.kind = 'experiment' and r.status = 'running'
     and not exists (select 1 from knowledge.experiment_terms t where t.experiment_id = r.id)
   order by 2, 5, 1
$$;
comment on function knowledge.practice_upkeep(date) is
  'For the monthly upkeep: live practices not confirmed in 90 days, and running experiments past their verdict date or with none set.';

-- ---------------------------------------------------------------------------
-- record() and revise(), replaced whole: they take ring. Marked "F128" where
-- changed; every other line is as F126 left it.

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

create or replace function knowledge.revise(p_id text, p_changes jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
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
  if not w.operator then
    -- F126: only an operator writes a check, which the scheduled job runs.
    if p_changes ? 'checked_by' then
      raise exception 'Only an operator writes a condition''s check: the scheduled job runs it.'
        using errcode = 'insufficient_privilege';
    end if;
    perform knowledge._own_call(w, r);
    if p_changes ?| array['strength', 'path', 'audience', 'departments', 'ring'] then  -- F128: ring
      raise exception 'Only an operator changes how strict a record is, its ring, its path, or who may read it.'
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
                    else checked_by end,
    ring        = case when p_changes ? 'ring'        then p_changes->>'ring'        else ring end  -- F128
  where id = p_id
  returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;

-- ---------------------------------------------------------------------------
-- Access: read like the rest of the store, write only through the functions.

alter table knowledge.area_words       enable row level security;
alter table knowledge.experiment_terms enable row level security;
create policy area_words_readable on knowledge.area_words for select to knowledge_store using (true);
create policy experiment_terms_of_visible_experiments on knowledge.experiment_terms for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = experiment_id));

revoke all on knowledge.area_words, knowledge.experiment_terms from public, anon, authenticated, service_role;
revoke all on function
  knowledge._practices_before(), knowledge._changes_link(),
  knowledge.set_experiment_terms(text, text, text, text, date),
  knowledge.confirm(text, text),
  knowledge.areas_for(text), knowledge.how(text), knowledge.practice_upkeep(date)
  from public, anon, authenticated, service_role;

grant select on knowledge.area_words, knowledge.experiment_terms to knowledge_store;
grant execute on function
  knowledge.set_experiment_terms(text, text, text, text, date),
  knowledge.confirm(text, text),
  knowledge.areas_for(text), knowledge.how(text), knowledge.practice_upkeep(date)
  to knowledge_store;
