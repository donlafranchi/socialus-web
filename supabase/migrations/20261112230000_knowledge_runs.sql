-- F135 (#1274): each run of a repeated routine keeps a dated record in the
-- store, so "the history of X and what to try next" is one question.
-- Stage 6 of the F125 store, on F128's practices.
--
-- Scenario: socialus-plan planning/scenario-F135.md (approved 2026-11-12).
-- Architecture note: the body of #1274.
-- Tests: supabase/tests/knowledge_runs.sql, run by tests/knowledge-runs-db.test.ts.
-- The writer is scripts/knowledge/runs.ts: the Load simulation workflow calls
-- it when a run ends (load.yml), knowledge-run-links.yml calls it when a PR
-- merges, and the import loads routines.json and runs-seed.json through it.
-- The lookup verb is `runs` (src/lib/knowledge/runs.ts).
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · `run`, a new kind: one run of a routine. Its status is how it ended,
--     passed or failed. Its terms (practice, date, commit, members simulated,
--     the numbers, what broke first, its own link) sit in knowledge.run_terms,
--     written once and never moved, as an experiment's terms are (F128).
--   · `idea`, a new kind: one thing to try next time. Open, then tried (a
--     later run, after a merged PR that names it) or dropped (the PM, with
--     why). Its status moves only through the functions here.
--   · Link types `run_of` (run to its practice), `suggests` (run to an idea it
--     left) and `tried` (a later run to an idea it tried).
--   · What changed after a run is a `pr` ref on the run (knowledge.refs): the
--     store links to the PR, it does not copy it.
--   · knowledge.routines: which practices are routines, how often each is
--     expected to run, and the workflow that runs it.
--   · Writes, operators only (the workflows, for the PM): record_run,
--     link_pr, set_routine, drop_idea.
--   · Reads: run_history (the one call) and run_upkeep (for the monthly
--     upkeep, beside practice_upkeep).
--
-- No app table changes. Nothing in the app reads the schema.

-- ---------------------------------------------------------------------------
-- Kinds and link types: rows, as #1217 designed for.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('run',  '{passed,failed}',      false, 'RN'),
  ('idea', '{open,tried,dropped}', false, 'ID');

insert into knowledge.link_types (slug) values ('run_of'), ('suggests'), ('tried');

comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains; for conditions part_of, starts_when, ends_when; for concepts split_from, merged_into, became, scopes; for plans slice_of; for experiments changes; for runs run_of, suggests, tried. Marked stated, or inferred when an import guessed it.';

-- ---------------------------------------------------------------------------
-- Which practices are routines.

create table knowledge.routines (
  practice_id text primary key references knowledge.records (id),
  name        text not null check (btrim(name) <> ''),
  every_days  integer not null check (every_days > 0),
  workflow    text,
  set_on      date not null default current_date
);
comment on table knowledge.routines is
  'F135: the practices that are repeated routines, the words that name each (as a question would), how many days may pass between runs before the upkeep lists it, and the workflow that runs it.';

-- ---------------------------------------------------------------------------
-- A run's terms: written once, never moved.

create table knowledge.run_terms (
  run_id      text primary key references knowledge.records (id),
  practice_id text not null references knowledge.records (id),
  run_key     text not null unique check (btrim(run_key) <> ''),
  ran_on      date not null,
  commit      text not null check (commit ~ '^[0-9a-f]{7,40}$'),
  members     integer check (members >= 0),
  numbers     jsonb not null check (jsonb_typeof(numbers) = 'object'),
  broke_first text,
  url         text,
  person      text not null,
  agent       text not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create index run_terms_practice on knowledge.run_terms (practice_id, ran_on);
comment on table knowledge.run_terms is
  'F135: what a run was: its practice, the date, the commit, how many members it simulated, the numbers, what broke first (null when nothing did), and its own link. run_key (the workflow run, say) makes a second write of the same run change nothing. Written once.';

create trigger run_terms_append_only before update or delete on knowledge.run_terms
  for each row execute function knowledge._append_only();
create trigger run_terms_no_truncate before truncate on knowledge.run_terms
  for each statement execute function knowledge._append_only();

-- A run's status is how it ended, and an idea's moves only through the
-- functions below, which set knowledge.run_move for their own statement.
create function knowledge._runs_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind in ('run', 'idea') and new.scope is distinct from 'process' then
    raise exception 'A % is scope process.', new.kind using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and new.kind in ('run', 'idea') and new.status is distinct from old.status
     and coalesce(current_setting('knowledge.run_move', true), '') <> 'on' then
    raise exception 'A run keeps how it ended; an idea is tried by a later run or dropped through knowledge.drop_idea.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger records_runs before insert or update on knowledge.records
  for each row execute function knowledge._runs_before();

-- run_of, suggests and tried are written only here, so each runs between
-- the kinds it names.
create function knowledge._run_links() returns trigger
language plpgsql set search_path = '' as $$
declare
  a text := (select kind from knowledge.records where id = new.from_id);
  b text := (select kind from knowledge.records where id = new.to_id);
begin
  if (new.type = 'run_of' and (a, b) is distinct from ('run', 'practice'))
     or (new.type in ('suggests', 'tried') and (a, b) is distinct from ('run', 'idea')) then
    raise exception 'A % link runs from a run to %.', new.type,
      case new.type when 'run_of' then 'its practice' else 'an idea' end using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger links_runs before insert on knowledge.links
  for each row execute function knowledge._run_links();

-- ---------------------------------------------------------------------------
-- Helpers.

-- The practice a run or idea belongs to: a run's from its terms, an idea's
-- from the first run that suggested it.
create function knowledge._practice_of(p_id text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.practice_id from knowledge.run_terms t where t.run_id = p_id),
    (select t.practice_id
       from knowledge.links l join knowledge.run_terms t on t.run_id = l.from_id
      where l.to_id = p_id and l.type = 'suggests'
      order by t.ran_on, t.recorded_at limit 1))
$$;

-- Ideas are compared by their words: case, spacing and a closing full stop
-- do not make a new idea.
create function knowledge._idea_words(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(lower(btrim(coalesce(p, ''))), '\s+', ' ', 'g'), '[.!]+$', '')
$$;

create function knowledge._move(p_id text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('knowledge.run_move', 'on', true);
  update knowledge.records set status = p_status where id = p_id;
  perform set_config('knowledge.run_move', '', true);
end $$;

-- ---------------------------------------------------------------------------
-- Writes.

create function knowledge.set_routine(p_practice text, p_name text, p_every_days integer, p_workflow text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not w.operator then
    raise exception 'Only an operator names a routine.' using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from knowledge.records where id = p_practice and kind = 'practice') then
    raise exception 'A routine is a practice; % is not one.', p_practice using errcode = 'check_violation';
  end if;
  insert into knowledge.routines (practice_id, name, every_days, workflow)
  values (p_practice, btrim(p_name), p_every_days, p_workflow)
  on conflict (practice_id) do update
    set name = excluded.name, every_days = excluded.every_days, workflow = excluded.workflow
    where (knowledge.routines.name, knowledge.routines.every_days, knowledge.routines.workflow)
          is distinct from (excluded.name, excluded.every_days, excluded.workflow);
  return jsonb_build_object('practice', p_practice, 'every_days', p_every_days);
end $$;
comment on function knowledge.set_routine(text, text, integer, text) is
  'Names a practice as a routine: the words for it, how many days between runs, and the workflow that runs it. Operators only.';

-- One run, written by the routine when it ends. p takes:
--   practice, key, ran_on, commit, members, outcome (passed | failed),
--   summary (the run in a line), numbers (an object), broke_first, url,
--   ideas (an array of words: what to try next time).
-- The same key again changes nothing. Open ideas of the practice that a PR
-- merged since they were suggested has named are marked tried by this run.
create function knowledge.record_run(p jsonb, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  pr knowledge.records;
  allowed text[] := array['practice', 'key', 'ran_on', 'commit', 'members', 'outcome', 'summary', 'numbers',
                          'broke_first', 'url', 'ideas'];
  extra text;
  existing text;
  the_run text;
  ran date := (p->>'ran_on')::date;
  idea text;
  idea_id text;
  added text[] := '{}';
  again text[] := '{}';
  tried text[] := '{}';
begin
  if not w.operator then
    raise exception 'Only an operator records a run: the routine does it for the PM.' using errcode = 'insufficient_privilege';
  end if;
  select string_agg(key, ', ') into extra from jsonb_object_keys(p) key where key <> all (allowed);
  if extra is not null then
    raise exception 'A run has no field %.', extra using errcode = 'undefined_column';
  end if;
  if coalesce(btrim(p->>'key'), '') = '' or ran is null or coalesce(btrim(p->>'summary'), '') = '' then
    raise exception 'A run has a key, a date and a summary.' using errcode = 'not_null_violation';
  end if;
  if p->>'outcome' is null or p->>'outcome' not in ('passed', 'failed') then
    raise exception 'A run ended passed or failed, not %.', coalesce(p->>'outcome', 'neither') using errcode = 'check_violation';
  end if;
  if p ? 'ideas' and jsonb_typeof(p->'ideas') <> 'array' then
    raise exception 'A run''s ideas are a list.' using errcode = 'check_violation';
  end if;

  select t.run_id into existing from knowledge.run_terms t where run_key = p->>'key';
  if existing is not null then
    return jsonb_build_object('id', existing, 'unchanged', true);
  end if;

  select * into pr from knowledge.records where id = p->>'practice';
  if pr.id is null or pr.kind <> 'practice' then
    raise exception 'A run is of a practice; % is not one.', coalesce(p->>'practice', 'nothing') using errcode = 'check_violation';
  end if;

  the_run := knowledge.record(
    jsonb_build_object('kind', 'run', 'concern', pr.concern, 'answer', btrim(p->>'summary'), 'status', p->>'outcome',
                       'scope', 'process', 'audience', pr.audience, 'departments', to_jsonb(pr.departments),
                       'decided_on', ran, 'source', nullif(p->>'url', '')),
    format('A run of %s, recorded by the routine when it ended.', pr.id),
    jsonb_build_object('key', p->>'key', 'commit', p->>'commit'),
    p_effective);
  insert into knowledge.run_terms (run_id, practice_id, run_key, ran_on, commit, members, numbers, broke_first, url,
                                   person, agent)
  values (the_run, pr.id, p->>'key', ran, lower(p->>'commit'), (p->>'members')::integer,
          coalesce(p->'numbers', '{}'::jsonb), nullif(btrim(p->>'broke_first'), ''), nullif(p->>'url', ''),
          w.person, w.name);
  insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
  values (the_run, pr.id, 'run_of', 'stated', 'The practice this run is a run of.', w.person, w.name);

  -- Ideas a merged PR acted on since they were suggested: this run tried them.
  perform knowledge._context(w, format('Tried by %s, after a merged pull request named it.', the_run), null, p_effective);
  for idea_id in
    select i.id
      from knowledge.records i
     where i.kind = 'idea' and i.status = 'open'
       and knowledge._practice_of(i.id) = pr.id
       and exists (select 1 from knowledge.refs f where f.record_id = i.id and f.kind = 'pr')
     order by i.id
  loop
    perform knowledge._move(idea_id, 'tried');
    insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
    values (the_run, idea_id, 'tried', 'stated', 'A pull request merged since it was suggested named it.', w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
    tried := tried || idea_id;
  end loop;

  -- What to try next time: a new idea, or one already open on this practice.
  for idea in select btrim(x) from jsonb_array_elements_text(coalesce(p->'ideas', '[]'::jsonb)) x where btrim(x) <> '' loop
    select i.id into idea_id
      from knowledge.records i
     where i.kind = 'idea' and i.status = 'open'
       and knowledge._idea_words(i.answer) = knowledge._idea_words(idea)
       and knowledge._practice_of(i.id) = pr.id
     order by i.id limit 1;
    if idea_id is null then
      idea_id := knowledge.record(
        jsonb_build_object('kind', 'idea', 'concern', pr.concern, 'answer', idea, 'status', 'open', 'scope', 'process',
                           'audience', pr.audience, 'departments', to_jsonb(pr.departments), 'decided_on', ran),
        format('Left by %s: to try next time.', the_run), null, p_effective);
      added := added || idea_id;
    else
      again := again || idea_id;
    end if;
    insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
    values (the_run, idea_id, 'suggests', 'stated', 'An idea this run left for next time.', w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
    idea_id := null;
  end loop;

  return jsonb_build_object('id', the_run, 'practice', pr.id, 'ideas', to_jsonb(added), 'still_open', to_jsonb(again),
                            'tried', to_jsonb(tried));
end $$;
comment on function knowledge.record_run(jsonb, timestamptz) is
  'Records one run of a routine, as the routine ends: the run, its terms, its ideas (joined to the practice''s open list), and the open ideas a merged PR acted on, marked tried. The same key again changes nothing. Operators only.';

-- A merged PR that names a run (RN-0001), an idea (ID-0001) or a practice
-- (practice.<slug>) is what changed after that run. A practice means its
-- latest run before the merge; an idea means the run that left it, and the
-- idea keeps the PR too, so the next run marks it tried.
create function knowledge.link_pr(p_ref text, p_url text, p_label text, p_merged_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  the_run text;
  linked text[] := '{}';
  target text;
begin
  if not w.operator then
    raise exception 'Only an operator links a pull request to a run: the workflow does it when one merges.'
      using errcode = 'insufficient_privilege';
  end if;
  select * into r from knowledge.records where id = p_ref;
  if r.id is null or r.kind not in ('run', 'idea', 'practice') then
    return jsonb_build_object('ref', p_ref, 'linked', '[]'::jsonb);
  end if;
  the_run := case r.kind
    when 'run' then r.id
    when 'idea' then (select l.from_id from knowledge.links l join knowledge.run_terms t on t.run_id = l.from_id
                       where l.to_id = r.id and l.type = 'suggests' and t.ran_on <= p_merged_at::date
                       order by t.ran_on desc, t.recorded_at desc limit 1)
    else (select t.run_id from knowledge.run_terms t
           where t.practice_id = r.id and t.ran_on <= p_merged_at::date
           order by t.ran_on desc, t.recorded_at desc limit 1)
  end;
  foreach target in array array_remove(array[the_run, case when r.kind = 'idea' then r.id end], null) loop
    if not exists (select 1 from knowledge.refs f where f.record_id = target and f.kind = 'pr' and f.url = p_url) then
      insert into knowledge.refs (record_id, kind, url, label, person, agent)
      values (target, 'pr', p_url, p_label, w.person, w.name);
      linked := linked || target;
    end if;
  end loop;
  return jsonb_build_object('ref', p_ref, 'linked', to_jsonb(linked));
end $$;
comment on function knowledge.link_pr(text, text, text, timestamptz) is
  'Links a merged PR to the run it followed, by a run, idea or practice it names. An idea keeps the PR too, so the next run marks it tried. The same PR again changes nothing. Operators only.';

create function knowledge.drop_idea(p_id text, p_why text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
begin
  if not w.operator then
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
comment on function knowledge.drop_idea(text, text) is
  'The PM drops an open idea, with why: a new version whose history keeps the date and the reason.';

-- ---------------------------------------------------------------------------
-- Reads. Security invoker: row-level security decides what each key sees.

-- The routine a question names: by its practice's id or slug, or by the most
-- words of the routine's name ("how has load changed" names Load simulation).
create function knowledge.routine_for(p_question text) returns text
language sql stable set search_path = '' as $$
  with q as (
    select lower(btrim(coalesce(p_question, ''))) as t,
           regexp_split_to_array(lower(coalesce(p_question, '')), '[^a-z0-9-]+') as words
  )
  select r.practice_id
    from knowledge.routines r
    cross join q
    join knowledge.records p on p.id = r.practice_id
    cross join lateral (
      select count(*) as hits
        from unnest(regexp_split_to_array(lower(r.name), '[^a-z0-9-]+')) n
       where length(n) > 2 and n = any (q.words)
    ) m
   where q.t in (r.practice_id, substr(r.practice_id, 10)) or m.hits > 0
   order by (q.t in (r.practice_id, substr(r.practice_id, 10))) desc, m.hits desc, r.practice_id
   limit 1
$$;
comment on function knowledge.routine_for(text) is 'The routine a question names, by its practice id or slug, or by the words of its name.';

create function knowledge._first_suggester(p_id text) returns text
language sql stable set search_path = '' as $$
  select l.from_id from knowledge.links l join knowledge.run_terms t on t.run_id = l.from_id
   where l.to_id = p_id and l.type = 'suggests' order by t.ran_on, t.recorded_at limit 1
$$;

create function knowledge.run_history(p_question text) returns jsonb
language sql stable set search_path = '' as $$
  with the as (select knowledge.routine_for(p_question) as id)
  select case when (select id from the) is null then null else jsonb_build_object(
    'practice', (select jsonb_build_object('id', p.id, 'answer', p.answer, 'name', r.name, 'every_days', r.every_days,
                                           'workflow', r.workflow)
                   from knowledge.records p join knowledge.routines r on r.practice_id = p.id
                  where p.id = (select id from the)),
    'runs', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', x.id, 'ran_on', t.ran_on, 'outcome', x.status, 'summary', x.answer, 'commit', t.commit,
               'members', t.members, 'numbers', t.numbers, 'broke_first', t.broke_first, 'url', t.url,
               'changed_after', coalesce((select jsonb_agg(jsonb_build_object('url', f.url, 'label', f.label) order by f.created_at)
                                            from knowledge.refs f where f.record_id = x.id and f.kind = 'pr'), '[]'::jsonb),
               'tried', coalesce((select jsonb_agg(l.to_id order by l.to_id) from knowledge.links l
                                   where l.from_id = x.id and l.type = 'tried'), '[]'::jsonb))
             order by t.ran_on, t.recorded_at)
        from knowledge.run_terms t join knowledge.records x on x.id = t.run_id
       where t.practice_id = (select id from the)), '[]'::jsonb),
    'open', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'answer', i.answer, 'since', i.decided_on,
                                          'from', knowledge._first_suggester(i.id)) order by i.decided_on, i.id)
        from knowledge.records i
       where i.kind = 'idea' and i.status = 'open' and knowledge._practice_of(i.id) = (select id from the)), '[]'::jsonb),
    'closed', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'answer', i.answer, 'status', i.status,
                                          'on', (select h.valid_from::date from knowledge.history h
                                                  where h.record_id = i.id and h.version = i.version),
                                          'why', (select h.reason from knowledge.history h
                                                   where h.record_id = i.id and h.version = i.version))
                       order by i.updated_at, i.id)
        from knowledge.records i
       where i.kind = 'idea' and i.status <> 'open' and knowledge._practice_of(i.id) = (select id from the)), '[]'::jsonb)
  ) end
