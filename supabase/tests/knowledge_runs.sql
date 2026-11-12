-- F135: each run of a repeated routine keeps a dated record in the store.
-- Scenario: socialus-plan planning/scenario-F135.md.
--
-- Run by tests/knowledge-runs-db.test.ts, as the other knowledge suites are:
-- each "-- test:" block in its own transaction, after the preamble, rolled
-- back. A block passes when it runs without an error; every assert names what
-- went wrong.
--
-- How a load run becomes this record, how a PR body names a run, and the
-- `runs` verb's words are tested where they live: tests/knowledge-runs.test.ts.

-- preamble
select set_config('t.ops',   knowledge.add_agent('t-ops',   'the PM',    '{}',         true),  true);
select set_config('t.build', knowledge.add_agent('t-build', 'a builder', '{building}', false), true);
create function pg_temp.refused(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return null;
exception when others then
  return sqlerrm;
end $$;
create function pg_temp.act(p_agent text) returns text language sql as $$
  select set_config('knowledge.key', coalesce(current_setting('t.' || p_agent, true), ''), true)
$$;
do $$ begin execute format('grant usage on schema %s to knowledge_store', pg_my_temp_schema()::regnamespace); end $$;
grant knowledge_store to current_user;  -- rolled back with the test; lets this session act as the login
set local role knowledge_store;
select pg_temp.act('ops');
select knowledge.record('{"id":"practice.t-load","kind":"practice","concern":"how-shipping","answer":"Load-test locally before each checkpoint.","why":"Production holds real members.","scope":"process","audience":"members","ring":"assess"}', 'test practice');
select knowledge.set_routine('practice.t-load', 'Load simulation', 90, 'load.yml');
select knowledge.record_run(
  '{"practice":"practice.t-load","key":"gh:1","ran_on":"2026-11-12","commit":"7ca149fd4f796faf9b6b883a08044a8b78834fd8","members":1000,"outcome":"passed",
    "summary":"Rendering broke first, at 200 signed-out viewers.","numbers":{"view-out-200":{"p95_ms":1030}},
    "broke_first":"rendering at 200 signed-out viewers","url":"https://github.com/x/y/actions/runs/1",
    "ideas":["Cache the signed-out Page.","Raise the pool to 10"]}',
  '2026-11-12T12:00:00Z');

-- test: a run is a record of its practice with every field of its own
-- [guards F135.1]
do $$
declare
  t knowledge.run_terms;
  r knowledge.records;
begin
  select * into t from knowledge.run_terms where run_key = 'gh:1';
  select * into r from knowledge.records where id = t.run_id;
  assert r.kind = 'run' and r.status = 'passed' and r.decided_on = '2026-11-12', format('the run: %s %s %s', r.kind, r.status, r.decided_on);
  assert t.practice_id = 'practice.t-load' and t.commit = '7ca149fd4f796faf9b6b883a08044a8b78834fd8' and t.members = 1000,
    format('terms: %s %s %s', t.practice_id, t.commit, t.members);
  assert t.numbers->'view-out-200'->>'p95_ms' = '1030', format('numbers: %s', t.numbers);
  assert t.broke_first = 'rendering at 200 signed-out viewers', format('broke first: %s', t.broke_first);
  assert exists (select 1 from knowledge.links l where l.from_id = r.id and l.to_id = 'practice.t-load' and l.type = 'run_of'),
    'the run links to its practice';
  assert (select count(*) from knowledge.links l where l.from_id = r.id and l.type = 'suggests') = 2, 'two ideas left';
  -- what changed after has its own place: refs of kind pr (the merge test fills it)
  assert pg_temp.refused('update knowledge.run_terms set members = 5') is not null, 'terms are written once';
end $$;

-- test: a run records itself, pass or fail, once; only an operator writes one
-- [guards F135.2 partial: the workflow that calls it and fails without a record is tests/knowledge-runs.test.ts]
do $$
declare
  out jsonb;
  err text;
