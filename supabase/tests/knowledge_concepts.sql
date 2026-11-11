-- F130: concepts in the knowledge store: one identity from first idea to
-- what got built. Scenario: socialus-plan planning/scenario-F130.md.
--
-- Run by tests/knowledge-concepts-db.test.ts, as the F125 and F126 suites
-- are: each "-- test:" block in its own transaction, after the preamble,
-- rolled back. A block passes when it runs without an error; every assert
-- names what went wrong.
--
-- Loading the two traced timelines entry for entry, IMAGINE.md's ideas and
-- the scenarios' frontmatter is tested where the loader lives:
-- tests/knowledge-concepts.test.ts.

-- preamble
select set_config('t.ops',   knowledge.add_agent('t-ops',   'the PM',    '{}',         true),  true);
select set_config('t.build', knowledge.add_agent('t-build', 'a builder', '{building}', false), true);
select set_config('t.fin',   knowledge.add_agent('t-fin',   'a bookkeeper', '{finance}', false), true);
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

select set_config('t.c', knowledge.record(
  '{"kind":"concept","concern":"posts","answer":"Bulletins","why":"A Page reaching its followers.","status":"built","audience":"department","departments":["building"]}',
  'F130 test', null, '2026-04-25'), true);

-- test: a concept keeps one id through every name, each name dated with its ruling, and a refused name stays refused
-- [guards F130.1]
do $$
declare
  c text := current_setting('t.c');
  rid text;
  t jsonb;
begin
  assert c ~ '^CO-\d{4}$' and c not in ('CO-0001', 'CO-0002'),
    format('a concept id is CO-nnnn after the two seeded ones, not %s', c);
  rid := knowledge.record('{"kind":"decision","concern":"posts","answer":"Bulletin is not a noun; it is an Announcement","why":"One word per thing.","audience":"department","departments":["building"]}',
                          'F130 test');
  perform knowledge.name_concept(c, 'Bulletins', '2026-04-25', 'used', '[{"kind":"web_commit","ref":"91fdacb2"}]');
  perform knowledge.name_concept(c, 'Bulletin', '2026-09-21', 'refused', '[{"kind":"plan_commit","ref":"3152305"}]', rid);
  perform knowledge.name_concept(c, 'Announcement', '2026-09-21', 'used', '[{"kind":"plan_commit","ref":"3152305"}]', rid);
  perform knowledge.revise(c, '{"answer":"Announcement"}', 'renamed');
  perform knowledge.name_concept(c, 'Post', '2026-10-01', 'used', '[{"kind":"plan_commit","ref":"3277f66"}]');
  perform knowledge.revise(c, '{"answer":"Post"}', 'renamed');

  assert pg_temp.refused(format($q$update knowledge.records set id = 'CO-9999' where id = %L$q$, c)) is not null,
    'a concept''s id was changed';
  t := knowledge.concept_timeline(c);
  assert t->'concept'->>'id' = c and t->'concept'->>'name' = 'Post', 'the timeline does not show the one id under its current name';
  assert jsonb_array_length(t->'names') = 4, format('expected four names, got %s', t->'names');
  assert (select count(*) from jsonb_array_elements(t->'names') n where n->>'name' = 'Bulletin' and n->>'state' = 'refused'
            and n->>'on' = '2026-09-21' and n->>'ruling' = rid) = 1,
    'the refused name is not listed as refused, dated, with the ruling behind it';
  assert (select array_agg(c2.id) from knowledge.find_concept('bulletin') c2) = array[c],
    'a refused name does not find its concept';
  assert (select array_agg(c2.id) from knowledge.find_concept('Bulletins') c2) = array[c],
    'a former name does not find its concept';
  -- A ruling the reader cannot see is not named to it, not even by id.
  perform knowledge.revise(rid, '{"audience":"operators","departments":[]}', 'F130 test: hide the ruling');
  perform pg_temp.act('build');
  assert (select count(*) from jsonb_array_elements(knowledge.concept_timeline(c)->'names') n where n->>'ruling' is not null) = 0,
    'a building key read the id of a ruling it cannot see';
  perform pg_temp.act('ops');
  assert pg_temp.refused(format($q$update knowledge.concept_names set state = 'used' where concept_id = %L and name = 'Bulletin'$q$, c)) is not null,
    'a refused name was turned into a used one';
  assert pg_temp.refused(format($q$delete from knowledge.concept_names where concept_id = %L$q$, c)) is not null,
    'a name was deleted';
  assert pg_temp.refused(format($q$select knowledge.name_concept(%L, 'X', '2026-01-01', 'used', '[]')$q$, c)) is not null,
    'a name was recorded with no evidence';
