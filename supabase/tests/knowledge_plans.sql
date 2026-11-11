-- F127: versions are plans of feature slices that can change without
-- breaking. Scenario: socialus-plan planning/scenario-F127.md.
--
-- Run by tests/knowledge-plans-db.test.ts, as the F125, F126 and F130 suites
-- are: each "-- test:" block in its own transaction, after the preamble,
-- rolled back. A block passes when it runs without an error; every assert
-- names what went wrong.
--
-- Bringing today's plan in from the scenarios' frontmatter, and the lookup
-- tool's verbs, are tested where they live: tests/knowledge-plans.test.ts.

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
-- Runs a statement as the migrations' owner, past the grants, so a refusal
-- comes from the store's own rules and not from a missing privilege.
create function pg_temp.refused_as_owner(p_sql text) returns text language plpgsql as $$
begin
  reset role;
  execute p_sql;
  set local role knowledge_store;
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

-- The story: Pages for sellers, card pre-orders waiting on card payments, and
-- a seller dashboard. Dated in the past so the plan's history has days in it.
select set_config('t.card', knowledge.record(
  '{"kind":"condition","concern":"payments","answer":"Take a one-off card payment","why":"Pre-orders need only this.","owner":"the PM","audience":"department","departments":["building"]}',
  'F127 test', null, '2026-10-01'), true);
select knowledge.record('{"id":"F900","kind":"feature","answer":"Sellers have Pages","status":"approved","audience":"department","departments":["building"]}', 'F127 test', null, '2026-10-01');
select knowledge.record('{"id":"F901","kind":"feature","answer":"Pre-orders","status":"approved","audience":"department","departments":["building"]}', 'F127 test', null, '2026-10-01');
select knowledge.record('{"id":"F902","kind":"feature","answer":"Seller dashboard","status":"approved","audience":"department","departments":["building"]}', 'F127 test', null, '2026-10-01');
select knowledge.add_slice('F900', 'A seller makes a Page', 'now', 1, 'F127 test', '{}', 'planned', null, null, '2026-10-02');
select knowledge.add_slice('F900', 'A seller lists what they sell on it', 'now', 2, 'F127 test', '{}', 'planned', null, null, '2026-10-02');
select knowledge.add_slice('F901', 'Hold a pre-order, pay at pickup', 'next', 1, 'F127 test', '{}', 'planned', null, null, '2026-10-02');
select knowledge.add_slice('F901', 'Card pre-orders', 'later', 1, 'F127 test', array[current_setting('t.card')], 'planned', null, null, '2026-10-02');
select knowledge.add_slice('F902', 'Seller dashboard: sales by day', 'next', 2, 'F127 test', '{}', 'planned', null, null, '2026-10-02');

-- This morning's plan.
select set_config('t.v', knowledge.plan_version(jsonb_build_object(
  'answer', 'Beta for sellers', 'why', 'Sellers are the first members a town needs.',
  'outcomes', jsonb_build_array('More Pages'), 'appetite', 'Six weeks',
  'includes', jsonb_build_array('F900-S1', 'F900-S2', 'F902-S1'),
  'leaves_out', jsonb_build_array(
    jsonb_build_object('slice', 'F901-S2', 'reason', 'Card payments are not ready.', 'condition', current_setting('t.card')),
    jsonb_build_object('slice', 'F901-S1', 'reason', 'Pages first.'))),
  'F127 test: the plan as it was this morning', null, '2026-11-01'), true);

-- test: a feature has slices, smallest to full, each with its own horizon, rank and the conditions it waits on
-- [guards F127.1]
do $$
declare
  r record;
