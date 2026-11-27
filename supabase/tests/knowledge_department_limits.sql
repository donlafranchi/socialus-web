-- The department-limits switch (knowledge.settings 'department_limits').
-- Off: every registered key counts as the PM's own. On: the old refusals
-- return. Run by tests/knowledge-department-limits-db.test.ts, in the shape
-- of knowledge_store.sql: each "-- test:" block runs in its own transaction
-- after the preamble and is rolled back.
--
-- The migration ships the switch OFF, and these tests start from that. Every
-- other knowledge suite turns it on in its own preamble, because it tests the
-- limits.

-- preamble
select set_config('t.ops',   knowledge.add_agent('t-ops',   'the PM',    '{}',         true),  true);
select set_config('t.build', knowledge.add_agent('t-build', 'a builder', '{building}', false), true);
select set_config('t.tns',   knowledge.add_agent('t-tns',   'a moderator', '{trust-and-safety}', false), true);
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
-- a record only the PM's key can see, decided by the PM, and one proposed by a department agent
select knowledge.set_department_limits(true, 'build the fixtures under the limits');
set local role knowledge_store;
select pg_temp.act('ops');
select set_config('t.pm_rec', knowledge.record(
  '{"kind":"decision","concern":"posts","answer":"A post lasts a week.","why":"Fresh is local.","audience":"operators"}', 'fixture'), true);
select set_config('t.new_rec', knowledge.record(
  '{"kind":"decision","concern":"posts","answer":"A post lasts two weeks.","why":"Slower towns.","audience":"operators"}', 'fixture'), true);
select pg_temp.act('build');
select set_config('t.prop', knowledge.record(
  '{"kind":"pattern","answer":"Say what we do, not what we never do.","why":"A promise is a debt.","audience":"public"}', 'fixture'), true);
reset role;
select knowledge.set_department_limits(false, 'the shipped state: limits off');
set local role knowledge_store;

-- test: the migration ships the limits off, and a missing setting means on
-- [guards F125.8 partial: the switch's two states]
reset role;
do $$ begin
  assert not knowledge.department_limits_on(), 'the limits are on after the preamble set them off';
  delete from knowledge.settings where key = 'department_limits';
  assert knowledge.department_limits_on(), 'a missing setting did not mean the limits are on';
end $$;

-- test: off: a department agent sees everything and acts as the PM's own
-- [guards F125.8 partial: the switch off]
do $$
declare
  r jsonb;
begin
  perform pg_temp.act('build');
  assert exists (select 1 from knowledge.records where id = current_setting('t.pm_rec')),
    'off: a building key could not read an operators record';
  assert (knowledge.whoami()->>'operator')::boolean, 'off: whoami did not count the key as the PM''s own';

  -- retire a PM-decided record, in the PM's name
  r := knowledge.retire(current_setting('t.pm_rec'), current_setting('t.new_rec'), 'two weeks suits slower towns');
  assert r->>'refused' is null, 'off: a building key could not retire a PM-decided record';
  assert (select status from knowledge.records where id = current_setting('t.pm_rec')) <> 'live',
    'off: the retired record is still live';

  -- decide a proposed practice
  assert (select status from knowledge.records where id = current_setting('t.prop')) = 'proposed', 'fixture: not proposed';
  r := knowledge.decide(current_setting('t.prop'), 'agreed');
  assert r->>'refused' is null, 'off: a building key could not decide a proposal';
  assert (select status from knowledge.records where id = current_setting('t.prop')) = 'live', 'off: the proposal was not decided';

  -- and a different department's key, the same
  perform pg_temp.act('tns');
  assert exists (select 1 from knowledge.records where id = current_setting('t.new_rec')),
    'off: a trust-and-safety key could not read an operators record';
end $$;

-- test: off: the settled flag still holds for every key, and a key cannot reach the switch
-- [guards F125.7 partial: settled is the PM's rule, not a department limit]
do $$
declare
  r jsonb;
begin
  perform pg_temp.act('ops');
  perform knowledge.set_settled(current_setting('t.new_rec'), true, 'the PM: do not re-raise');
  perform pg_temp.act('build');
  r := knowledge.revise(current_setting('t.new_rec'), '{"answer":"A post lasts a day."}', 'try');
  assert r->>'refused' is not null, 'off: a settled record was changed by a building key';
  r := knowledge.retire(current_setting('t.new_rec'), null, 'try');
  assert r->>'refused' is not null, 'off: a settled record was retired by a building key';

  assert pg_temp.refused('select knowledge.set_department_limits(true, ''x'')') ~ 'permission denied',
    'a key could flip the switch';
  assert pg_temp.refused('select * from knowledge.settings') ~ 'permission denied',
    'a key could read the settings';
  assert pg_temp.refused('update knowledge.settings set value = ''on''') ~ 'permission denied',
    'a key could write the settings';
  assert pg_temp.refused('select knowledge.add_agent(''t-new'', ''x'', ''{}'', true)') ~ 'permission denied',
    'off: a key could register another key';
  assert pg_temp.refused('select knowledge.revoke_agent(''t-ops'')') ~ 'permission denied',
    'off: a key could revoke a key';
end $$;

-- test: on: the old refusals return
-- [guards F125.8 partial: the switch back on]
reset role;
select knowledge.set_department_limits(true, 'departments exist');
set local role knowledge_store;
do $$
begin
  perform pg_temp.act('build');
  assert not (knowledge.whoami()->>'operator')::boolean, 'on: a building key still counts as the PM''s own';
  assert not exists (select 1 from knowledge.records where id = current_setting('t.pm_rec')),
    'on: a building key could read an operators record';
  assert pg_temp.refused(format('select knowledge.retire(%L, %L, %L)', current_setting('t.pm_rec'), current_setting('t.new_rec'), 'x')) is not null,
    'on: a building key retired a PM-decided record';
  assert pg_temp.refused(format('select knowledge.decide(%L, %L)', current_setting('t.prop'), 'agreed')) ~ 'operator',
    'on: a building key decided a proposal';
  assert pg_temp.refused(format('select knowledge.set_settled(%L, true, %L)', current_setting('t.prop'), 'x')) ~ 'operator',
    'on: a building key settled a record';

  perform pg_temp.act('ops');
  assert exists (select 1 from knowledge.records where id = current_setting('t.pm_rec')),
    'on: the operator key lost sight of its own record';
end $$;
