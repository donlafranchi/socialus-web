-- F128: how we work lives in the store. Scenario: socialus-plan
-- planning/scenario-F128.md.
--
-- Run by tests/knowledge-practices-db.test.ts, as the F125, F126 and F130
-- suites are: each "-- test:" block in its own transaction, after the
-- preamble, rolled back. A block passes when it runs without an error; every
-- assert names what went wrong.
--
-- Loading the seed, the pack, the drift step and the lookup's words are
-- tested where they live: tests/knowledge-practices.test.ts.

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

select knowledge.record(
  '{"id":"t-ph","kind":"philosophy","answer":"Production asks the PM.","why":"He owns what members see.","audience":"members"}',
  'F128 test', null, null);
select knowledge.record(
  '{"id":"practice.t-review","kind":"practice","concern":"how-reviewing","scope":"process","answer":"A second session reviews every change to actions or the schema.","why":"PR #990 passed review with the builder as its own reviewer.","strength":"rule","ring":"adopt","enforced_by":"socialus-web:REVIEW.md (the review rules)","audience":"members","as_of":"2026-11-01"}',
  'F128 test', '{"failures":[{"date":"2026-10-21","what":"PR #990 self-reviewed","ref":"socialus-web#990"}]}', null);
select knowledge.record(
  '{"id":"practice.t-push","kind":"practice","concern":"how-shipping","scope":"process","answer":"Push once, when a change is ready.","why":"Every push runs CI.","strength":"guideline","ring":"trial","enforced_by":"socialus-web:CLAUDE.md (Pushing)","audience":"members","as_of":"2026-11-01"}',
  'F128 test', null, null);
select knowledge.record(
  '{"id":"practice.t-words","kind":"practice","concern":"how-words","scope":"process","answer":"No em dashes.","why":"The PM reads them as machine voice.","strength":"absolute","ring":"adopt","enforced_by":"socialus-ops:process/WORDS.md","audience":"members","as_of":"2026-11-01"}',
  'F128 test', null, null);
select knowledge.link('practice.t-review', 't-ph', 'applies');

-- test: a practice comes in with scope process, its why, its dated failure as evidence, its strength, its enforcing check and a ring
-- [guards F128.1 partial: reading each rule out of socialus-ops and the CLAUDE.md files, tested in tests/knowledge-practices.test.ts]
do $$
declare
  r knowledge.records;
  h knowledge.history;
begin
  select * into r from knowledge.records where id = 'practice.t-review';
  assert r.kind = 'practice' and r.scope = 'process' and r.status = 'live', 'the practice is a live process record';
  assert r.why like 'PR #990%' and r.strength = 'rule' and r.ring = 'adopt', 'it keeps its why, strength and ring';
  assert r.enforced_by like 'socialus-web:REVIEW.md%', 'it names the check that enforces it';
  select * into h from knowledge.history where record_id = r.id and version = 1;
  assert h.evidence->'failures'->0->>'date' = '2026-10-21', 'its dated failure is the evidence of its first version';

  assert pg_temp.refused($q$select knowledge.record('{"kind":"practice","concern":"how-building","scope":"process","answer":"x","ring":"adopt","audience":"members"}', 't', null, null)$q$)
    like '%needs a why%', 'a practice without a why is refused';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"practice","concern":"how-building","scope":"process","answer":"x","why":"y","audience":"members"}', 't', null, null)$q$)
    like '%has a ring%', 'a practice without a ring is refused';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"practice","concern":"how-building","scope":"product","answer":"x","why":"y","ring":"adopt","audience":"members"}', 't', null, null)$q$)
    like '%scope process%', 'a practice of product scope is refused';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","answer":"x","why":"y","ring":"adopt"}', 't', null, null)$q$)
    like '%Only a practice has a ring%', 'a ring on anything but a practice is refused';
end $$;

-- test: a builder's key proposes a practice; only the PM makes it live
do $$
declare
  new_id text;
begin
  perform pg_temp.act('build');
  new_id := knowledge.record('{"kind":"practice","concern":"how-building","scope":"process","answer":"Try smaller PRs.","why":"Reviews go faster.","ring":"assess","audience":"members","path":"well-worn"}', 'F128 test', null, null);
  assert new_id like 'PR-%', 'a new practice takes a PR- id';
  assert (select status from knowledge.records where records.id = new_id) = 'proposed', 'a builder''s practice starts proposed';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"practice","concern":"how-building","scope":"process","answer":"x","why":"y","ring":"adopt","status":"live","audience":"members"}', 't', null, null)$q$)
    like '%only when the PM decides%', 'a builder cannot make a practice live';
end $$;

-- test: "how does our DevOps work" returns the live practices of building, reviewing and shipping, strictest first, each with its ring, check and principles
-- [guards F128.2 partial: the lookup's words and the verb's lines, tested in tests/knowledge-practices.test.ts]
do $$
declare
  ids text[];