begin
  select s.horizon, s.rank, s.status into r from knowledge.records s where s.id = 'F901-S2' and s.kind = 'slice';
  assert r.horizon = 'later' and r.rank = 1 and r.status = 'planned',
    format('a slice does not carry its own horizon and rank: %s', to_jsonb(r));
  assert (select array_agg(l.from_id order by l.from_id) from knowledge.links l where l.to_id = 'F901' and l.type = 'slice_of')
         = array['F901-S1', 'F901-S2'], 'a feature''s slices are not linked to it, numbered smallest first';
  assert exists (select 1 from knowledge.links l where l.from_id = 'F901-S2' and l.type = 'starts_when'
                    and l.to_id = current_setting('t.card')), 'a slice''s condition is not linked';
  assert knowledge.is_parked('F901-S2'), 'a slice waiting on an unmet condition is not parked';
  assert (knowledge.revise('F901-S2', '{"status":"building"}', 'try to start it'))->>'refused' is not null,
    'a parked slice was marked building';
  assert pg_temp.refused($q$select knowledge.record('{"id":"F900-S9","kind":"slice","answer":"no horizon","status":"planned","audience":"department","departments":["building"]}', 'F127 test')$q$) is not null,
    'a slice was recorded with no horizon or rank';
  assert pg_temp.refused($q$select knowledge.add_slice('F901', 'Card pre-orders, started', 'later', 2, 'F127 test', array[current_setting('t.card')], 'building')$q$)
         like 'A slice that waits on an unmet condition is not started as building%',
    'a parked slice was made as building';
  assert pg_temp.refused($q$select knowledge.add_slice('F900', 'x', 'soon', 1, 'F127 test')$q$) is not null,
    'a slice took a horizon other than now, next or later';
  assert pg_temp.refused($q$select knowledge.add_slice('F900', 'x', 'now', 0, 'F127 test')$q$) is not null,
    'a slice took a rank below 1';
  assert pg_temp.refused($q$select knowledge.add_slice(current_setting('t.card'), 'x', 'now', 1, 'F127 test')$q$) is not null,
    'a slice was made of something that is not a feature';
  assert pg_temp.refused($q$select knowledge.link('F900-S1', 'F901', 'slice_of')$q$) is not null,
    'a slice was moved to a second feature';
  perform knowledge.move_slice('F902-S1', 'later', 3, 'Not this season.');
  assert (select horizon from knowledge.records where id = 'F902-S1') = 'later'
     and (select count(*) from knowledge.history where record_id = 'F902-S1') = 2,
    'moving a slice is not a new version of it';
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.add_slice('F900', 'x', 'now', 3, 'F127 test')$q$) is not null,
    'a building key added a slice: the plan is the PM''s';
  assert pg_temp.refused($q$select knowledge.move_slice('F900-S1', 'later', 1, 'F127 test')$q$) is not null,
    'a building key moved a slice';
end $$;

-- test: a version is a record of outcomes, an appetite, the slices it includes and those it leaves out, each with a reason and the condition that brings it back
-- [guards F127.2]
do $$
declare
  v text := current_setting('t.v');
  p jsonb;
begin
  assert v ~ '^VN-\d{4}$', format('a version''s id is VN-nnnn, not %s', v);
  assert (select kind from knowledge.records where id = v) = 'version', 'a version is not a record';
  p := knowledge.plan_as_of(v, now());
  assert p->'outcomes' = '["More Pages"]' and p->>'appetite' = 'Six weeks', format('outcomes or appetite missing: %s', p);
  assert (select array_agg(i->>'slice' order by i->>'slice') from jsonb_array_elements(p->'includes') i)
         = array['F900-S1', 'F900-S2', 'F902-S1'], format('the included slices are wrong: %s', p->'includes');
  assert (select count(*) from jsonb_array_elements(p->'leaves_out') x
           where x->>'slice' = 'F901-S2' and x->>'reason' = 'Card payments are not ready.'
             and x->>'condition' = current_setting('t.card') and x->>'feature' = 'F901') = 1,
    format('a leave-out does not carry its reason, condition and feature: %s', p->'leaves_out');
  assert (select count(*) from jsonb_array_elements(p->'leaves_out') x where x->>'slice' = 'F901-S1' and x->>'condition' is null) = 1,
    'a leave-out with no condition is not listed';
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"],"appetite":"b","leaves_out":[{"slice":"F900-S1"}]}', 'F127 test')$q$) is not null,
    'a slice was left out with no reason';
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":[],"appetite":"b"}', 'F127 test')$q$) is not null,
    'a version was recorded with no outcome';
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"]}', 'F127 test')$q$) is not null,
    'a version was recorded with no appetite';
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"],"appetite":"b","includes":["F900"]}', 'F127 test')$q$) is not null,
    'a version included something that is not a slice';
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"],"appetite":"b","includes":["F900-S1"],"leaves_out":[{"slice":"F900-S1","reason":"r"}]}', 'F127 test')$q$) is not null,
    'a slice was both included and left out';
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"],"appetite":"b","leaves_out":[{"slice":"F900-S1","reason":"r","condition":"F900"}]}', 'F127 test')$q$) is not null,
    'a leave-out was brought back by something that is not a condition';
  perform knowledge.revise('F902-S1', '{"status":"withdrawn"}', 'Not doing it.');
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"],"appetite":"b","includes":["F902-S1"]}', 'F127 test')$q$)
         like 'A plan does not include a withdrawn slice%',
    'a new plan included a withdrawn slice';
  perform knowledge.revise(v, '{"status":"current"}', 'A version whose slice was withdrawn later still changes status.');
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.plan_version('{"answer":"x","why":"y","outcomes":["a"],"appetite":"b"}', 'F127 test')$q$) is not null,
    'a building key recorded a version';
  assert knowledge.plan_as_of(v, now()) is not null, 'a building key cannot read the plan';
