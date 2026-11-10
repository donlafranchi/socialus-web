-- F126 — conditions in the knowledge store: what decisions and features wait
-- on, with parts. Scenario: socialus-plan planning/scenario-F126.md.
--
-- Run by tests/knowledge-conditions-db.test.ts, exactly as the F125 suite
-- (supabase/tests/knowledge_store.sql) is run: each "-- test:" block in its
-- own transaction, after the preamble, rolled back. A block passes when it
-- runs without an error; every assert names what went wrong.
--
-- The scheduled check, the threshold and the one Issue per met condition are
-- tested where the job lives: tests/knowledge-conditions-job.test.ts.

-- preamble
select set_config('t.ops',   knowledge.add_agent('t-ops',   'the PM',       '{}',                 true),  true);
select set_config('t.build', knowledge.add_agent('t-build', 'a builder',    '{building}',         false), true);
select set_config('t.tns',   knowledge.add_agent('t-tns',   'a moderator',  '{trust-and-safety}', false), true);
select set_config('t.fin',   knowledge.add_agent('t-fin',   'a bookkeeper', '{finance}',          false), true);
select set_config('t.legal', knowledge.add_agent('t-legal', 'counsel',      '{legal}',            false), true);
select set_config('t.comms', knowledge.add_agent('t-comms', 'a writer',     '{communications}',   false), true);
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

-- A small payments tree, as the scenario's story tells it:
--   payments (parent) <- card payments (part), payouts (part)
--   payouts (now a parent too) <- payouts to a bank, payouts by instant transfer
select set_config('t.pay', knowledge.record(
  '{"kind":"condition","concern":"payments","answer":"Payments work","why":"Buying and selling need money to move.","owner":"the PM","audience":"public"}',
  'F126 test'), true);
select set_config('t.card', knowledge.record(
  '{"kind":"condition","concern":"payments","answer":"Take a one-off card payment","why":"Pre-orders need only this.","owner":"the PM","audience":"public"}',
  'F126 test'), true);
select set_config('t.payout', knowledge.record(
  '{"kind":"condition","concern":"payments","answer":"Pay out to a seller","why":"Sellers are paid.","owner":"the PM","audience":"public"}',
  'F126 test'), true);
select knowledge.link(current_setting('t.card'), current_setting('t.pay'), 'part_of');
select knowledge.link(current_setting('t.payout'), current_setting('t.pay'), 'part_of');

-- test: a condition is a record with a why, an owner, a status and the check that decides it
-- [guards F126.1]
do $$
declare
  c record;
  cid text;
begin
  assert (select statuses from knowledge.kinds where slug = 'condition') = '{not started,partial,met,withdrawn}',
    'a condition does not take the four statuses: not started, partial, met, withdrawn';
  cid := knowledge.record(
    '{"kind":"condition","concern":"explore-and-map","answer":"Members in the first metro reach 500","why":"Near-you lists are thin below that.","owner":"the PM","audience":"public","checked_by":{"query":"select count(*) from public.members","at_least":500,"line":"members in the first metro"}}',
    'F126 test');
  select * into c from knowledge.records r where r.id = cid;
  assert c.kind = 'condition' and c.status = 'not started', 'a new condition does not start as not started';
  assert c.owner = 'the PM' and c.why like 'Near-you%', 'a condition lost its owner or its why';
  assert c.checked_by->>'query' like 'select count%' and (c.checked_by->>'at_least')::numeric = 500,
    'a condition lost the check that decides it';
  assert (select h.snapshot->'checked_by'->>'line' from knowledge.history h where h.record_id = cid and h.version = 1) = 'members in the first metro',
    'the history copy of a condition does not hold its check';

  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","answer":"x","owner":"the PM"}', 't')$q$) ~ 'why',
    'a condition was recorded without a why';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","answer":"x","why":"y"}', 't')$q$) ~ 'owner',
    'a condition was recorded without an owner';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","answer":"x","why":"y","owner":"the PM","checked_by":{"at_least":3}}', 't')$q$) ~ 'check',
    'a threshold with no query was accepted';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","answer":"x","why":"y","owner":"the PM","checked_by":{"test":"tests/x.test.ts; rm -rf /"}}', 't')$q$) ~ 'check',
    'a named test that is not a test file was accepted';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","answer":"x","why":"y","owner":"the PM","status":"met"}', 't')$q$) ~ 'set_condition',
    'a condition was recorded already met, around set_condition';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","answer":"x","why":"y","owner":"the PM","checked_by":"select count(*) from public.members"}', 't')$q$) ~ 'object',
    'a check that is not an object was dropped instead of refused';
  -- A condition with no check is fine: the PM decides it by hand.
  perform knowledge.record('{"kind":"condition","answer":"Counsel signs off the seller terms","why":"Selling needs terms.","owner":"counsel","audience":"public"}', 'F126 test');

  -- Only an operator writes a check: the scheduled job runs it.
  perform pg_temp.act('fin');
  assert pg_temp.refused($q$select knowledge.record('{"kind":"condition","concern":"payments","answer":"x","why":"y","owner":"a bookkeeper","audience":"department","departments":["finance"],"checked_by":{"query":"select 1"}}', 't')$q$) ~ 'operator',
    'a department key wrote a check the scheduled job would run';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.card'), '{"checked_by":{"query":"select 1"}}', 't')) is not null,
    'a department key changed a condition''s check';