end $$;

-- test: each change is one typed, dated event with its evidence and the PM's words in their own field
-- [guards F130.2]
do $$
declare
  c text := current_setting('t.c');
  t jsonb;
  e jsonb;
  ty text;
begin
  foreach ty in array array['idea','scoped','ruling','renamed','split','merged','cut','deferred','built','reversed'] loop
    perform knowledge.concept_event(c, ty, '2026-06-01', 'a ' || ty || ' event', '[{"kind":"plan_commit","ref":"abc1234"}]');
  end loop;
  perform knowledge.concept_event(c, 'renamed', '2026-10-01', 'Post', '[{"kind":"plan_commit","ref":"3277f66"}]',
                                  'an announcement is a post');
  perform knowledge.concept_event(c, 'built', '2026-10-18', 'push', '[{"kind":"web_pr","ref":"#930"},{"kind":"criterion","ref":"F075.2"}]');
  -- the same event twice is one row
  perform knowledge.concept_event(c, 'built', '2026-10-18', 'push', '[{"kind":"web_pr","ref":"#930"},{"kind":"criterion","ref":"F075.2"}]');

  assert pg_temp.refused(format($q$select knowledge.concept_event(%L, 'tweaked', '2026-06-01', 'x', '[{"kind":"plan_commit","ref":"a"}]')$q$, c)) is not null,
    'an event of a type outside the ten was recorded';
  assert pg_temp.refused(format($q$select knowledge.concept_event(%L, 'cut', '2026-06-01', 'x', '[]')$q$, c)) is not null,
    'an event with no evidence was recorded';
  assert pg_temp.refused(format($q$select knowledge.concept_event(%L, 'cut', '2026-06-01', 'x', '[{"kind":"rumour","ref":"a"}]')$q$, c)) is not null,
    'an event whose evidence is not a commit, criterion, scenario, PR or doc was recorded';
  assert pg_temp.refused(format($q$select knowledge.concept_event(%L, 'cut', current_date + 1, 'x', '[{"kind":"plan_commit","ref":"a"}]')$q$, c)) is not null,
    'an event was dated in the future';
  assert pg_temp.refused($q$select knowledge.concept_event('no-such', 'cut', '2026-06-01', 'x', '[{"kind":"plan_commit","ref":"a"}]')$q$) is not null,
    'an event was recorded on something that is not a concept';
  assert pg_temp.refused(format($q$update knowledge.concept_events set what = 'rewritten' where concept_id = %L$q$, c)) is not null,
    'an event was rewritten';

  t := knowledge.concept_timeline(c);
  assert jsonb_array_length(t->'events') = 12, format('expected 12 events, got %s', jsonb_array_length(t->'events'));
  select x into e from jsonb_array_elements(t->'events') x where x->>'on' = '2026-10-01';
  assert e->>'type' = 'renamed' and e->>'pm_words' = 'an announcement is a post' and e->>'what' = 'Post',
    format('the PM''s words are not in their own field: %s', e);
  assert (select bool_and(jsonb_array_length(x->'evidence') > 0) from jsonb_array_elements(t->'events') x),
    'an event came back without its evidence';
  assert (select array_agg(x->>'on' order by ord) from jsonb_array_elements(t->'events') with ordinality as y(x, ord))
         = (select array_agg(x->>'on' order by x->>'on') from jsonb_array_elements(t->'events') x),
    'the events are not in date order';

  perform pg_temp.act('build');
  assert pg_temp.refused(format($q$select knowledge.concept_event(%L, 'cut', '2026-06-01', 'x', '[{"kind":"plan_commit","ref":"a"}]')$q$, c)) is not null,
    'a non-operator recorded a dated event';
  assert jsonb_array_length(knowledge.concept_timeline(c)->'events') = 12, 'a building key cannot read the concept''s events';
  perform pg_temp.act('fin');
  assert knowledge.concept_timeline(c) is null, 'a finance key read a building concept';
  assert not exists (select 1 from knowledge.concept_events), 'a finance key read a building concept''s events';
end $$;

-- test: split, merged and became links between concepts, scenarios and ideas still resolve after their file is gone
-- [guards F130.3]
do $$
declare
  c text := current_setting('t.c');
  idea text;
  merged text;
  t jsonb;