$$;

comment on function knowledge.run_history(text) is
  'The history of a routine, in one call: every run in date order with its numbers, what broke first and the PRs that followed it, the ideas still open, and those tried or dropped with when and why. Null when no routine matches the question.';

create function knowledge.run_upkeep(p_today date default current_date)
returns table (id text, kind text, answer text, problem text, since date)
language sql stable set search_path = '' as $$
  select r.practice_id, 'routine', r.name,
         case when last.ran_on is null then format('has never run (expected every %s days)', r.every_days)
              else format('has not run since %s (expected every %s days)', last.ran_on, r.every_days) end,
         coalesce(last.ran_on, r.set_on)
    from knowledge.routines r
    left join lateral (select max(t.ran_on) as ran_on from knowledge.run_terms t where t.practice_id = r.practice_id) last on true
   where coalesce(last.ran_on, r.set_on) < p_today - r.every_days
  union all
  select i.id, i.kind, i.answer, format('open since %s, over 90 days, untried', i.decided_on), i.decided_on
    from knowledge.records i
   where i.kind = 'idea' and i.status = 'open' and i.decided_on < p_today - 90
   order by 2, 5, 1
$$;
comment on function knowledge.run_upkeep(date) is
  'For the monthly upkeep: routines with no run in their expected interval, and ideas open more than 90 days.';