end $$;

-- test: no feature or slice carries a date; a version may
-- [guards F127.3]
do $$
declare
  v2 text;
begin
  v2 := knowledge.plan_version('{"answer":"Spring","why":"A dated one.","outcomes":["a"],"appetite":"b","due_on":"2027-04-01"}', 'F127 test');
  assert (select due_on from knowledge.records where id = v2) = '2027-04-01', 'a version could not carry a date';
  assert pg_temp.refused_as_owner($q$update knowledge.records set due_on = '2027-01-01' where id = 'F900'$q$) like 'No feature carries a date%',
    'a feature took a date';
  assert pg_temp.refused_as_owner($q$update knowledge.records set due_on = '2027-01-01' where id = 'F900-S1'$q$) like 'No slice carries a date%',
    'a slice took a date';
  assert pg_temp.refused($q$select knowledge.record('{"id":"F903","kind":"feature","answer":"x","status":"approved","holds":"for now","until":"2027-01-01"}', 'F127 test')$q$) like 'No feature carries a date%',
    'a feature took an until date';
  assert pg_temp.refused($q$select knowledge.revise('F900-S1', '{"holds":"for now","until":"December"}', 'F127 test')$q$) like 'No slice carries a date%',
    'a slice took an until date';
end $$;

-- test: a change of plan is a new version with a why naming the outcome that changed, and the earlier plan stays readable
-- [guards F127.4]
do $$
declare
  v text := current_setting('t.v');
  out jsonb;
  before jsonb;
begin
  before := knowledge.plan_as_of(v, now());
  out := knowledge.replan(v, jsonb_build_object(
    'outcomes', jsonb_build_array('First sales'), 'appetite', 'Six weeks',
    'includes', jsonb_build_array('F900-S1', 'F900-S2', 'F901-S1'),
    'leaves_out', jsonb_build_array(
      jsonb_build_object('slice', 'F901-S2', 'reason', 'Card payments are not ready.', 'condition', current_setting('t.card')),
      jsonb_build_object('slice', 'F902-S1', 'reason', 'Sellers need sales before a dashboard of them.'))),
    'The next version is about getting sellers paid.', 'First sales', null, '2026-11-10 09:00');
  assert (out->>'version')::int = 2, format('a change of plan is not a new version: %s', out);
  assert knowledge.plan_as_of(v, '2026-11-05') = before, 'the earlier plan does not read as it was';
  assert knowledge.plan_as_of(v, now())->>'because' = 'The next version is about getting sellers paid.'
     and knowledge.plan_as_of(v, now())->>'outcome' = 'First sales', 'the new plan does not carry its why and outcome';
  assert pg_temp.refused(format($q$select knowledge.replan(%L, '{"outcomes":["First sales"],"appetite":"Two weeks"}', 'shorter', 'Faster')$q$, v)) is not null,
    'a change of plan named an outcome that is in neither plan';
  assert pg_temp.refused(format($q$select knowledge.replan(%L, '{"outcomes":["First sales"],"appetite":"Two weeks"}', '', 'First sales')$q$, v)) is not null,
    'a change of plan gave no why';
  assert pg_temp.refused_as_owner(format($q$update knowledge.records set plan = '{"outcomes":["x"],"appetite":"y"}' where id = %L$q$, v)) like 'A plan changes only through knowledge.replan%',
    'a plan was edited in place';
  assert pg_temp.refused_as_owner(format($q$delete from knowledge.history where record_id = %L$q$, v)) like 'History is append-only%',
    'an earlier plan was deleted';
  perform pg_temp.act('build');
  assert pg_temp.refused(format($q$select knowledge.replan(%L, '{"outcomes":["First sales"],"appetite":"Two weeks"}', 'shorter', 'First sales')$q$, v)) is not null,
    'a building key changed the plan';