begin
  out := knowledge.record_run('{"practice":"practice.t-load","key":"gh:1","ran_on":"2026-11-12","commit":"7ca149f","outcome":"passed","summary":"again"}');
  assert (out->>'unchanged')::boolean, format('the same run again changes nothing: %s', out);
  out := knowledge.record_run('{"practice":"practice.t-load","key":"gh:2","ran_on":"2026-11-13","commit":"abcdef1","outcome":"failed","summary":"The run stopped before the first level.","numbers":{}}');
  assert (select status from knowledge.records where id = out->>'id') = 'failed', 'a failed run is recorded too';
  err := pg_temp.refused($q$select knowledge.record_run('{"practice":"practice.t-load","key":"gh:3","ran_on":"2026-11-13","commit":"abcdef1","outcome":"broke","summary":"x"}')$q$);
  assert err like '%passed or failed%', format('outcome: %s', err);
  err := pg_temp.refused($q$select knowledge.record_run('{"practice":"practice.t-load","key":"gh:3","ran_on":"2026-11-13","commit":"abcdef1","outcome":"passed","summary":"x","colour":"red"}')$q$);
  assert err like '%no field colour%', format('extra field: %s', err);
  perform pg_temp.act('build');
  err := pg_temp.refused($q$select knowledge.record_run('{"practice":"practice.t-load","key":"gh:4","ran_on":"2026-11-13","commit":"abcdef1","outcome":"passed","summary":"x"}')$q$);
  assert err like 'Only an operator records a run%', format('a builder: %s', err);
  -- nor around record_run, through record() itself
  err := pg_temp.refused($q$select knowledge.record('{"kind":"run","concern":"how-shipping","answer":"a fake run","status":"passed","scope":"process","audience":"members","departments":["building"]}', 'x')$q$);
  assert err like 'Only an operator writes a run or an idea%', format('a builder through record(): %s', err);
  err := pg_temp.refused($q$select knowledge.record('{"kind":"idea","concern":"how-shipping","answer":"born tried","status":"tried","scope":"process","audience":"members","departments":["building"]}', 'x')$q$);
  assert err like 'Only an operator writes a run or an idea%', format('an idea through record(): %s', err);
  err := pg_temp.refused($q$select knowledge.revise((select run_id from knowledge.run_terms where run_key = 'gh:1'), '{"status":"failed"}', 'x')$q$);
  assert err is not null, 'a run keeps how it ended';
end $$;

-- test: a merged PR that names a run, an idea or a practice links itself to the run it followed
-- [guards F135.3]
do $$
declare
  run1 text := (select run_id from knowledge.run_terms where run_key = 'gh:1');
  run2 text;
  idea text := (select l.to_id from knowledge.links l join knowledge.records i on i.id = l.to_id
                 where l.from_id = run1 and l.type = 'suggests' and i.answer like 'Raise%');
  out jsonb;
begin
  out := knowledge.link_pr(run1, 'https://github.com/x/y/pull/10', '#10 a fix', '2026-11-12T22:00:00Z');
  assert out->'linked' = to_jsonb(array[run1]), format('by run id: %s', out);
  out := knowledge.link_pr(run1, 'https://github.com/x/y/pull/10', '#10 a fix', '2026-11-12T22:00:00Z');
  assert out->'linked' = '[]'::jsonb, format('the same PR again: %s', out);
  run2 := knowledge.record_run('{"practice":"practice.t-load","key":"gh:5","ran_on":"2026-11-20","commit":"abcdef2","outcome":"passed","summary":"later"}')->>'id';
  -- a practice means its latest run before the merge
  out := knowledge.link_pr('practice.t-load', 'https://github.com/x/y/pull/11', '#11', '2026-11-15T00:00:00Z');
  assert out->'linked' = to_jsonb(array[run1]), format('by practice, merged before run 2: %s', out);
  out := knowledge.link_pr('practice.t-load', 'https://github.com/x/y/pull/12', '#12', '2026-11-21T00:00:00Z');
  assert out->'linked' = to_jsonb(array[run2]), format('by practice, merged after run 2: %s', out);
  -- an idea means the run that left it, and the idea keeps the PR
  out := knowledge.link_pr(idea, 'https://github.com/x/y/pull/13', '#13 pool of 10', '2026-11-21T00:00:00Z');
  assert out->'linked' = to_jsonb(array[run1, idea]), format('by idea: %s', out);
  out := knowledge.link_pr('nothing.here', 'https://github.com/x/y/pull/14', '#14', now());
  assert out->'linked' = '[]'::jsonb, 'a name that is no run links nothing';
  perform pg_temp.act('build');
  assert pg_temp.refused(format($q$select knowledge.link_pr(%L, 'https://github.com/x/y/pull/15', '#15')$q$, run1)) like 'Only an operator%',
    'a builder does not link';
end $$;

-- test: each practice keeps a try-next-time list; an idea leaves it only when a later run tried it or the PM drops it
-- [guards F135.4]
do $$
declare
  run1 text := (select run_id from knowledge.run_terms where run_key = 'gh:1');
  cache text := (select l.to_id from knowledge.links l join knowledge.records i on i.id = l.to_id
                  where l.from_id = run1 and l.type = 'suggests' and i.answer like 'Cache%');
  pool text := (select l.to_id from knowledge.links l join knowledge.records i on i.id = l.to_id
                 where l.from_id = run1 and l.type = 'suggests' and i.answer like 'Raise%');
  out jsonb;
  h knowledge.history;
