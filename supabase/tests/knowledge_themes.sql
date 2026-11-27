-- F137: themes in the store, with journeys under one or more. Scenario: socialus-plan planning/scenario-F137.md.
--
-- Run by tests/knowledge-themes-db.test.ts, as the F132 suite is: each "-- test:" block in its own transaction,
-- after the preamble, rolled back. A block passes when it runs without an error; every assert names what went wrong.

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

-- Two small journeys: bringing a maker in, and a market opening.
select knowledge.map_item('{"id":"JB","kind":"journey","answer":"Members bring something to life","status":"live"}', 'F137 test');
select knowledge.map_item('{"id":"JB.A1","kind":"activity","parent":"JB","answer":"Bring it here","status":"live"}', 'F137 test');
select knowledge.map_item('{"id":"JB.A1.T1","kind":"task","parent":"JB.A1","answer":"Bring a place you love here","status":"live"}', 'F137 test');
select knowledge.map_item('{"id":"JL","kind":"journey","answer":"A town opens and people join","status":"live"}', 'F137 test');
select knowledge.map_item('{"id":"JL.A1","kind":"activity","parent":"JL","answer":"Find out","status":"live"}', 'F137 test');
select knowledge.map_item('{"id":"JL.A1.T1","kind":"task","parent":"JL.A1","answer":"Ask if my town is open","status":"live"}', 'F137 test');
select knowledge.record('{"id":"F980","kind":"feature","answer":"Open your town","status":"shipped","audience":"members","departments":[]}', 'F137 test');
select knowledge.record('{"id":"CO-9980","kind":"concept","answer":"Vouching","status":"scoped","audience":"members","departments":[]}', 'F137 test');
select knowledge.place('F980', 'JB.A1.T1', 'F137 test');
select knowledge.place('CO-9980', 'JB.A1.T1', 'F137 test');
select knowledge.record('{"id":"Q-9980","kind":"question","answer":"Who counts as bringing someone in?","status":"open","audience":"members","departments":[]}', 'F137 test');
select knowledge.record('{"id":"Q-9981","kind":"question","answer":"Already settled","status":"answered","audience":"members","departments":[]}', 'F137 test');
select knowledge.link('Q-9980', 'F980', 'relates');
select knowledge.link('Q-9981', 'JB', 'relates');

-- test: a theme is a record with a name and the PM's why, and no steps of its own
-- [guards F137.1]
do $$
declare
  t text;
begin
  t := knowledge.theme('{"id":"TG","answer":"Members grow the platform","why":"help people be the change","status":"live"}', 'F137 test');
  assert (select kind || '/' || status || '/' || audience from knowledge.records where id = t) = 'theme/live/members',
    format('a theme is not a live members record: %s', t);
  assert pg_temp.refused($q$select knowledge.theme('{"answer":"No why"}', 't')$q$) like '%needs a why%', 'a theme was recorded with no why';
  assert knowledge.theme('{"answer":"Numbered","why":"w","status":"live"}', 't') like 'TH-%', 'a theme id does not start TH-';
  -- No steps of its own: nothing sits under a theme, and a theme sits under nothing.
  assert pg_temp.refused($q$select knowledge.map_item('{"kind":"activity","parent":"TG","answer":"x","status":"live"}', 't')$q$) is not null,
    'an activity was put under a theme';
  assert pg_temp.refused($q$select knowledge.theme('{"answer":"x","why":"w","parent":"JB"}', 't')$q$) is not null,
    'a theme was given a parent';
  assert pg_temp.refused($q$select knowledge.map_item('{"kind":"theme","answer":"x","status":"live"}', 't')$q$) is not null,
    'a theme was made as a map item';
end $$;

-- test: any key proposes a theme; only an operator records one live or changes it
-- [guards F137.1]
do $$
declare
  t text;
begin
  perform knowledge.theme('{"id":"TG","answer":"Members grow the platform","why":"w","status":"live"}', 'F137 test');
  perform pg_temp.act('build');
  t := knowledge.theme('{"answer":"Towns that run themselves","why":"a builder''s idea"}', 't');
  assert (select status from knowledge.records where id = t) = 'proposed', 'a builder''s theme is not proposed';
  assert pg_temp.refused($q$select knowledge.theme('{"answer":"x","why":"w","status":"live"}', 't')$q$) like '%only an operator%',
    'a builder recorded a live theme';
  assert pg_temp.refused($q$select knowledge.revise('TG', '{"answer":"x"}', 't')$q$) is not null, 'a builder changed a live theme';
end $$;

-- test: a journey sits under several themes, a theme holds several journeys, and a journey can leave a theme with its why kept
-- [guards F137.2]
do $$
declare
  n integer;