end $$;

-- test: a parent's status is computed from its parts and never set by hand
-- [guards F126.2]
do $$ begin
  assert knowledge.condition_status(current_setting('t.pay')) = 'not started', 'a parent with no part met is not "not started"';

  perform knowledge.set_condition(current_setting('t.card'), 'met', 'the first card payment went through');
  assert knowledge.condition_status(current_setting('t.card')) = 'met', 'a part marked met does not read met';
  assert knowledge.condition_status(current_setting('t.pay')) = 'partial', 'a parent with one part met and one not is not partial';
  assert (select status from knowledge.conditions where id = current_setting('t.pay')) = 'partial',
    'the conditions view does not show the parent''s computed status';
  assert (select parts from knowledge.conditions where id = current_setting('t.pay')) @> array[current_setting('t.card'), current_setting('t.payout')],
    'the conditions view does not list a parent''s parts';

  assert pg_temp.refused(format('select knowledge.set_condition(%L, %L, %L)', current_setting('t.pay'), 'met', 'by hand')) ~ 'computed from its parts',
    'a parent''s status was set by hand';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.card'), '{"status":"not started"}', 'sneak')) ~ 'set_condition',
    'a condition''s status was changed by an edit, around set_condition';

  -- Parts all the way down: payouts gets parts of its own.
  perform set_config('t.bank', knowledge.record(
    '{"kind":"condition","concern":"payments","answer":"Pay out to a bank account","why":"Most sellers have one.","owner":"the PM","audience":"public"}', 'F126 test'), true);
  perform knowledge.link(current_setting('t.bank'), current_setting('t.payout'), 'part_of');
  perform knowledge.set_condition(current_setting('t.bank'), 'met', 'first payout landed');
  assert knowledge.condition_status(current_setting('t.payout')) = 'met', 'a parent whose only part is met is not met';
  assert knowledge.condition_status(current_setting('t.pay')) = 'met', 'a grandparent whose parts are all met, two levels down, is not met';

  perform set_config('t.instant', knowledge.record(
    '{"kind":"condition","concern":"payments","answer":"Instant payouts","why":"Some sellers want it now.","owner":"the PM","audience":"public"}', 'F126 test'), true);
  perform knowledge.link(current_setting('t.instant'), current_setting('t.payout'), 'part_of');
  assert knowledge.condition_status(current_setting('t.pay')) = 'partial', 'a new unmet part two levels down did not make the top partial again';

  -- A withdrawn part is no longer waited for.
  perform knowledge.set_condition(current_setting('t.instant'), 'withdrawn', 'not for beta');
  assert knowledge.condition_status(current_setting('t.pay')) = 'met', 'a withdrawn part still held its parent back';

  -- A parent may be withdrawn by hand: that is a decision, not a computed status.
  perform knowledge.set_condition(current_setting('t.payout'), 'withdrawn', 'payouts are out of scope');
  assert knowledge.condition_status(current_setting('t.payout')) = 'withdrawn', 'a parent could not be withdrawn';

  -- Parts cannot loop, and only a condition is a part of a condition.
  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', current_setting('t.pay'), current_setting('t.bank'), 'part_of')) ~ 'loop',
    'a condition was made a part of its own part';
  perform set_config('t.feat', knowledge.record('{"kind":"feature","id":"F990","answer":"Card pre-orders","audience":"public"}', 'F126 test'), true);
  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', current_setting('t.feat'), current_setting('t.pay'), 'part_of')) ~ 'condition',
    'a feature was made a part of a condition';
