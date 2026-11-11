-- F132: story maps in the store. Scenario: socialus-plan planning/scenario-F132.md.
--
-- Run by tests/knowledge-maps-db.test.ts, as the F125 to F130 suites are:
-- each "-- test:" block in its own transaction, after the preamble, rolled
-- back. A block passes when it runs without an error; every assert names what
-- went wrong.
--
-- Bringing today's maps in, and the lookup tool's words, are tested where
-- they live: tests/knowledge-maps.test.ts.

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
grant knowledge_store to current_user;
set local role knowledge_store;
select pg_temp.act('ops');

-- A small map: a neighbour finds something this weekend and goes.
select knowledge.map_item('{"id":"JT","kind":"journey","answer":"A neighbour finds something this weekend and goes","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A1","kind":"activity","parent":"JT","answer":"Find out","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A2","kind":"activity","parent":"JT","answer":"Commit","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A1.T1","kind":"task","parent":"JT.A1","answer":"See this weekend nearby","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A1.T2","kind":"task","parent":"JT.A1","answer":"Narrow it to one kind of thing","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A2.T1","kind":"task","parent":"JT.A2","answer":"Say I am going","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A1.T1.D1","kind":"detail","parent":"JT.A1.T1","answer":"List of events near me, soonest first","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A1.T1.D2","kind":"detail","parent":"JT.A1.T1","answer":"Map view","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A2.T1.D1","kind":"detail","parent":"JT.A2.T1","answer":"One tap going","status":"live"}', 'F132 test');
select knowledge.map_item('{"id":"JT.A2.T1.D2","kind":"detail","parent":"JT.A2.T1","answer":"Add to calendar","status":"live"}', 'F132 test');
select knowledge.record('{"id":"F990","kind":"feature","answer":"What is happening this week","status":"shipped","audience":"department","departments":["building"]}', 'F132 test');
select knowledge.record('{"id":"F991","kind":"feature","answer":"Someone says they are coming","status":"approved","audience":"department","departments":["building"]}', 'F132 test');
select knowledge.place('F990', 'JT.A1.T1.D1', 'F132 test: the list is this feature');
select knowledge.place('F991', 'JT.A2.T1.D1', 'F132 test: going is this feature');
select knowledge.map_slice('JT', 'A neighbour finds one thing and turns up', array['JT.A1.T1.D1', 'JT.A2.T1.D1'], 'next', 1, 'F132 test');
select knowledge.map_slice('JT', 'They come back next weekend', array['JT.A2.T1.D2'], 'later', 1, 'F132 test');

-- test: a journey, its activities left to right, tasks in order, details by priority, each knowing its parent
-- [guards F132.1]
do $$
declare
  m jsonb := knowledge.map_of('JT');
  new_id text;
begin
  assert (select array_agg(a->>'answer') from jsonb_array_elements(m->'activities') a) = array['Find out', 'Commit'],
    format('activities are not left to right: %s', m->'activities');
  assert (select array_agg(t->>'id') from jsonb_array_elements(m->'activities'->0->'tasks') t) = array['JT.A1.T1', 'JT.A1.T2'],
    'tasks are not in order under their activity';
  assert (select array_agg(d->>'id') from jsonb_array_elements(m->'activities'->0->'tasks'->0->'details') d) = array['JT.A1.T1.D1', 'JT.A1.T1.D2'],
    'details are not top to bottom';
  assert (select parent from knowledge.records where id = 'JT.A1.T1.D2') = 'JT.A1.T1', 'a detail does not know its task';
  -- A task cannot sit straight under a journey, nor a detail under an activity.
  assert pg_temp.refused($q$select knowledge.map_item('{"kind":"task","parent":"JT","answer":"x","status":"live"}', 't')$q$) like 'A task sits under a activity%',
    'a task was put straight under a journey';
  assert pg_temp.refused($q$select knowledge.map_item('{"kind":"detail","parent":"JT.A1","answer":"x","status":"live"}', 't')$q$) is not null,
    'a detail was put under an activity';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"task","answer":"x","status":"live","audience":"public"}', 't')$q$) is not null,
    'a task was made with no parent or place';
  -- A new item goes last under its parent.
  new_id := knowledge.map_item('{"kind":"detail","parent":"JT.A1.T1","answer":"Saved searches","status":"live"}', 't');
  assert (select place from knowledge.records where id = new_id) = 3, 'a new detail did not go last';
end $$;

-- test: a move is a new version with its why, and only an operator rules on the map
-- [guards F132.1]
do $$
declare
  v integer;
  new_id text;