begin
  perform knowledge.theme('{"id":"TG","answer":"Members grow the platform","why":"w","status":"live"}', 't');
  perform knowledge.theme('{"id":"TT","answer":"Towns that run themselves","why":"w","status":"live"}', 't');
  perform knowledge.theme_journey('TG', 'JB', true, 'F137 test: bringing makers in grows it');
  perform knowledge.theme_journey('TG', 'JL', true, 'F137 test: a market opening');
  perform knowledge.theme_journey('TT', 'JB', true, 'F137 test: towns run themselves');
  assert (select array_agg(journey_id order by journey_id) from knowledge.current_theme_journeys where theme_id = 'TG') = array['JB', 'JL'],
    'a theme does not hold several journeys';
  assert (select array_agg(theme_id order by theme_id) from knowledge.current_theme_journeys where journey_id = 'JB') = array['TG', 'TT'],
    'a journey does not sit under several themes';
  -- The same again is no new row; leaving is a row, and the history stays.
  select count(*) into n from knowledge.theme_journeys;
  perform knowledge.theme_journey('TG', 'JB', true, 'again');
  assert (select count(*) from knowledge.theme_journeys) = n, 'the same membership twice wrote a row';
  perform pg_temp.act('build');
  perform knowledge.theme_journey('TG', 'JL', false, 'F137 test: opening is its own theme');
  assert (select array_agg(journey_id) from knowledge.current_theme_journeys where theme_id = 'TG') = array['JB'], 'a journey did not leave its theme';
  assert (select count(*) from knowledge.theme_journeys where theme_id = 'TG' and journey_id = 'JL') = 2, 'leaving lost the history';
  -- Only a theme holds journeys, and only journeys sit under themes.
  assert pg_temp.refused($q$select knowledge.theme_journey('JB', 'JL', true, 't')$q$) is not null, 'a journey held a journey';
  assert pg_temp.refused($q$select knowledge.theme_journey('TG', 'JB.A1.T1', true, 't')$q$) is not null, 'a task sat straight under a theme';
  assert pg_temp.refused($q$select knowledge.theme_journey('TG', 'JB', true, ' ')$q$) is not null, 'a membership had no reason';
  -- Append-only.
  assert pg_temp.refused($q$delete from knowledge.theme_journeys$q$) is not null, 'a membership row was deleted';
end $$;

-- test: a theme answers with its journeys, their built state, what is placed on them and their open questions
-- [guards F137.3]
do $$
declare
  t jsonb;
  b jsonb;
begin
  perform knowledge.theme('{"id":"TG","answer":"Members grow the platform","why":"help people be the change","status":"live"}', 't');
  perform knowledge.theme_journey('TG', 'JB', true, 't');
  perform knowledge.theme_journey('TG', 'JL', true, 't');
  t := knowledge.theme_of('TG');
  assert t->'theme'->>'why' = 'help people be the change', format('the theme''s why is missing: %s', t->'theme');
  assert (select array_agg(j->>'id' order by j->>'id') from jsonb_array_elements(t->'journeys') j) = array['JB', 'JL'],
    format('the theme''s journeys are missing: %s', t->'journeys');
  select j into b from jsonb_array_elements(t->'journeys') j where j->>'id' = 'JB';
  assert b->>'built' = 'built', format('a journey''s built state is wrong: %s', b);
  assert (select array_agg(f->>'id') from jsonb_array_elements(b->'features') f) = array['F980'], format('features missing: %s', b->'features');
  assert (select array_agg(i->>'id') from jsonb_array_elements(b->'ideas') i) = array['CO-9980'], format('ideas missing: %s', b->'ideas');
  assert (select array_agg(q->>'id') from jsonb_array_elements(b->'questions') q) = array['Q-9980'],
    format('the open question on a feature placed on it is missing, or an answered one shows: %s', b->'questions');
  assert knowledge.theme_of('JB') is null, 'a journey answered as a theme';
end $$;

-- test: a journey, an item on it, a feature or an idea placed on it each name every theme above it
-- [guards F137.3]
do $$
begin
  perform knowledge.theme('{"id":"TG","answer":"Members grow the platform","why":"w","status":"live"}', 't');
  perform knowledge.theme('{"id":"TT","answer":"Towns that run themselves","why":"w","status":"live"}', 't');
  perform knowledge.theme_journey('TG', 'JB', true, 't');
  perform knowledge.theme_journey('TT', 'JB', true, 't');
  assert (select array_agg(id order by id) from knowledge.themes_for('JB')) = array['TG', 'TT'], 'a journey does not name its themes';
  assert (select array_agg(id order by id) from knowledge.themes_for('JB.A1.T1')) = array['TG', 'TT'], 'a task does not name its themes';
  assert (select array_agg(id order by id) from knowledge.themes_for('F980')) = array['TG', 'TT'], 'a feature does not name its themes';
  assert (select array_agg(id order by id) from knowledge.themes_for('CO-9980')) = array['TG', 'TT'], 'an idea does not name its themes';
  assert (select array_agg(t.journey_id) from knowledge.themes_for('F980') t where t.id = 'TG') = array['JB'], 'which journey carries it is missing';
  assert not exists (select 1 from knowledge.themes_for('JL')), 'a journey under no theme named one';
end $$;

-- test: a key that cannot read a theme sees none of its journeys
-- [guards F137.2]
do $$
begin
  perform knowledge.theme('{"id":"TG","answer":"Members grow the platform","why":"w","status":"live"}', 't');
  perform knowledge.theme_journey('TG', 'JB', true, 't');
  perform set_config('knowledge.key', 'no such key', true);
  assert not exists (select 1 from knowledge.theme_journeys), 'an unknown key read a theme''s journeys';
  assert knowledge.theme_of('TG') is null, 'an unknown key read a theme';
end $$;