end $$;

-- test: only an operator makes a part, and withdrawing every part does not withdraw the parent
-- [guards F126.2 partial: who may change a parent through its parts; the computation is the test above]
select set_config('t.gate', knowledge.record(
  '{"kind":"condition","concern":"payments","answer":"Seller payouts are ready","why":"t","owner":"the PM","audience":"public"}', 'F126 test'), true);
select set_config('t.cash', knowledge.record(
  '{"kind":"decision","concern":"payments","answer":"Payouts wait.","why":"t","audience":"public"}', 'F126 test'), true);
select knowledge.link(current_setting('t.cash'), current_setting('t.pay'), 'starts_when');
select knowledge.set_condition(current_setting('t.card'), 'met', 'met');
do $$ begin
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', current_setting('t.card'), current_setting('t.gate'), 'part_of')) ~ 'operator',
    'a department key made a met condition a part of a gate, unparking what waits on it';
  perform pg_temp.act('ops');
  assert knowledge.condition_status(current_setting('t.gate')) = 'not started', 'the gate changed status';

  perform knowledge.set_condition(current_setting('t.card'), 'withdrawn', 'provider changed');
  perform knowledge.set_condition(current_setting('t.payout'), 'withdrawn', 'provider changed');
  assert knowledge.condition_status(current_setting('t.pay')) = 'not started',
    'withdrawing every part withdrew the parent: ' || knowledge.condition_status(current_setting('t.pay'));
  assert knowledge.is_parked(current_setting('t.cash')), 'withdrawing every part released what waits on the parent';
end $$;

-- test: a status change is recorded in history and only an operator makes it
-- [guards F126.2 partial: who may change a status; the computation is the test above]
do $$
declare
  h knowledge.history;
begin
  perform knowledge.set_condition(current_setting('t.card'), 'met', 'the check passed', '{"check":"query","value":1}');
  select * into h from knowledge.history where record_id = current_setting('t.card') order by version desc limit 1;
  assert h.snapshot->>'status' = 'met' and h.reason = 'the check passed' and h.evidence->>'value' = '1',
    'a status change did not write a history row with its reason and evidence';
  assert pg_temp.refused(format('select knowledge.set_condition(%L, %L, %L)', current_setting('t.card'), 'done', 't')) ~ 'not started, partial, met, withdrawn',
    'a condition took a status outside the four';
  perform pg_temp.act('fin');
  assert pg_temp.refused(format('select knowledge.set_condition(%L, %L, %L)', current_setting('t.payout'), 'met', 'mine now')) ~ 'operator',
    'a department key marked a condition met';
end $$;

-- test: a decision or feature waits on a condition or one part of it, with starts when or ends when
-- [guards F126.4]
select set_config('t.preorders', knowledge.record('{"kind":"feature","id":"F991","answer":"Card pre-orders","audience":"public"}', 'F126 test'), true);
select set_config('t.sellerpay', knowledge.record('{"kind":"feature","id":"F992","answer":"Sellers paid on the app","audience":"public"}', 'F126 test'), true);
select set_config('t.cashonly', knowledge.record(
  '{"kind":"decision","concern":"payments","answer":"Trades are cash in person, for now.","why":"No payments yet.","holds":"for now","until":"card payments","audience":"public"}',
  'F126 test'), true);
do $$ begin
  perform knowledge.link(current_setting('t.preorders'), current_setting('t.card'), 'starts_when');
  perform knowledge.link(current_setting('t.sellerpay'), current_setting('t.pay'), 'starts_when');
  perform knowledge.link(current_setting('t.cashonly'), current_setting('t.card'), 'ends_when');
  assert (select count(*) from knowledge.links
           where type in ('starts_when', 'ends_when')
             and from_id in (current_setting('t.preorders'), current_setting('t.sellerpay'), current_setting('t.cashonly'))) = 3,
    'the three waits were not recorded';

  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', current_setting('t.preorders'), current_setting('t.sellerpay'), 'starts_when')) ~ 'condition',
    'something was made to wait on a record that is not a condition';

  assert knowledge.is_parked(current_setting('t.preorders')), 'a feature waiting on an unmet part is not parked';
  perform knowledge.set_condition(current_setting('t.card'), 'met', 'first card payment');
  assert not knowledge.is_parked(current_setting('t.preorders')), 'a feature waiting on a met part is still parked';
  assert knowledge.condition_status(current_setting('t.pay')) = 'partial', 'the parent is not partial';
  assert knowledge.is_parked(current_setting('t.sellerpay')), 'a feature waiting on the whole was released by one part';
