-- F131: the live-state snapshot the three answers read. Scenario:
-- socialus-plan planning/scenario-F131.md.
--
-- Run by tests/knowledge-answers-db.test.ts, as the other knowledge suites
-- are: each "-- test:" block in its own transaction, after the preamble,
-- rolled back. A block passes when it runs without an error; every assert
-- names what went wrong.
--
-- What the job reads from GitHub, and the three answers' words and lengths,
-- are tested where they live: tests/knowledge-answers.test.ts.

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
select knowledge.set_live_state(
  '[{"kind":"broken","key":"main-build","words":"main fails to build on Vercel","url":"https://github.com/x/y/issues/1","source":"github","since":"2026-11-11T10:00:00Z"},
    {"kind":"waiting","key":"pr:9","words":"Review the new map","source":"github"},
    {"kind":"bug","key":"issue:3","words":"a typo on Explore","source":"github"}]',
  '2026-11-11T12:00:00Z');

-- test: the job's snapshot is read back worst first, with when it was taken
-- [guards F131.5 partial: what the job reads from GitHub is tests/knowledge-answers.test.ts]
do $$
declare
  kinds text[];
  taken timestamptz;
begin
  select array_agg(kind order by ord), max(taken_at) into kinds, taken
    from (select kind, taken_at, row_number() over () ord from knowledge.live_state()) s;
  assert kinds = array['broken', 'waiting', 'bug'], format('worst first: %s', kinds);
  assert taken = '2026-11-11T12:00:00Z'::timestamptz, format('taken at: %s', taken);
end $$;

-- test: each run replaces the whole snapshot, so a fixed thing leaves it
do $$
declare
  n integer;
  counts jsonb;
begin
  perform knowledge.set_live_state('[{"kind":"bug","key":"issue:4","words":"another","source":"github"}]', '2026-11-12T12:00:00Z');
  select count(*) into n from knowledge.live_state();
  assert n = 1, format('one row after the second run, not %s', n);
  select t.counts into counts from knowledge.live_state_taken t;
  assert counts = '{"bug": 1}'::jsonb, format('counts: %s', counts);
  perform knowledge.set_live_state('[]', '2026-11-13T12:00:00Z');
  select count(*) into n from knowledge.live_state();
  assert n = 0, 'an empty run leaves nothing';
end $$;

-- test: only an operator writes it
do $$
declare
  msg text;
begin
  perform pg_temp.act('build');
  msg := pg_temp.refused($q$select knowledge.set_live_state('[]')$q$);
  assert msg like 'Only an operator writes the live state%', format('a builder may not write: %s', msg);
  msg := pg_temp.refused($q$delete from knowledge.live_state$q$);
  assert msg is not null, 'no direct delete through the login';
  msg := pg_temp.refused($q$insert into knowledge.live_state (kind, key, words, source) values ('bug', 'x', 'y', 'github')$q$);
  assert msg is not null, 'no direct insert through the login';
end $$;

-- test: a builder reads it; a key outside building and telemetry-and-bugs reads nothing
do $$
declare
  n integer;
begin
  perform pg_temp.act('build');
  select count(*) into n from knowledge.live_state();
  assert n = 3, format('a builder reads all three, not %s', n);
  perform pg_temp.act('none');
  select count(*) into n from knowledge.live_state();
  assert n = 0, format('a chat project reads none, not %s', n);
end $$;

-- test: a row is one of the six kinds, from GitHub or Vercel, with words, and nothing else
do $$
declare
  msg text;
begin
  msg := pg_temp.refused($q$select knowledge.set_live_state('[{"kind":"gossip","key":"a","words":"b","source":"github"}]')$q$);
  assert msg is not null, 'an unknown kind is refused';
  msg := pg_temp.refused($q$select knowledge.set_live_state('[{"kind":"bug","key":"a","words":"b","source":"slack"}]')$q$);
  assert msg is not null, 'an unknown source is refused';
  msg := pg_temp.refused($q$select knowledge.set_live_state('[{"kind":"bug","key":"a","words":" ","source":"github"}]')$q$);
  assert msg is not null, 'a row without words is refused';
  msg := pg_temp.refused($q$select knowledge.set_live_state('[{"kind":"bug","key":"a","words":"b","source":"github","owner":"x"}]')$q$);
  assert msg like '%not owner%', format('an unknown field is refused: %s', msg);
  msg := pg_temp.refused($q$select knowledge.set_live_state('[{"kind":"bug","key":"a","words":"b","source":"github"},{"kind":"bug","key":"a","words":"c","source":"github"}]')$q$);
  assert msg is not null, 'the same row twice is refused';
end $$;