begin
  select array_agg(h.id order by h.concern, h.id) into ids from knowledge.how('How does our DevOps work?') h;
  assert ids = array['practice.t-review', 'practice.t-push'], format('devops reads reviewing and shipping, got %s', ids);
  assert (select applies from knowledge.how('review') h where h.id = 'practice.t-review') = array['t-ph'],
    'each line carries the principles it applies';
  assert (select enforced_by from knowledge.how('reviewing') h where h.id = 'practice.t-review') like 'socialus-web:REVIEW.md%',
    'each line carries its enforcing check';
  assert (select count(*) from knowledge.how('words')) = 1 and (select count(*) from knowledge.how('how-words')) = 1,
    'an area answers to its own name';
  assert (select count(*) from knowledge.how('the weather')) = 0, 'a question naming no area returns nothing';
  assert knowledge.areas_for('the agent loop') = array['how-agents'], 'the agent loop points at how the agents run';
end $$;

-- test: moving a ring writes a new version with its why, and only the PM moves one
-- [guards F128.5]
do $$
declare
  v integer;
begin
  perform knowledge.revise('practice.t-push', '{"ring":"adopt"}', 'Two weeks with no wasted CI runs.', null, null);
  select version into v from knowledge.records where id = 'practice.t-push';
  assert v = 2, 'the ring move is a new version';
  assert (select snapshot->>'ring' from knowledge.history where record_id = 'practice.t-push' and version = 1) = 'trial'
     and (select snapshot->>'ring' from knowledge.history where record_id = 'practice.t-push' and version = 2) = 'adopt',
    'history holds the ring before and after';
  assert (select reason from knowledge.history where record_id = 'practice.t-push' and version = 2) = 'Two weeks with no wasted CI runs.',
    'the move keeps its why';
  assert pg_temp.refused($q$select knowledge.revise('practice.t-push', '{"ring":"banana"}', 'why', null, null)$q$) is not null,
    'a ring outside adopt, trial, assess, hold is refused';
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.revise('practice.t-push', '{"ring":"hold"}', 'why', null, null)$q$) is not null,
    'a builder cannot move a ring';
end $$;

-- test: an experiment records the practice it changes, the baseline, the measure and the verdict date once, and its verdict is keep, fix or revert
-- [guards F128.6 partial: the single-loop plan's changes loaded first, tested in tests/knowledge-practices.test.ts]
do $$
declare
  e text;
begin
  e := knowledge.record('{"id":"experiment.t-one","kind":"experiment","scope":"process","answer":"Merge on green without waiting for a look.","audience":"members"}', 'F128 test', null, null);
  assert (select status from knowledge.records where id = e) = 'running', 'an experiment starts running';
  perform knowledge.set_experiment_terms(e, 'practice.t-push', 'Four days from green to merge.', 'Days from green to merge.', '2026-12-01');
  assert exists (select 1 from knowledge.links where from_id = e and to_id = 'practice.t-push' and type = 'changes'),
    'the experiment links to the practice it changes';
  assert (knowledge.set_experiment_terms(e, 'practice.t-push', 'Four days from green to merge.', 'Days from green to merge.', '2026-12-01'))->>'unchanged' = 'true',
    'the same terms again change nothing';
  assert pg_temp.refused(format($q$select knowledge.set_experiment_terms(%L, 'practice.t-push', 'b', 'm', '2027-01-01')$q$, e))
    like '%set once%', 'the terms do not move';
  assert pg_temp.refused(format($q$select knowledge.set_experiment_terms(%L, 't-ph', 'b', 'm', '2027-01-01')$q$, e))
    is not null, 'an experiment changes a practice, not a philosophy';
  perform knowledge.revise(e, '{"status":"keep"}', 'Green to merge fell to one day.', null, null);
  assert (select status from knowledge.records where id = e) = 'keep', 'the verdict is the status';
  assert pg_temp.refused(format($q$select knowledge.revise(%L, '{"status":"maybe"}', 'why', null, null)$q$, e))
    like '%keep, fix, revert%', 'a verdict is keep, fix or revert';
end $$;

-- test: the monthly upkeep lists practices not confirmed in 90 days and experiments past their verdict date
-- [guards F128.7 partial: the monthly run that opens the PM's Issue, tested in tests/knowledge-practices.test.ts]
do $$
declare
  e text;
  found text[];
begin
  e := knowledge.record('{"id":"experiment.t-late","kind":"experiment","scope":"process","answer":"Late one.","audience":"members"}', 'F128 test', null, null);
  perform knowledge.set_experiment_terms(e, 'practice.t-review', 'b', 'm', '2026-11-15');
  perform knowledge.record('{"id":"experiment.t-undated","kind":"experiment","scope":"process","answer":"No date yet.","audience":"members"}', 'F128 test', null, null);
  select array_agg(u.id order by u.id) into found from knowledge.practice_upkeep('2026-11-20') u;
  assert found = array['experiment.t-late', 'experiment.t-undated'],
    format('the late experiment and the one with no verdict date on 2026-11-20, got %s', found);
  select array_agg(u.id order by u.id) into found from knowledge.practice_upkeep('2027-02-15') u;
  assert found = array['experiment.t-late', 'experiment.t-undated', 'practice.t-push', 'practice.t-review', 'practice.t-words'],
    format('every practice 90 days unconfirmed by 2027-02-15, got %s', found);
  perform knowledge.confirm('practice.t-words', 'Still how we write.');
  assert (select as_of from knowledge.records where id = 'practice.t-words') = current_date, 'confirming dates it today';
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.confirm('practice.t-words', 'x')$q$) like '%Only an operator%',
    'only the PM confirms a practice';
end $$;