begin
  idea := knowledge.record('{"kind":"concept","answer":"Bulletin intelligence","status":"idea","source":"socialus-plan:IMAGINE.md#bulletin-intelligence","audience":"department","departments":["building"]}',
                           'F130 test');
  merged := knowledge.record('{"kind":"concept","answer":"Vendor news","status":"merged","audience":"department","departments":["building"]}',
                             'F130 test');
  perform knowledge.record('{"id":"F072","kind":"feature","answer":"Posts on a Page","status":"shipped","source":"planning/scenario-F072.md","audience":"department","departments":["building"]}',
                           'F130 test');
  perform knowledge.link(idea, c, 'split_from');
  perform knowledge.link(merged, c, 'merged_into');
  perform knowledge.link('F072', c, 'scopes');
  perform knowledge.link('F072', idea, 'became');

  assert pg_temp.refused(format($q$select knowledge.link(%L, 'F072', 'scopes')$q$, c)) is not null,
    'a concept was said to scope a scenario: scopes runs from a scenario to a concept';
  perform knowledge.record('{"kind":"decision","concern":"posts","answer":"a ruling","why":"x","audience":"department","departments":["building"]}', 'F130 test');
  assert pg_temp.refused(format($q$select knowledge.link((select id from knowledge.records where answer = 'a ruling'), %L, 'became')$q$, c)) is not null,
    'a decision was put in a concept''s lineage';

  -- The file each came from is gone: IMAGINE.md lost the idea, the scenario
  -- file was deleted. The store keeps every record, so nothing dangles.
  assert pg_temp.refused(format($q$delete from knowledge.records where id = %L$q$, idea)) is not null, 'an idea''s record was deleted';
  assert pg_temp.refused($q$delete from knowledge.records where id = 'F072'$q$) is not null, 'a scenario''s record was deleted';
  assert pg_temp.refused(format($q$delete from knowledge.links where to_id = %L$q$, c)) is not null, 'a lineage link was deleted';

  -- Lineage is permanent, so it is an operator's to write.
  perform pg_temp.act('build');
  assert pg_temp.refused(format($q$select knowledge.link(%L, %L, 'merged_into')$q$, idea, c)) like 'Only an operator links%',
    'a building key wrote a permanent lineage link';
  assert pg_temp.refused(format($q$select knowledge.link('F072', %L, 'scopes')$q$, c)) like 'Only an operator links%',
    'a building key linked a scenario to a concept';
  perform pg_temp.act('ops');

  t := knowledge.concept_timeline(c);
  assert jsonb_array_length(t->'lineage') = 3, format('expected 3 lineage links, got %s', t->'lineage');
  assert (select count(*) from jsonb_array_elements(t->'lineage') l
           where (l->>'from', l->>'type', l->>'other') in ((idea, 'split_from', 'Bulletin intelligence'),
                                                           (merged, 'merged_into', 'Vendor news'),
                                                           ('F072', 'scopes', 'Posts on a Page'))) = 3,
    format('lineage does not resolve to its records: %s', t->'lineage');
  assert (knowledge.concept_timeline(idea)->'lineage') @> format('[{"from":"F072","type":"became","to":"%s"}]', idea)::jsonb,
    'the idea''s own lineage is missing the scenario it became';
end $$;