-- ---------------------------------------------------------------------------
-- Access: read like the rest of the store, write only through the functions.

alter table knowledge.routines  enable row level security;
alter table knowledge.run_terms enable row level security;
create policy routines_with_a_key on knowledge.routines for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = practice_id));
create policy run_terms_of_visible_runs on knowledge.run_terms for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = run_id));

revoke all on knowledge.routines, knowledge.run_terms from public, anon, authenticated, service_role;
revoke all on function
  knowledge._runs_before(), knowledge._run_links(), knowledge._practice_of(text), knowledge._idea_words(text),
  knowledge._move(text, text), knowledge._first_suggester(text),
  knowledge.set_routine(text, text, integer, text), knowledge.record_run(jsonb, timestamptz),
  knowledge.link_pr(text, text, text, timestamptz), knowledge.drop_idea(text, text),
  knowledge.routine_for(text), knowledge.run_history(text), knowledge.run_upkeep(date)
  from public, anon, authenticated, service_role;

grant select on knowledge.routines, knowledge.run_terms to knowledge_store;
grant execute on function
  knowledge._practice_of(text), knowledge._idea_words(text), knowledge._first_suggester(text),
  knowledge.set_routine(text, text, integer, text), knowledge.record_run(jsonb, timestamptz),
  knowledge.link_pr(text, text, text, timestamptz), knowledge.drop_idea(text, text),
  knowledge.routine_for(text), knowledge.run_history(text), knowledge.run_upkeep(date)
  to knowledge_store;
