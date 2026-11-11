-- F129: what SocialUs can and can't do. Scenario: socialus-plan
-- planning/scenario-F129.md.
--
-- Run by tests/knowledge-capabilities-db.test.ts, as the other knowledge
-- suites are: each "-- test:" block in its own transaction, after the
-- preamble, rolled back. A block passes when it runs without an error; every
-- assert names what went wrong.
--
-- Which lines are "can" (shipped, checked and proven live), the words, the
-- answer's length and the lookup tool's verb are tested where the generator
-- lives: tests/knowledge-capabilities.test.ts.

-- preamble
select set_config('t.ops',   knowledge.add_agent('t-ops',   'the PM',    '{}',         true),  true);
select set_config('t.build', knowledge.add_agent('t-build', 'a builder', '{building}', false), true);
select set_config('t.none',  knowledge.add_agent('t-none',  'a chat project', '{}',     false), true);
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

select set_config('t.card', knowledge.record(
  '{"kind":"condition","concern":"payments","answer":"Card payments work","why":"Pre-orders need them.","owner":"the PM","audience":"public"}',
  'F129 test'), true);
select knowledge.record('{"id":"F950","kind":"feature","answer":"Page owners post events","status":"shipped","audience":"department","departments":["building"]}', 'F129 test');
select knowledge.record('{"id":"F951","kind":"feature","answer":"Pre-orders","status":"approved","audience":"department","departments":["building"]}', 'F129 test');
select set_config('t.post', knowledge.set_capability(
  '{"source":"words#F950:1","answer":"Post an event from your Page","who":["runner"],"status":"can","feature":"F950"}', 'F129 test')->>'id', true);
select set_config('t.pre', knowledge.set_capability(
  jsonb_build_object('source', 'words#F951:1', 'answer', 'Take card pre-orders', 'who', jsonb_build_array('runner'),
                     'status', 'cant_yet', 'feature', 'F951', 'waits_on', current_setting('t.card')), 'F129 test')->>'id', true);
select knowledge.set_capability(
  '{"source":"words#F950:2","answer":"See what is on near you","who":["visitor","member"],"status":"can","feature":"F950"}', 'F129 test');

-- test: one answer by who is asking, each line a capability for its kinds of person
-- [guards F129.1 partial: the answer's wording and grouping are the lookup tool's, in tests/knowledge-capabilities.test.ts]
do $$
declare
  runner text[];
  visitor text[];
begin
  select array_agg(c.words order by c.words) into runner from knowledge.capabilities('runner') c;
  select array_agg(c.words order by c.words) into visitor from knowledge.capabilities('visitor') c;
  assert runner = array['Post an event from your Page', 'Take card pre-orders'], format('the runner''s lines are wrong: %s', runner);
  assert visitor = array['See what is on near you'], format('the visitor''s lines are wrong: %s', visitor);
  assert (select count(*) from knowledge.capabilities()) = 3, 'all lines are not listed when nobody is named';
  assert current_setting('t.post') ~ '^CA-\d{4}$', format('a capability id is CA-nnnn, not %s', current_setting('t.post'));
  assert pg_temp.refused($q$select knowledge.set_capability('{"source":"x","answer":"x","who":["owner"],"status":"can","feature":"F950"}', 'F129 test')$q$) is not null,
    'a capability was for a kind of person that is not visitor, member or runner';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"capability","answer":"x","status":"can"}', 'F129 test')$q$) like 'A capability says who it is for%',
    'a capability was recorded with no one it is for';
  -- Capabilities are public: a key with no department reads them, each with its feature.
  perform pg_temp.act('none');
  assert (select count(*) from knowledge.capabilities()) = 3, 'a key with no department cannot read the answer';
  perform pg_temp.act('ops');
end $$;

-- test: a can't-yet line names the condition it waits on, in that condition's words, or says why
-- [guards F129.4]
do $$
declare
  r record;
begin
  select * into r from knowledge.capabilities('runner') c where c.id = current_setting('t.pre');
  assert r.status = 'cant_yet' and r.waits_on = current_setting('t.card') and r.waits_on_words = 'Card payments work',
    format('a can''t-yet line does not name its condition in words: %s', to_jsonb(r));
  assert pg_temp.refused($q$select knowledge.set_capability('{"source":"words#F951:2","answer":"Refunds","who":["runner"],"status":"cant_yet","feature":"F951"}', 'F129 test')$q$) is not null,
    'a can''t-yet line was recorded with no why and no condition';
  assert pg_temp.refused($q$select knowledge.set_capability('{"source":"words#F951:2","answer":"Refunds","who":["runner"],"status":"cant_yet","why":"Soon.","feature":"F951"}', 'F129 test')$q$)
         like 'A can''t-yet line names the condition it waits on%',
    'a can''t-yet line was recorded with a reason that is neither a condition, not built yet, nor built and waiting on its checks';
  perform knowledge.set_capability('{"source":"words#F951:4","answer":"Refunds","who":["runner"],"status":"cant_yet","why":"Built, waiting on its checks.","feature":"F951"}', 'F129 test');
  perform knowledge.set_capability('{"source":"words#F951:3","answer":"Barter","who":["member"],"status":"not_planned","feature":"F951"}', 'F129 test');
  assert (select c.status from knowledge.capabilities('member') c where c.words = 'Barter') = 'not_planned',
    'a not-planned line is not listed as not planned';
  -- When the condition is met, the line no longer names it as what it waits on.
  perform knowledge.set_condition(current_setting('t.card'), 'met', 'Cards work.');
  assert (select c.waits_on from knowledge.capabilities('runner') c where c.id = current_setting('t.pre')) is null,
    'a met condition is still named as what a line waits on';