-- test: one call answers how a concept changed and why
-- [guards F130.7 partial: the lookup tool's words, tested in tests/knowledge-concepts.test.ts]
do $$
declare
  c text := current_setting('t.c');
  t jsonb;
begin
  perform knowledge.name_concept(c, 'Bulletins', '2026-04-25', 'used', '[{"kind":"web_commit","ref":"91fdacb2"}]');
  perform knowledge.concept_event(c, 'built', '2026-04-25', 'vendor bulletins', '[{"kind":"web_commit","ref":"91fdacb2"}]');
  t := knowledge.concept_timeline(c);
  assert t ?& array['concept', 'names', 'events', 'lineage'], format('the timeline is missing a part: %s', t);
  assert t->'concept'->>'why' = 'A Page reaching its followers.', 'the timeline does not say why';
end $$;

-- test: drift lists concepts whose built and ruled states disagree, and the ones that came back after a cut
-- [guards F130.8 partial: the store's half; the doc scan is tested in tests/knowledge-concepts.test.ts]
do $$
declare
  ok text := current_setting('t.c');
  ghost text;
  zombie text;
  back text;
  mine text;
begin
  -- Built, cut, built again, ruled built: agrees.
  perform knowledge.concept_event(ok, 'built', '2026-04-25', 'a', '[{"kind":"web_commit","ref":"a"}]');
  perform knowledge.concept_event(ok, 'cut', '2026-05-11', 'b', '[{"kind":"plan_commit","ref":"b"}]');
  perform knowledge.concept_event(ok, 'built', '2026-10-18', 'c', '[{"kind":"web_pr","ref":"#930"}]');
  -- Ruled built, but cut with no build since.
  ghost := knowledge.record('{"kind":"concept","answer":"Ghost","status":"built","audience":"department","departments":["building"]}', 'F130 test');
  perform knowledge.concept_event(ghost, 'built', '2026-04-01', 'a', '[{"kind":"web_commit","ref":"a"}]');
  perform knowledge.concept_event(ghost, 'cut', '2026-05-01', 'b', '[{"kind":"plan_commit","ref":"b"}]');
  -- Ruled cut, but built after the cut.
  zombie := knowledge.record('{"kind":"concept","answer":"Zombie","status":"cut","audience":"department","departments":["building"]}', 'F130 test');
  perform knowledge.concept_event(zombie, 'cut', '2026-05-01', 'a', '[{"kind":"plan_commit","ref":"a"}]');
  perform knowledge.concept_event(zombie, 'built', '2026-06-01', 'b', '[{"kind":"web_pr","ref":"#1"}]');
  -- Cut, then scoped again: it came back.
  back := knowledge.record('{"kind":"concept","answer":"Open your town","status":"deferred","audience":"department","departments":["building"]}', 'F130 test');
  perform knowledge.name_concept(back, 'market unlock', '2026-06-22', 'used', '[{"kind":"plan_commit","ref":"20b2c4d"}]');
  perform knowledge.concept_event(back, 'cut', '2026-09-07', 'archived', '[{"kind":"doc","ref":"brief"}]');
  perform knowledge.concept_event(back, 'scoped', '2026-09-14', 'a metro opens', '[{"kind":"scenario","ref":"F076"}]');

  -- The status drift reads is the ruling: a department key may record an
  -- idea, never rule a concept built or cut, nor change one.
  perform pg_temp.act('build');
  assert pg_temp.refused($q$select knowledge.record('{"kind":"concept","answer":"Rogue","status":"cut","path":"well-worn","audience":"department","departments":["building"]}', 'x')$q$)
         like 'Only an operator records a concept as cut%', 'a building key recorded a concept as cut';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"concept","answer":"Rogue","status":"built","audience":"department","departments":["building"]}', 'x')$q$)
         like 'Only an operator records a concept as built%', 'a building key recorded a concept as built';
  -- Its own well-worn idea is the one record an agent may otherwise revise.
  mine := knowledge.record('{"kind":"concept","answer":"A building idea","path":"well-worn","audience":"department","departments":["building"]}', 'x');
  assert mine ~ '^CO-', 'a building key could not record an idea';
  assert pg_temp.refused(format($q$select knowledge.revise(%L, '{"status":"built"}', 'x')$q$, mine)) like 'Only an operator changes a concept%',
    'a building key ruled its own idea built';
  assert pg_temp.refused(format($q$select knowledge.revise(%L, '{"answer":"Renamed"}', 'x')$q$, mine)) like 'Only an operator changes a concept%',
    'a building key renamed a concept without an event';
  perform pg_temp.act('ops');

  assert (select array_agg(d.id order by d.id) from knowledge.concept_drift() d) = array[ghost, zombie],
    format('drift should list exactly the ghost and the zombie, got %s', (select array_agg(d.id) from knowledge.concept_drift() d));
  assert (select d.problem from knowledge.concept_drift() d where d.id = zombie) like 'ruled cut, but built on 2026-06-01%',
    'drift does not say how the zombie disagrees';
  assert (select r.back_on from knowledge.concepts_returned() r where r.id = back) = '2026-09-14',
    'a concept scoped again after its cut is not listed as come back';
  assert (select r.names from knowledge.concepts_returned() r where r.id = back) @> array['market unlock', 'Open your town'],
    'a concept that came back is not listed with every name it had';
  assert not exists (select 1 from knowledge.concepts_returned() r where r.id = zombie),
    'a concept still ruled cut is listed as come back';
end $$;