end $$;

-- test: one call each for what a version held on any date and what changed between two dates, with the whys
-- [guards F127.5]
do $$
declare
  v text := current_setting('t.v');
  c record;
  n integer;
begin
  perform knowledge.replan(v, jsonb_build_object(
    'outcomes', jsonb_build_array('First sales'), 'appetite', 'Six weeks',
    'includes', jsonb_build_array('F900-S1', 'F900-S2', 'F901-S1'),
    'leaves_out', jsonb_build_array(
      jsonb_build_object('slice', 'F901-S2', 'reason', 'Card payments are not ready.', 'condition', current_setting('t.card')),
      jsonb_build_object('slice', 'F902-S1', 'reason', 'Sellers need sales before a dashboard of them.'))),
    'The next version is about getting sellers paid.', 'More Pages', null, '2026-11-10 09:00');
  assert knowledge.plan_as_of(v, '2026-11-02')->'outcomes' = '["More Pages"]', 'the plan on a past day is not as it was';
  assert knowledge.plan_as_of(v, '2026-11-11')->'outcomes' = '["First sales"]', 'the plan today is not the new one';
  assert knowledge.plan_as_of(v, '2026-10-01') is null, 'a plan read before it existed';
  -- A past plan shows its slices as they were that day, not as they are now.
  perform knowledge.revise('F900-S1', '{"status":"shipped"}', 'Shipped.', null, '2026-11-08');
  assert (select i->>'status' from jsonb_array_elements(knowledge.plan_as_of(v, '2026-11-05')->'includes') i where i->>'slice' = 'F900-S1') = 'planned',
    'a past plan shows a slice''s status from after that day';
  assert (select i->>'status' from jsonb_array_elements(knowledge.plan_as_of(v, now())->'includes') i where i->>'slice' = 'F900-S1') = 'shipped',
    'today''s plan does not show the slice as shipped';

  select count(*) into n from knowledge.plan_changes('2026-11-05', '2026-11-11');
  assert n = 1, format('expected one change between the two dates, got %s', n);
  select * into c from knowledge.plan_changes('2026-11-05', '2026-11-11', v);
  assert c.why = 'The next version is about getting sellers paid.' and c.outcome = 'More Pages',
    format('the change does not carry its why and outcome: %s', to_jsonb(c));
  assert c.outcomes_before = '["More Pages"]' and c.outcomes_after = '["First sales"]', 'the outcomes before and after are missing';
  assert c.included = array['F901-S1'] and c.dropped = array['F902-S1'], format('in and out are wrong: %s', to_jsonb(c));
  assert c.left_out = array['F902-S1'] and c.brought_back = array['F901-S1'], format('left out and brought back are wrong: %s', to_jsonb(c));
  assert (select count(*) from knowledge.plan_changes('2026-10-01', '2026-11-05', v)) = 1,
    'the first plan is not listed as a change in its own window';
  assert (select count(*) from knowledge.plan_changes('2026-11-11', '2027-01-01', v)) = 0,
    'a change outside the window was listed';
  -- A change of status alone is not a change of plan.
  perform knowledge.revise(v, '{"status":"current"}', 'Starting it.');
  assert (select count(*) from knowledge.plan_changes('2026-11-05', now(), v)) = 1,
    'a status change was listed as a change of plan';