end $$;

-- test: each line is linked to its feature, and the answer is one call
-- [guards F129.5 partial: the lookup tool's can_do verb is tested in tests/knowledge-capabilities.test.ts]
do $$
begin
  assert (select array_agg(distinct c.feature) from knowledge.capabilities('runner') c) = array['F950', 'F951'],
    'a line is not linked to its feature';
  -- The same for a key with no department, though the features are filed under building.
  perform pg_temp.act('none');
  assert (select array_agg(distinct c.feature) from knowledge.capabilities('runner') c) = array['F950', 'F951'],
    'a key with no department reads the lines without their features';
  assert (select c.waits_on_words from knowledge.capabilities('runner') c where c.id = current_setting('t.pre')) = 'Card payments work',
    'a key with no department does not read a public condition''s words';
  perform pg_temp.act('ops');
  perform knowledge.revise(current_setting('t.card'), '{"audience":"operators"}', 'F129 test: hide the condition');
  perform pg_temp.act('none');
  assert (select c.waits_on_words from knowledge.capabilities('runner') c where c.id = current_setting('t.pre')) = 'something not yet public',
    'a condition this key cannot read was named to it';
  perform pg_temp.act('ops');
  assert exists (select 1 from knowledge.links l where l.from_id = current_setting('t.post') and l.to_id = 'F950' and l.type = 'capability_of'),
    'the feature link is not a capability_of link';
  assert pg_temp.refused(format($q$select knowledge.link(%L, 'F951', 'capability_of')$q$, current_setting('t.post'))) is not null,
    'a line was linked to a second feature';
  assert pg_temp.refused(format($q$select knowledge.link(%L, %L, 'capability_of')$q$, current_setting('t.pre'), current_setting('t.card'))) like 'A capability is a capability_of a feature%',
    'a line was linked to something that is not a feature';
  assert pg_temp.refused($q$select knowledge.set_capability('{"source":"words#F950:1","answer":"Post an event from your Page","who":["runner"],"status":"can","feature":"F951"}', 'F129 test')$q$) is not null,
    'a line moved feature in place';
end $$;

-- test: a line keeps its id, a change of status is a new version with its reason, the same line twice is no change, and only an operator writes
-- [guards F129.7 partial: which lines the live smoke moves is the generator's, in tests/knowledge-capabilities.test.ts]
do $$
declare
  cid text := current_setting('t.post');
  out jsonb;
begin
  out := knowledge.set_capability('{"source":"words#F950:1","answer":"Post an event from your Page","who":["runner"],"status":"can","feature":"F950"}', 'again');
  assert out->>'id' = cid and (out->>'changed')::boolean = false and (select count(*) from knowledge.history where record_id = cid) = 1,
    'the same line twice was a change';
  out := knowledge.set_capability('{"source":"words#F950:1","answer":"Post an event from your Page","who":["runner"],"status":"cant_now","why":"The overnight check found a problem on the Page screen.","feature":"F950"}',
                                  'The live smoke failed on page.');
  assert out->>'id' = cid and (out->>'version')::int = 2, format('a status change is not a new version of the same line: %s', out);
  assert (select reason from knowledge.history where record_id = cid and version = 2) = 'The live smoke failed on page.',
    'the change does not carry its reason';
  assert (select c.status from knowledge.capabilities('runner') c where c.id = cid) = 'cant_now', 'the line did not move to can''t right now';
  perform knowledge.set_capability('{"source":"words#F950:1","answer":"Post an event from your Page","who":["runner"],"status":"can","feature":"F950"}', 'The smoke passes again.');
  assert (select c.status from knowledge.capabilities('runner') c where c.id = cid) = 'can', 'the line did not come back when the smoke passed';
  perform knowledge.set_capability('{"source":"words#F950:1","answer":"Post an event from your Page","who":["runner"],"status":"withdrawn","feature":"F950"}', 'Dropped from the list.');
  assert not exists (select 1 from knowledge.capabilities() c where c.id = cid), 'a withdrawn line is still listed';
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.set_capability('{"source":"words#F950:9","answer":"x","who":["member"],"status":"can","feature":"F950"}', 'F129 test')$q$) is not null,
    'a building key wrote a capability';
end $$;