begin
  -- the same words again join the open idea; a new one is added
  out := knowledge.record_run('{"practice":"practice.t-load","key":"gh:6","ran_on":"2026-11-14","commit":"abcdef3","outcome":"passed","summary":"s",
                                "ideas":["cache the signed-out page","Split the ♡ off the Page render"]}');
  assert out->'still_open' = to_jsonb(array[cache]) and jsonb_array_length(out->'ideas') = 1, format('joined and added: %s', out);
  -- a PR names the pool idea; the next run marks it tried and links it
  perform knowledge.link_pr(pool, 'https://github.com/x/y/pull/13', '#13', '2026-11-15T00:00:00Z');
  out := knowledge.record_run('{"practice":"practice.t-load","key":"gh:7","ran_on":"2026-11-16","commit":"abcdef4","outcome":"passed","summary":"after the pool fix"}');
  assert out->'tried' = to_jsonb(array[pool]), format('tried: %s', out);
  assert (select status from knowledge.records where id = pool) = 'tried', 'the pool idea left the open list';
  assert exists (select 1 from knowledge.links where from_id = out->>'id' and to_id = pool and type = 'tried'), 'linked to the run that tried it';
  -- two PRs between runs, one per idea: the next run tries both
  perform knowledge.link_pr(cache, 'https://github.com/x/y/pull/16', '#16', '2026-11-16T12:00:00Z');
  perform knowledge.link_pr((select l.to_id from knowledge.links l join knowledge.records i on i.id = l.to_id
                               where l.type = 'suggests' and i.answer like 'Split%'), 'https://github.com/x/y/pull/17', '#17', '2026-11-16T12:00:00Z');
  out := knowledge.record_run('{"practice":"practice.t-load","key":"gh:10","ran_on":"2026-11-17","commit":"abcdef6","outcome":"passed","summary":"after two fixes"}');
  assert jsonb_array_length(out->'tried') = 2, format('both tried by one run: %s', out);
  -- a fresh open idea, for the PM to drop below
  out := knowledge.record_run('{"practice":"practice.t-load","key":"gh:11","ran_on":"2026-11-18","commit":"abcdef7","outcome":"passed","summary":"s","ideas":["Cache the signed-out Page."]}');
  cache := out->'ideas'->>0;
  -- nobody else moves an idea
  assert pg_temp.refused(format($q$select knowledge.revise(%L, '{"status":"dropped"}', 'x')$q$, cache)) is not null, 'revise cannot drop';
  perform pg_temp.act('build');
  assert pg_temp.refused(format($q$select knowledge.drop_idea(%L, 'x')$q$, cache)) like 'Only the PM%', 'a builder cannot drop';
  perform pg_temp.act('ops');
  -- the PM drops one, with why; the date and why are kept
  perform knowledge.drop_idea(cache, 'Pages are already cached at the edge.');
  select * into h from knowledge.history where record_id = cache order by version desc limit 1;
  assert h.snapshot->>'status' = 'dropped' and h.reason = 'Pages are already cached at the edge.' and h.valid_from::date = current_date,
    format('dropped with why: %s %s', h.snapshot->>'status', h.reason);
  assert pg_temp.refused(format($q$select knowledge.drop_idea(%L, 'again')$q$, cache)) like '%already dropped%', 'dropped once';
end $$;

-- test: the history of a routine and what to try next is one call
-- [guards F135.7]
do $$
declare
  run1 text := (select run_id from knowledge.run_terms where run_key = 'gh:1');
  h jsonb;
begin
  perform knowledge.link_pr(run1, 'https://github.com/x/y/pull/10', '#10 a fix', '2026-11-12T22:00:00Z');
  perform knowledge.record_run('{"practice":"practice.t-load","key":"gh:8","ran_on":"2027-01-10","commit":"abcdef5","members":1000,"outcome":"passed",
                                 "summary":"Nothing broke up to 1,000 viewers.","numbers":{"view-out-200":{"p95_ms":300}},"ideas":["Try 5,000 viewers"]}');
  h := knowledge.run_history('how has load changed and what should we try next?');
  assert h->'practice'->>'id' = 'practice.t-load', format('the routine: %s', h->'practice');
  assert jsonb_array_length(h->'runs') = 2, format('both runs: %s', h->'runs');
  assert h->'runs'->0->>'ran_on' = '2026-11-12' and h->'runs'->1->>'ran_on' = '2027-01-10', 'in date order';
  assert h->'runs'->0->>'broke_first' = 'rendering at 200 signed-out viewers', 'what broke first';
  assert h->'runs'->1->'numbers'->'view-out-200'->>'p95_ms' = '300', 'the numbers';
  assert h->'runs'->0->'changed_after'->0->>'url' = 'https://github.com/x/y/pull/10', format('the change between: %s', h->'runs'->0->'changed_after');
  assert jsonb_array_length(h->'open') = 3, format('the open list: %s', h->'open');
  assert knowledge.run_history('load-sim') is null and knowledge.run_history('practice.t-load') is not null
     and knowledge.run_history('t-load') is not null, 'by practice id or slug';
  assert knowledge.run_history('the weather') is null, 'no routine named';
end $$;

-- test: the monthly upkeep lists a routine with no run in its interval and an idea open over 90 days
-- [guards F135.8]
do $$
declare
  found text[];
begin
  select array_agg(u.kind order by u.kind) into found from knowledge.run_upkeep('2026-12-01') u;
  assert found is null, format('nothing due a fortnight on: %s', found);
  select array_agg(distinct u.kind order by u.kind) into found from knowledge.run_upkeep('2027-02-15') u;
  assert found = array['idea', 'routine'], format('both due: %s', found);
  assert (select problem from knowledge.run_upkeep('2027-02-15') where kind = 'routine') like 'has not run since 2026-11-12%',
    'the routine says since when';
end $$;