end $$;

-- test: a left-out slice is listed again when its condition is met or the outcome it served changes
-- [guards F127.6]
do $$
declare
  v text := current_setting('t.v');
  due text[];
begin
  assert not exists (select 1 from knowledge.left_out_due(v)), 'a leave-out was due before anything changed';
  -- The outcome changes: the leave-out decided under "More Pages" is listed again.
  perform knowledge.replan(v, jsonb_build_object(
    'outcomes', jsonb_build_array('First sales'), 'appetite', 'Six weeks',
    'includes', jsonb_build_array('F900-S1', 'F900-S2', 'F902-S1'),
    'leaves_out', jsonb_build_array(
      jsonb_build_object('slice', 'F901-S2', 'reason', 'Card payments are not ready.', 'condition', current_setting('t.card')),
      jsonb_build_object('slice', 'F901-S1', 'reason', 'Pages first.'))),
    'Getting sellers paid.', 'First sales', null, '2026-11-10 09:00');
  select array_agg(d.slice order by d.slice) into due from knowledge.left_out_due(v) d;
  assert due = array['F901-S1', 'F901-S2'], format('leave-outs under the old outcome are not listed again: %s', due);
  -- Re-deciding one with a new reason under the new outcome settles it.
  perform knowledge.replan(v, jsonb_build_object(
    'outcomes', jsonb_build_array('First sales'), 'appetite', 'Six weeks',
    'includes', jsonb_build_array('F900-S1', 'F900-S2', 'F902-S1'),
    'leaves_out', jsonb_build_array(
      jsonb_build_object('slice', 'F901-S2', 'reason', 'Card payments are still not ready.', 'condition', current_setting('t.card')),
      jsonb_build_object('slice', 'F901-S1', 'reason', 'Pay-at-pickup sells nothing online yet.'))),
    'Looked at again under first sales.', 'First sales', null, '2026-11-10 10:00');
  assert not exists (select 1 from knowledge.left_out_due(v)), 'a leave-out re-decided under the new outcome is still listed';
  -- Its condition is met: the parked card pre-orders show up on their own.
  perform knowledge.set_condition(current_setting('t.card'), 'met', 'Card payments work.');
  select array_agg(d.slice) into due from knowledge.left_out_due(v) d;
  assert due = array['F901-S2'], format('a leave-out whose condition is met is not listed again: %s', due);
  assert (select d.due from knowledge.left_out_due(v) d) like '%is met%', 'the listing does not say why it is back';
  -- A condition withdrawn brings nothing back on its own: the slice is listed again too.
  perform knowledge.set_condition(current_setting('t.card'), 'withdrawn', 'Cards are off the table.');
  assert (select d.due from knowledge.left_out_due(v) d where d.slice = 'F901-S2') like '%was withdrawn%',
    'a leave-out whose condition was withdrawn is not listed again';
end $$;

-- test: today's plan reads as Now, Next and Later from the store, by rank, with what each slice waits on
-- [guards F127.7 partial: bringing the scenarios' frontmatter in, which tests/knowledge-plans.test.ts checks]
do $$
declare
  lanes text[];
begin
  select array_agg(r.horizon || ':' || r.slice order by n) into lanes from knowledge.roadmap() with ordinality r(horizon, rank, slice, answer, status, feature, feature_answer, waits_on, n);
  assert lanes = array['now:F900-S1', 'now:F900-S2', 'next:F901-S1', 'next:F902-S1', 'later:F901-S2'],
    format('the lanes are wrong: %s', lanes);
  assert (select r.waits_on from knowledge.roadmap() r where r.slice = 'F901-S2') = array[current_setting('t.card')],
    'a parked slice does not say what it waits on';
  perform knowledge.revise('F900-S1', '{"status":"shipped"}', 'Shipped.');
  assert not exists (select 1 from knowledge.roadmap() r where r.slice = 'F900-S1'), 'a shipped slice is still on the roadmap';
end $$;