end $$;

-- test: the store refuses to mark parked work as building, and says what it waits on
-- [guards F126.7 partial: an agent's answer about parked work is the lookup tool's (#1219)]
select set_config('t.preorders', knowledge.record('{"kind":"feature","id":"F993","answer":"Card pre-orders","audience":"public","status":"approved"}', 'F126 test'), true);
select knowledge.link(current_setting('t.preorders'), current_setting('t.card'), 'starts_when');
do $$
declare
  answer jsonb;
begin
  answer := knowledge.revise(current_setting('t.preorders'), '{"status":"building"}', 'start building');
  assert answer ? 'refused', 'parked work was marked building';
  assert answer->>'refused' like '%' || current_setting('t.card') || '%' and answer->>'refused' like '%Take a one-off card payment%',
    'the refusal does not name the condition the work waits on: ' || coalesce(answer->>'refused', '');
  assert (select status from knowledge.records where id = current_setting('t.preorders')) = 'approved',
    'the refused change landed anyway';
  assert exists (select 1 from knowledge.refusals where record_id = current_setting('t.preorders') and action = 'revise'),
    'the refusal was not logged';

  -- Parked on a parent: the refusal names the unmet part, all the way down.
  perform knowledge.link(current_setting('t.preorders'), current_setting('t.pay'), 'starts_when');
  perform knowledge.set_condition(current_setting('t.card'), 'met', 'first card payment');
  answer := knowledge.revise(current_setting('t.preorders'), '{"status":"building"}', 'start building');
  assert answer->>'refused' like '%Pay out to a seller%',
    'a refusal for work parked on a parent does not name the part still unmet: ' || coalesce(answer->>'refused', '');

  perform knowledge.set_condition(current_setting('t.payout'), 'met', 'payouts work');
  answer := knowledge.revise(current_setting('t.preorders'), '{"status":"building"}', 'start building');
  assert not answer ? 'refused' and (select status from knowledge.records where id = current_setting('t.preorders')) = 'building',
    'work whose conditions are all met could not be marked building';
end $$;
-- The same refusal holds for the schema owner, who has no revise to go through.
reset role;
do $$ begin
  perform set_config('knowledge.key', current_setting('t.ops'), true);
  perform set_config('t.f2', knowledge.record('{"kind":"feature","id":"F994","answer":"Refunds","audience":"public","status":"approved"}', 'F126 test'), true);
  perform set_config('t.refunds', knowledge.record(
    '{"kind":"condition","concern":"payments","answer":"Refunds go back to the card","why":"A buyer can change their mind.","owner":"the PM","audience":"public"}', 'F126 test'), true);
  perform knowledge.link(current_setting('t.f2'), current_setting('t.refunds'), 'starts_when');
  perform set_config('knowledge.reason', 'direct', true);
  assert pg_temp.refused(format('update knowledge.records set status = %L where id = %L', 'building', current_setting('t.f2'))) ~ 'parked',
    'a direct update marked parked work as building';
end $$;

-- test: what was announced as met is recorded, by an operator only
-- [guards F126.6 partial: the Issue itself is opened by the scheduled job]
do $$ begin
  perform knowledge.set_condition(current_setting('t.card'), 'met', 'first card payment');
  perform knowledge.announce(current_setting('t.card'), 'met', 'https://github.com/donlafranchi/socialus-web/issues/1');
  assert (select announced from knowledge.conditions where id = current_setting('t.card')) = 'met',
    'the conditions view does not show what was last announced';
  assert (select announced from knowledge.conditions where id = current_setting('t.pay')) is null,
    'a condition never announced reads as announced';
  assert pg_temp.refused('delete from knowledge.announcements') ~ 'permission denied', 'the login deleted an announcement';
  perform pg_temp.act('build');
  assert pg_temp.refused(format('select knowledge.announce(%L, %L, null)', current_setting('t.card'), 'met')) ~ 'operator',
    'a department key recorded an announcement';
end $$;