begin
  perform knowledge.map_move('JT.A1.T1.D2', 'JT.A1.T1', 1, 'Members asked for the map first');
  select version into v from knowledge.records where id = 'JT.A1.T1.D2';
  assert v = 2, format('a move is not a new version: %s', v);
  assert (select reason from knowledge.history where record_id = 'JT.A1.T1.D2' and version = 2) = 'Members asked for the map first',
    'a move does not keep its why';
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.map_item('{"kind":"task","parent":"JT.A1","answer":"x","status":"live"}', 't')$q$) like 'Any key may propose%',
    'a builder recorded a live task';
  new_id := knowledge.map_item('{"kind":"task","parent":"JT.A1","answer":"Ask a neighbour"}', 't');
  assert (select status from knowledge.records where id = new_id) = 'proposed', 'a builder could not propose a task';
  assert pg_temp.refused($q$select knowledge.map_move('JT.A1.T1.D1', 'JT.A1.T1', 5, 't')$q$) is not null, 'a builder moved an item';
  assert pg_temp.refused($q$select knowledge.revise('JT.A1.T1', '{"answer":"x"}', 't')$q$) is not null, 'a builder changed a live task';
end $$;

-- test: one call returns an item's place, what sits around it, and what it is made of
-- [guards F132.2]
do $$
declare
  p jsonb := knowledge.map_place('JT.A1.T1');
begin
  assert p->'place'->'journey'->>'id' = 'JT' and p->'place'->'activity'->>'id' = 'JT.A1' and p->'place'->'task'->>'id' = 'JT.A1.T1',
    format('the place is not journey, activity and task: %s', p->'place');
  assert p->'before' = 'null'::jsonb or p->'before' is null, 'the first task has something before it';
  assert p->'after'->>'id' = 'JT.A1.T2', format('the next task is not around it: %s', p->'after');
  assert (select array_agg(d->>'id') from jsonb_array_elements(p->'made_of') d) = array['JT.A1.T1.D1', 'JT.A1.T1.D2'],
    format('it is not made of its details: %s', p->'made_of');
  assert (select array_agg(f->>'id') from jsonb_array_elements(p->'features') f) = array['F990'], 'the features under it are missing';
  -- Asked about a detail, the answer still names the whole path up.
  assert knowledge.map_place('JT.A2.T1.D2')->'place'->'activity'->>'answer' = 'Commit', 'a detail does not know its activity';
end $$;

-- test: a slice is a line across one journey named by its outcome, and every task shows the slices that include it and whether it is built
-- [guards F132.3]
do $$
declare
  m jsonb := knowledge.map_of('JT');
  p jsonb;
begin
  assert jsonb_array_length(m->'slices') = 2 and m->'slices'->0->>'outcome' = 'A neighbour finds one thing and turns up',
    format('the journey''s slices are missing: %s', m->'slices');
  assert exists (select 1 from knowledge.links where from_id = 'JT-S1' and to_id = 'JT' and type = 'slice_of'), 'the slice does not belong to its journey';
  p := knowledge.map_place('JT.A2.T1');
  assert (select array_agg(s->>'id' order by s->>'id') from jsonb_array_elements(p->'slices') s) = array['JT-S1', 'JT-S2'],
    format('a task does not show the slices that include it: %s', p->'slices');
  assert knowledge.built('JT.A1.T1') = 'built', 'a task whose top detail a shipped feature serves is not built';
  assert knowledge.built('JT.A2.T1') = 'not', 'a task with nothing built reads as built';
  assert knowledge.built('JT') = 'partly', 'a half-built journey is not partly built';
  -- Built follows the slice when it ships.
  perform knowledge.revise('JT-S1', '{"status":"shipped"}', 'F132 test: shipped');
  assert knowledge.built('JT.A2.T1') = 'built', 'a task under a shipped slice is not built';
  -- A slice takes only items of its own journey, and its line moves only with a reason.
  perform knowledge.map_item('{"id":"JO","kind":"journey","answer":"Other","status":"live"}', 't');
  assert pg_temp.refused($q$select knowledge.map_slice('JO', 'x', array['JT.A1.T1'], 'later', 1, 't')$q$) like 'A slice takes tasks and details of its own journey%',
    'a slice took another journey''s task';
  assert pg_temp.refused($q$select knowledge.map_slice('JT', ' ', '{}', 'later', 1, 't')$q$) is not null, 'a slice with no outcome was drawn';
  perform knowledge.map_retake('JT-S2', array['JT.A2.T1.D2', 'JT.A1.T1.D2'], 'Map view moves up with calendar');
  assert (select takes from knowledge.records where id = 'JT-S2') = array['JT.A2.T1.D2', 'JT.A1.T1.D2'], 'the line did not move';
  assert pg_temp.refused($q$select knowledge.revise('JT-S2', '{"takes":["JT.A1.T1"]}', 't')$q$) is not null, 'a line moved through revise';
end $$;

-- test: proposing a change to an item answers with the journey around it, its slices and features, and what is built, before it is decided
-- [guards F132.4]
do $$
declare
  out jsonb;
  pid bigint;
