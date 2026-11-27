-- The department-limits switch (knowledge.settings 'department_limits').
-- Off: every registered key sees every record and does ordinary work, but
-- the overrule powers stay with the PM's own key (#1549, the PM 2026-11-27).
-- On: the old refusals return. Run by tests/knowledge-department-limits-db.test.ts, in the shape
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
-- the status of a record written in an earlier statement (a statement cannot see its own insert)
create function pg_temp.status_of(p_id text) returns text language sql volatile as $$
  select status from knowledge.records where id = p_id
$$;
create function pg_temp.ring(p_kind text) returns jsonb language sql immutable as $$
  select case when p_kind = 'practice' then '{"ring":"trial","scope":"process"}'::jsonb else '{}'::jsonb end
$$;
do $$ begin execute format('grant usage on schema %s to knowledge_store', pg_my_temp_schema()::regnamespace); end $$;
grant knowledge_store to current_user;
-- a record only the PM's key can see, decided by the PM, and one proposed by a department agent
select set_config('knowledge.department_limits', 'on', true);  -- build the fixtures under the limits
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
select set_config('knowledge.department_limits', '', true);  -- back to the shipped state: the table says off
set local role knowledge_store;

-- test: the migration ships the limits off, and a missing setting means on
-- [guards F125.8 partial: the switch's two states]
reset role;
do $$ begin
  assert not knowledge.department_limits_on(), 'the limits are on after the preamble set them off';
  delete from knowledge.settings where key = 'department_limits';
  assert knowledge.department_limits_on(), 'a missing setting did not mean the limits are on';
end $$;

-- test: off: a department agent sees everything and does ordinary work
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

  -- ordinary work: revise a PM-decided record that is not his ruling
  r := knowledge.revise(current_setting('t.new_rec'), '{"answer":"A post lasts two weeks, then fades."}', 'clearer');
  assert r->>'refused' is null, 'off: a building key could not revise an ordinary record';

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

-- test: off: settling and unsettling stay with the PM's key (#1535)
-- [guards F125.7 partial: settling and unsettling stay with the PM's key with the switch off]
do $$
begin
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.set_settled(%L, true, %L)', current_setting('t.new_rec'), 'x')) ~ 'operator',
    'off: a building key settled a record';
  perform pg_temp.act('ops');
  perform knowledge.set_settled(current_setting('t.new_rec'), true, 'the PM: do not re-raise');
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.set_settled(%L, false, %L)', current_setting('t.new_rec'), 'x')) ~ 'operator',
    'off: a building key unsettled a record the PM settled';
  assert (select settled from knowledge.records where id = current_setting('t.new_rec')), 'off: the record is no longer settled';
  perform pg_temp.act('ops');
  assert (knowledge.set_settled(current_setting('t.new_rec'), false, 'the PM reopens it'))->>'settled' = 'false',
    'off: the PM''s key could not unsettle';
end $$;

-- test: off: a record cannot be created settled but by the PM's key (#1535)
do $$
declare
  v_id text;
begin
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","audience":"public","settled":true}', 't')$q$) ~ 'operator',
    'off: a building key created a settled record';
  perform pg_temp.act('ops');
  v_id := knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","audience":"public","settled":true}', 't');
  assert (select settled from knowledge.records where id = v_id),
    'off: the PM''s key could not create a settled record';
end $$;

-- test: off: a condition's check is written only by the PM's key (#1535)
do $$
begin
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","concern":"payments","answer":"x","why":"y","owner":"the PM","audience":"public","checked_by":{"query":"select count(*) from public.members","at_least":1,"line":"members"}}', 't')$q$) ~ 'operator',
    'off: a building key wrote a condition''s check';
end $$;

-- test: off: a condition is marked only by the PM's key (#1535)
do $$
declare
  cid text;
begin
  perform pg_temp.act('ops');
  cid := knowledge.record('{"kind":"condition","concern":"payments","answer":"Card payments work","why":"Pre-orders need them.","owner":"the PM","audience":"public"}', 'fixture');
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.set_condition(%L, %L, %L)', cid, 'met', 'x')) ~ 'operator',
    'off: a building key marked a condition met';
  perform pg_temp.act('ops');
  assert (knowledge.set_condition(cid, 'met', 'the PM checked'))->>'status' = 'met', 'off: the PM''s key could not mark a condition';
end $$;

-- test: off: a part_of link, which makes its parent met, is made only by the PM's key (#1535)
do $$
declare
  v_met text;
  v_parent text;
begin
  perform pg_temp.act('ops');
  v_met := knowledge.record('{"kind":"condition","concern":"payments","answer":"Take a card","why":"z","owner":"the PM","audience":"public"}', 'fixture');
  perform knowledge.set_condition(v_met, 'met', 'fixture');
  v_parent := knowledge.record('{"kind":"condition","concern":"payments","answer":"Payments work","why":"z","owner":"the PM","audience":"public"}', 'fixture');
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', v_met, v_parent, 'part_of')) ~ 'operator',
    'off: a building key linked a met condition part_of another';
  assert knowledge.condition_status(v_parent) = 'not started', 'off: the parent became met';
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

-- test: off: a building key cannot decide, settle or unsettle; the PM's key can
-- [guards F125.7 partial: deciding, settling and unsettling stay with the PM's key]
do $$
declare
  r jsonb;
begin
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.decide(%L, %L)', current_setting('t.prop'), 'agreed')) ~ 'operator',
    'off: a building key decided a proposal';
  assert pg_temp.refused(format('select knowledge.set_settled(%L, true, %L)', current_setting('t.new_rec'), 'x')) ~ 'operator',
    'off: a building key settled a record';
  assert pg_temp.refused('select knowledge.record(''{"kind":"decision","concern":"posts","answer":"x","why":"y","path":"well-worn","settled":true}'', ''x'')') ~ 'settles',
    'off: a building key recorded a settled record';

  perform pg_temp.act('ops');
  r := knowledge.set_settled(current_setting('t.new_rec'), true, 'the PM: do not re-raise');
  assert (r->>'settled')::boolean, 'the PM''s key could not settle';

  -- the hole the review on #1519 reproduced: unsettle, then revise
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.set_settled(%L, false, %L)', current_setting('t.new_rec'), 'x')) ~ 'operator',
    'off: a building key unsettled a record the PM settled';
  r := knowledge.revise(current_setting('t.new_rec'), '{"answer":"A post lasts a day."}', 'try');
  assert r->>'refused' is not null, 'off: a settled record was changed by a building key';

  perform pg_temp.act('ops');
  r := knowledge.set_settled(current_setting('t.new_rec'), false, 'the PM reopens it');
  assert not (r->>'settled')::boolean, 'the PM''s key could not unsettle';
  r := knowledge.decide(current_setting('t.prop'), 'agreed');
  assert r->>'refused' is null and (select status from knowledge.records where id = current_setting('t.prop')) = 'live',
    'the PM''s key could not decide a proposal';
end $$;

-- test: off: a building key cannot put a ruling live, name someone else, date the past or rewrite a ruling; the PM's key can
-- [guards F125.7 partial: philosophies, patterns, practices and new-territory decisions go live only by the PM's key]
do $$
declare
  k text;
  pid text;
  r jsonb;
begin
  perform pg_temp.act('build');
  foreach k in array array['philosophy', 'pattern', 'practice'] loop
    assert pg_temp.refused(format('select knowledge.record(%L, %L)',
      jsonb_build_object('kind', k, 'answer', 'x', 'why', 'y', 'status', 'live') || pg_temp.ring(k), 'x')) ~ 'go live only when the PM decides',
      format('off: a building key put a %s live', k);
    -- left to itself, it is proposed
    assert pg_temp.status_of(knowledge.record(jsonb_build_object('kind', k, 'answer', 'x', 'why', 'y') || pg_temp.ring(k), 'x')) = 'proposed',
      format('off: a building key''s %s did not wait for the PM', k);
  end loop;
  assert pg_temp.status_of(knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","path":"new territory"}', 'x')) = 'proposed',
    'off: a building key''s new-territory decision went live';
  assert pg_temp.status_of(knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y"}', 'x')) = 'proposed',
    'off: a building key''s decision with no path went live';
  assert pg_temp.status_of(knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","path":"well-worn"}', 'x')) = 'live',
    'off: a building key''s well-worn call did not go live (ordinary work)';
  assert pg_temp.refused('select knowledge.record(''{"kind":"decision","concern":"posts","answer":"x","why":"y","path":"well-worn","decided_by":"the PM"}'', ''x'')') ~ 'someone else',
    'off: a building key recorded a decision in the PM''s name';
  assert pg_temp.refused('select knowledge.record(''{"kind":"decision","concern":"posts","answer":"x","why":"y","path":"well-worn"}'', ''x'', null, now() - interval ''1 day'')') ~ 'dates a change in the past',
    'off: a building key dated a change in the past';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.new_rec'), '{"strength":"absolute"}', 'x')) ~ 'how strict',
    'off: a building key changed how strict a record is';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.new_rec'), '{"audience":"public"}', 'x')) ~ 'who may read',
    'off: a building key changed who may read a record';

  -- a live philosophy, the PM's: a building key neither rewrites nor retires it
  perform pg_temp.act('ops');
  pid := knowledge.record('{"kind":"philosophy","answer":"Wealth circulates.","why":"The soul.","status":"live"}', 'the PM');
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', pid, '{"answer":"Wealth is kept."}', 'x')) ~ 'Only the PM changes',
    'off: a building key rewrote a philosophy';
  assert pg_temp.refused(format('select knowledge.retire(%L, null, %L)', pid, 'x')) ~ 'Only the PM changes',
    'off: a building key retired a philosophy';

  perform pg_temp.act('ops');
  assert pg_temp.status_of(knowledge.record('{"kind":"practice","answer":"x","why":"y","status":"live","ring":"trial","scope":"process"}', 'x', null, now() - interval '1 day')) = 'live',
    'the PM''s key could not put a practice live, dated in the past';
  r := knowledge.revise(pid, '{"answer":"Wealth circulates, never extracted."}', 'the PM');
  assert r->>'refused' is null, 'the PM''s key could not revise his philosophy';
end $$;

-- test: off: a building key cannot write a condition's check or mark a condition; the PM's key can
-- [guards F125.7 partial: a condition's check and its marking stay with the PM's key]
do $$
declare
  c text;
  d text;
begin
  perform pg_temp.act('build');
  assert pg_temp.refused('select knowledge.record(''{"kind":"condition","answer":"x","why":"y","owner":"the PM","checked_by":{"query":"select 1","at_least":1}}'', ''x'')') ~ 'check',
    'off: a building key wrote a condition''s check';
  c := knowledge.record('{"kind":"condition","answer":"Beta opens","why":"y","owner":"the PM"}', 'x');
  d := knowledge.record('{"kind":"condition","answer":"A part","why":"y","owner":"the PM"}', 'x');
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', c, '{"checked_by":{"query":"select 1","at_least":1}}', 'x')) ~ 'check',
    'off: a building key wrote a check through revise';
  assert pg_temp.refused(format('select knowledge.set_condition(%L, %L, %L)', c, 'met', 'x')) ~ 'marks a condition',
    'off: a building key marked a condition met';
  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', d, c, 'part_of')) ~ 'part of',
    'off: a building key made one condition a part of another';
  assert (select status from knowledge.records where id = c) = 'not started', 'off: the condition moved';

  perform pg_temp.act('ops');
  perform knowledge.revise(c, '{"checked_by":{"query":"select 1","at_least":1}}', 'the PM');
  assert (select checked_by is not null from knowledge.records where id = c), 'the PM''s key could not write a check';
  perform knowledge.set_condition(d, 'met', 'the PM');
  assert (select status from knowledge.records where id = d) = 'met', 'the PM''s key could not mark a condition';
end $$;

-- test: off: a building key cannot change the plan or the map, drop an idea, or move what the PM placed; the PM's key can
-- [guards F125.7 partial: the plan, the map, ideas and the PM's placements stay with the PM's key]
do $$
declare
  r jsonb;
begin
  perform pg_temp.act('build');
  assert pg_temp.refused('select knowledge.add_slice(''F-none'', ''x'', ''now'', 1, ''x'')') ~ 'changes the plan',
    'off: a building key changed the plan';
  assert pg_temp.refused('select knowledge.drop_idea(''I-none'', ''x'')') ~ 'drops an idea',
    'off: a building key dropped an idea';
  assert pg_temp.refused('select knowledge.map_item(''{"id":"JT","kind":"journey","answer":"x","status":"live"}'', ''x'')') ~ 'operator records one as live',
    'off: a building key put a map item live';
  assert pg_temp.refused('select knowledge.confirm(''P-none'', ''x'')') ~ 'confirms a practice',
    'off: a building key confirmed a practice';

  perform pg_temp.act('ops');
  perform knowledge.record('{"id":"F990","kind":"feature","answer":"x","status":"approved","audience":"members"}', 'x');
  perform knowledge.place('F990', null, 'the PM: no journey yet');
  perform pg_temp.act('build');
  r := knowledge.place('F990', null, 'a builder thinks otherwise', '{}', '{}', '{}', 'stated', 'moved');
  assert r ? 'kept', 'off: a building key moved an item the PM placed';
  assert (select by_operator from knowledge.placements where item_id = 'F990' order by id desc limit 1),
    'fixture: the PM''s placement is not marked his';

  perform pg_temp.act('ops');
  assert pg_temp.refused('select knowledge.add_slice(''F-none'', ''x'', ''now'', 1, ''x'')') ~ 'No feature',
    'the PM''s key was refused a plan change';
  assert pg_temp.refused('select knowledge.drop_idea(''I-none'', ''x'')') ~ 'No idea',
    'the PM''s key was refused dropping an idea';
  r := knowledge.place('F990', null, 'the PM moves it', '{}', '{}', '{}', 'stated', 'moved');
  assert r ? 'placement', 'the PM''s key could not move his own placement';
end $$;

-- test: a check query reads the knowledge schema and nothing outside it
-- [guards F125.7 partial: no check reads member data, whoever wrote it]
reset role;
create table public.t_member_data (email text);
insert into public.t_member_data values ('someone@example.org');
do $$ begin
  assert knowledge._run_check('select count(*) from knowledge.kinds')::int > 0, 'a check could not read the store';
  assert pg_temp.refused('select knowledge._run_check(''select count(*) from public.t_member_data'')') ~ 'permission denied',
    'a check read a table outside the knowledge schema';
  assert pg_temp.refused('select knowledge._run_check(''select count(*) from knowledge.agents'')') ~ 'permission denied',
    'a check read the keys';
  assert pg_temp.refused($q$select knowledge._run_check('select set_config(''role'', ''postgres'', true)')$q$) ~ 'security-definer',
    'a check changed role';
  assert pg_temp.refused('select knowledge._run_check(''reset role'')') ~ 'security-definer',
    'a check reset its role';
end $$;
set local role knowledge_store;
do $$ begin
  perform pg_temp.act('ops');
  assert pg_temp.refused('select knowledge._run_check(''select 1'')') ~ 'permission denied',
    'the store''s login ran a check itself';
end $$;
