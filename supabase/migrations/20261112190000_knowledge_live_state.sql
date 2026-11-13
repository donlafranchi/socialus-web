-- F131 (#1249): three short answers (what we built, where we are, what's
-- next). Stage 5 of the F125 store, after capabilities (F129, #1239).
--
-- Scenario: socialus-plan planning/scenario-F131.md (approved 2026-11-11).
-- Tests: supabase/tests/knowledge_live_state.sql, run by
-- tests/knowledge-answers-db.test.ts. The job that writes the snapshot is
-- scripts/knowledge/live-state.ts, run by .github/workflows/knowledge-answers.yml;
-- the lookup tool's verbs (built, where, next) are src/lib/knowledge/answers.ts.
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · knowledge.live_state: what GitHub and Vercel say right now, one row
--     per thing (broken, slow, bug, blocker, waiting, in flight), each with
--     its words, its link and its source. A snapshot, not a log: the scenario
--     rules out history views ("git holds that"), so each run replaces it.
--   · knowledge.live_state_taken: when the snapshot was taken, and by which
--     agent, so an answer can say how fresh it is. One row.
--   · knowledge.set_live_state(rows, taken_at): the one write, by an operator
--     (the job, for the PM). Replaces the whole snapshot in one statement.
--   · knowledge.live_state(): the read, for keys of building or
--     telemetry-and-bugs, and operators.
--
-- The store refuses any delete of a record. These rows are not records: they
-- are a copy of what GitHub holds, and GitHub keeps its own history, so the
-- write replaces them whole rather than keeping a second history beside it
-- (HumanLayer's 12-factor rule 5: derive state from the one source).
--
-- No app table changes. Nothing in the app reads the schema.

create table knowledge.live_state (
  kind     text not null check (kind in ('broken', 'slow', 'bug', 'blocker', 'waiting', 'in_flight')),
  key      text not null check (btrim(key) <> ''),
  words    text not null check (btrim(words) <> ''),
  url      text,
  source   text not null check (source in ('github', 'vercel')),
  since    timestamptz,
  primary key (kind, key)
);
comment on table knowledge.live_state is
  'F131: what GitHub and Vercel say right now: broken, slow, open bugs, launch blockers, items waiting on the PM, work in flight. Replaced whole by each run of the job; no history.';

create table knowledge.live_state_taken (
  one      boolean primary key default true check (one),
  taken_at timestamptz not null,
  agent    text not null,
  counts   jsonb not null
);
comment on table knowledge.live_state_taken is
  'F131: when the live-state snapshot was last taken, by which agent, and how many rows of each kind.';

alter table knowledge.live_state enable row level security;
alter table knowledge.live_state_taken enable row level security;
create policy live_state_readers on knowledge.live_state for select to knowledge_store
  using (knowledge.can_see('department', array['building', 'telemetry-and-bugs']));
create policy live_state_taken_readers on knowledge.live_state_taken for select to knowledge_store
  using (knowledge.can_see('department', array['building', 'telemetry-and-bugs']));

-- ---------------------------------------------------------------------------
-- The write.

create function knowledge.set_live_state(p_rows jsonb, p_taken_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  bad text;
  the_counts jsonb;
begin
  if not w.operator then
    raise exception 'Only an operator writes the live state: the job does it for the PM.'
      using errcode = 'insufficient_privilege';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'The live state is an array of rows.' using errcode = 'check_violation';
  end if;
  select k into bad
    from jsonb_array_elements(p_rows) r, jsonb_object_keys(r) k
   where k not in ('kind', 'key', 'words', 'url', 'source', 'since')
   limit 1;
  if bad is not null then
    raise exception 'A live-state row takes kind, key, words, url, source and since, not %.', bad
      using errcode = 'undefined_column';
  end if;

  delete from knowledge.live_state where true;
  insert into knowledge.live_state (kind, key, words, url, source, since)
  select r->>'kind', r->>'key', btrim(r->>'words'), nullif(r->>'url', ''), r->>'source', (r->>'since')::timestamptz
    from jsonb_array_elements(p_rows) r;

  select coalesce(jsonb_object_agg(kind, n), '{}'::jsonb) into the_counts
    from (select kind, count(*) n from knowledge.live_state group by kind) c;
  insert into knowledge.live_state_taken (one, taken_at, agent, counts)
  values (true, p_taken_at, w.name, the_counts)
  on conflict (one) do update set taken_at = excluded.taken_at, agent = excluded.agent, counts = excluded.counts;
  return jsonb_build_object('taken_at', p_taken_at, 'counts', the_counts);
end $$;
comment on function knowledge.set_live_state(jsonb, timestamptz) is
  'Replaces the live-state snapshot with these rows (kind, key, words, url, source, since). Operators only: the job runs it for the PM.';

-- ---------------------------------------------------------------------------
-- The read. Security invoker: row-level security decides who reads it.

create function knowledge.live_state()
returns table (kind text, key text, words text, url text, source text, since timestamptz, taken_at timestamptz)
language sql stable set search_path = '' as $$
  select s.kind, s.key, s.words, s.url, s.source, s.since, t.taken_at
    from knowledge.live_state s
    cross join knowledge.live_state_taken t
   order by array_position(array['broken', 'slow', 'blocker', 'waiting', 'bug', 'in_flight'], s.kind), s.since nulls last, s.key
$$;
comment on function knowledge.live_state() is
  'What GitHub and Vercel say right now, worst first, with when it was taken. Keys of building or telemetry-and-bugs, and operators.';

revoke all on table knowledge.live_state, knowledge.live_state_taken from public, anon, authenticated, service_role;
grant select on knowledge.live_state, knowledge.live_state_taken to knowledge_store;
revoke all on function knowledge.set_live_state(jsonb, timestamptz), knowledge.live_state()
  from public, anon, authenticated, service_role;
grant execute on function knowledge.set_live_state(jsonb, timestamptz), knowledge.live_state() to knowledge_store;