begin
  perform pg_temp.act('build');
  out := knowledge.map_propose('JT.A1.T1.D1', '{"answer":"List of events near me, soonest first, with a time"}', 'Owners asked');
  pid := (out->>'proposal')::bigint;
  assert out->'picture'->'place'->'journey'->>'id' = 'JT', format('the proposal does not show the journey: %s', out);
  assert out->'picture'->'slices'->0->>'id' = 'JT-S1', 'the proposal does not show the slices it touches';
  assert out->'picture'->'features'->0->>'id' = 'F990', 'the proposal does not show the features it touches';
  assert out->'picture'->'item'->>'built' = 'built', 'the proposal does not say what is built';
  assert (select answer from knowledge.records where id = 'JT.A1.T1.D1') = 'List of events near me, soonest first',
    'a proposal changed the item before it was decided';
  assert pg_temp.refused(format('select knowledge.map_decide(%s, true, %L)', pid, 't')) is not null, 'a builder decided a proposal';
  perform pg_temp.act('ops');
  perform knowledge.map_decide(pid, true, 'Yes');
  assert (select answer from knowledge.records where id = 'JT.A1.T1.D1') like '%with a time', 'an accepted proposal was not applied';
  assert pg_temp.refused(format('select knowledge.map_decide(%s, false, %L)', pid, 't')) like '%already decided%', 'a proposal was decided twice';
  -- A move proposal also shows where it would go.
  out := knowledge.map_propose('JT.A1.T2', '{"parent":"JT.A2"}', 'Narrowing is part of committing');
  assert out->'moving_to'->'item'->>'id' = 'JT.A2', 'a move proposal does not show where it would go';
  assert pg_temp.refused($q$select knowledge.map_propose('JT.A1.T2', '{"parent":"JT"}', 't')$q$) is not null, 'a task was proposed under a journey';
end $$;

-- test: a new idea in plain words names the task it would sit under, or no journey yet
-- [guards F132.5 partial: what it stands on, needs first and clashes with is the placing agent's reading; here, the call that returns them]
do $$
declare
  hit record;
begin
  select * into hit from knowledge.fit('events near me this weekend') limit 1;
  assert hit.on_id in ('JT.A1.T1', 'JT.A1.T1.D1'), format('the idea did not land on its task: %s', to_jsonb(hit));
  assert not exists (select 1 from knowledge.fit('a chess ladder for retirees')), 'an idea with no home landed somewhere';
  -- An idea placed by an agent carries what it stands on, needs first and clashes with.
  perform knowledge.record('{"kind":"concept","answer":"Holiday specials up front","status":"idea","audience":"department","departments":["building"]}', 't');
  perform knowledge.place((select id from knowledge.records where kind = 'concept' and answer = 'Holiday specials up front'),
                          'JT.A1.T1', 'Specials are things happening this weekend', array['F990'], array['A special kind of post'], '{}');
  assert (select p.needs_first from knowledge.current_placements p join knowledge.records c on c.id = p.item_id
           where c.answer = 'Holiday specials up front') = array['A special kind of post'], 'the placement lost what must be built first';
  -- The same place twice is one row; "no journey yet" is a placement too.
  perform knowledge.place('F991', 'JT.A2.T1.D1', 'F132 test: going is this feature');
  assert (select count(*) from knowledge.placements where item_id = 'F991') = 1, 'the same place made two rows';
  perform knowledge.place('F991', null, 'Not a member journey');
  assert (select on_id from knowledge.current_placements where item_id = 'F991') is null, 'no journey yet was not kept';
  -- A guess never replaces a stated place.
  perform knowledge.place('F990', 'JT.A2.T1', 'a guess', '{}', '{}', '{}', 'inferred');
  assert (select on_id from knowledge.current_placements where item_id = 'F990') = 'JT.A1.T1.D1', 'a guess replaced a stated place';
  assert pg_temp.refused($q$select knowledge.place('F990', 'JT.A1', 'x')$q$) like '%sits on a task or a detail%', 'a feature sat on an activity';
end $$;

-- test: placements and proposals are append-only, and a key that cannot see a record sees none of its map
do $$
begin
  reset role;
  assert pg_temp.refused('delete from knowledge.placements') is not null, 'a placement was deleted';
  assert pg_temp.refused('truncate knowledge.map_proposals') is not null, 'proposals were truncated';
  assert pg_temp.refused('update knowledge.placements set reason = ''x''') is not null, 'a placement was rewritten';
  set local role knowledge_store;
  perform set_config('knowledge.key', '', true);
  assert (select count(*) from knowledge.placements) = 0, 'no key reads placements';
  assert knowledge.map_of('JT') is null, 'no key reads the map';
end $$;
