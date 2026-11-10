-- F125 — the knowledge store's test suite: its access rules, its history, its
-- refusals, and the stress tests in socialus-plan
-- planning/briefs/knowledge-store-stage-1-2026-11-10.md § Stress tests.
--
-- Run by tests/knowledge-store-db.test.ts. Each "-- test:" block runs in its
-- own transaction, after the preamble, and is rolled back: nothing it writes
-- survives. A block passes when it runs without an error; every assert names
-- what went wrong.
--
-- The preamble makes one agent key per kind of caller and switches to the
-- store's own login, so every block below runs as the lookup tool will: as
-- `knowledge_store`, holding a key. `pg_temp.act(name)` switches key;
-- `pg_temp.act('none')` holds none. `pg_temp.refused(sql)` runs a statement
-- and returns its error, or null when it was accepted.

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

-- test: the store's own login reaches no table outside its schema
-- [guards F125.8 partial: the department wall is the next test]
reset role;
do $$
declare
  reach text;
begin
  select string_agg(s.nspname || '.' || c.relname, ', ') into reach
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname not in ('knowledge', 'pg_catalog', 'information_schema')
     and s.nspname not like 'pg_temp%' and s.nspname not like 'pg_toast%'
     -- An extension's own catalogs (PostGIS's spatial_ref_sys, pg_stat_statements)
     -- are granted to every role by the extension's owner, not by the app.
     and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e')
     and has_schema_privilege('knowledge_store', s.oid, 'USAGE')
     and (
       (c.relkind in ('r', 'v', 'm', 'p', 'f')
         and (has_table_privilege('knowledge_store', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              or has_any_column_privilege('knowledge_store', c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')))
       or (c.relkind = 'S' and has_sequence_privilege('knowledge_store', c.oid, 'USAGE,SELECT,UPDATE'))
     );
  assert reach is null, 'the store''s login can reach: ' || reach;

  assert exists (select 1 from pg_roles where rolname = 'knowledge_store' and rolcanlogin
                   and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb),
    'the store''s login is not a plain login under row-level security';
  assert not exists (select 1 from pg_auth_members m join pg_roles r on r.oid = m.member
                      where r.rolname = 'knowledge_store'),
    'the store''s login is a member of another role';
  assert not has_schema_privilege('anon', 'knowledge', 'USAGE')
     and not has_schema_privilege('authenticated', 'knowledge', 'USAGE')
     and not has_schema_privilege('service_role', 'knowledge', 'USAGE'),
    'an app role can reach the knowledge schema';
end $$;
set local role knowledge_store;
do $$ begin
  assert pg_temp.refused('select 1 from public.members limit 1') ~ 'permission denied',
    'the store''s login read an app table';
  assert pg_temp.refused('select 1 from auth.users limit 1') ~ 'permission denied',
    'the store''s login read the sign-in table';
end $$;

-- test: a key for one department cannot read another department's internal records
-- [guards F125.8 partial: the store's own login is the test above]
select set_config('t.tns_rec', knowledge.record(
  '{"kind":"decision","concern":"moderation-and-reports","answer":"A report of a child in a photo is reviewed within the hour.","why":"A child in a photo is the case where waiting does the harm.","audience":"department","departments":["trust-and-safety"]}',
  'stress test'), true);
select set_config('t.ops_rec', knowledge.record(
  '{"kind":"pattern","answer":"Say only what we must.","why":"Every extra promise is one we can break.","audience":"operators"}',
  'stress test'), true);
select set_config('t.pub_rec', knowledge.record(
  '{"kind":"decision","concern":"posts","answer":"A post shows its town.","why":"Local first.","audience":"public"}',
  'stress test'), true);
do $$ begin
  perform pg_temp.act('build');
  assert not exists (select 1 from knowledge.records where id = current_setting('t.tns_rec')),
    'a building key read a trust-and-safety record';
  assert not exists (select 1 from knowledge.history where record_id = current_setting('t.tns_rec')),
    'a building key read a trust-and-safety record''s history';
  assert not exists (select 1 from knowledge.records where id = current_setting('t.ops_rec')),
    'a building key read an operators-only record';
  assert exists (select 1 from knowledge.records where id = current_setting('t.pub_rec')),
    'a building key could not read a public record';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.tns_rec'),
      '{"answer":"Changed by building."}', 't')) is not null,
    'a building key changed a trust-and-safety record';

  perform pg_temp.act('tns');
  assert exists (select 1 from knowledge.records where id = current_setting('t.tns_rec')),
    'a trust-and-safety key could not read its own department''s record';

  perform pg_temp.act('ops');
  assert (select count(*) from knowledge.records
           where id in (current_setting('t.tns_rec'), current_setting('t.ops_rec'), current_setting('t.pub_rec'))) = 3,
    'the operator key could not read everything';

  perform pg_temp.act('none');
  assert not exists (select 1 from knowledge.records), 'the login with no key read a record';
  perform set_config('knowledge.key', 'ks_not-a-real-key', true);
  assert not exists (select 1 from knowledge.records), 'the login with a made-up key read a record';
end $$;

-- test: no change goes around the write functions, and nothing is deleted
-- [guards F125.2 partial: the history row and the retire link are the next tests]
select set_config('t.d', knowledge.record(
  '{"kind":"decision","concern":"posts","answer":"A post lasts a week.","why":"Fresh is local.","audience":"public"}',
  'stress test'), true);
do $$ begin
  assert pg_temp.refused(format('update knowledge.records set answer = %L where id = %L', 'x', current_setting('t.d'))) ~ 'permission denied',
    'the login rewrote a record directly';
  assert pg_temp.refused(format('delete from knowledge.records where id = %L', current_setting('t.d'))) ~ 'permission denied',
    'the login deleted a record';
  assert pg_temp.refused($q$insert into knowledge.records (id, kind, answer) values ('Q-9', 'question', 'x')$q$) ~ 'permission denied',
    'the login inserted a record around the write functions';
  assert pg_temp.refused('update knowledge.history set reason = ''x''') ~ 'permission denied',
    'the login rewrote history';
  assert pg_temp.refused('delete from knowledge.history') ~ 'permission denied',
    'the login deleted history';
  assert pg_temp.refused('delete from knowledge.links') ~ 'permission denied',
    'the login deleted a link';
end $$;
reset role;
select set_config('knowledge.key', '', true);
do $$ begin
  assert pg_temp.refused(format('delete from knowledge.records where id = %L', current_setting('t.d'))) ~ 'never deleted',
    'the schema owner deleted a record';
  assert pg_temp.refused(format('update knowledge.history set reason = %L where record_id = %L', 'x', current_setting('t.d'))) ~ 'append-only',
    'the schema owner rewrote a history row';
  assert pg_temp.refused(format('delete from knowledge.history where record_id = %L', current_setting('t.d'))) ~ 'append-only',
    'the schema owner deleted a history row';
  assert pg_temp.refused(format('update knowledge.records set answer = %L where id = %L', 'x', current_setting('t.d'))) ~ 'person and an agent',
    'the schema owner changed a record without naming a person and an agent';
  perform set_config('knowledge.key', current_setting('t.ops'), true);
  assert pg_temp.refused(format('update knowledge.records set answer = %L where id = %L', 'x', current_setting('t.d'))) ~ 'reason',
    'a change went through on the reason an earlier change gave';
end $$;

-- test: every change writes a history row naming the person and the agent
-- [guards F125.2 partial: no deletes and the retire link are the tests either side]
select pg_temp.act('build');
select set_config('t.d', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"A Page shows its next event first.","why":"What is next is what a visitor came for.","audience":"department","departments":["building"],"path":"well-worn"}',
  'well-worn: event apps lead with the next date'), true);
select pg_temp.act('ops');
select knowledge.revise(current_setting('t.d'), '{"answer":"A Page shows its next two events first."}', 'two reads better than one');
do $$
declare
  v1 knowledge.history;
  v2 knowledge.history;
begin
  assert (select count(*) from knowledge.history where record_id = current_setting('t.d')) = 2,
    'two changes did not write two history rows';
  select * into v1 from knowledge.history where record_id = current_setting('t.d') and version = 1;
  select * into v2 from knowledge.history where record_id = current_setting('t.d') and version = 2;
  assert v1.person = 'a builder' and v1.agent = 't-build', 'version 1 does not name the builder and its agent';
  assert v2.person = 'the PM' and v2.agent = 't-ops', 'version 2 does not name the PM and his agent';
  assert v1.reason like 'well-worn%' and v2.reason = 'two reads better than one', 'a history row lost its reason';
  assert v1.snapshot->>'answer' = 'A Page shows its next event first.', 'version 1 no longer holds the old words';
  assert v1.valid_to = v2.valid_from and v2.valid_to is null, 'the versions do not meet end to start';
  assert (select decided_by from knowledge.records where id = current_setting('t.d')) = 'a builder'
     and (select decided_through from knowledge.records where id = current_setting('t.d')) = 't-build',
    'the record does not say who decided it and through which agent';
end $$;

-- test: a decision is retired only with a link to the newer record
-- [guards F125.2 partial: no deletes and the history row are the tests above]
select set_config('t.old', knowledge.record(
  '{"kind":"decision","concern":"explore-and-map","answer":"Explore opens on the map.","why":"Place first.","audience":"public"}', 't'), true);
select set_config('t.new', knowledge.record(
  '{"kind":"decision","concern":"explore-and-map","answer":"Explore opens on the list.","why":"Most visits are on a phone.","audience":"public"}', 't'), true);
do $$ begin
  assert pg_temp.refused(format('select knowledge.retire(%L, null, %L)', current_setting('t.old'), 'overturned')) ~ 'newer record',
    'a decision was retired with no newer record';
  assert pg_temp.refused(format('select knowledge.retire(%L, %L, %L)', current_setting('t.old'), 'D-99999', 'overturned')) ~ 'newer record',
    'a decision was retired pointing at a record that does not exist';
  assert pg_temp.refused(format('select knowledge.retire(%L, %L, %L)', current_setting('t.old'), current_setting('t.old'), 'overturned')) ~ 'newer record',
    'a decision was retired pointing at itself';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.old'), '{"status":"retired"}', 'sneak')) is not null,
    'a decision was retired by an edit, with no newer record';

  perform knowledge.retire(current_setting('t.old'), current_setting('t.new'), 'overturned: phones');
  assert (select status from knowledge.records where id = current_setting('t.old')) = 'retired', 'the retire did not land';
  assert exists (select 1 from knowledge.links where from_id = current_setting('t.new') and to_id = current_setting('t.old')
                   and type = 'replaces' and basis = 'stated'),
    'the retired decision does not point at the newer one';
end $$;
reset role;
select set_config('knowledge.key', current_setting('t.ops'), true);
select set_config('knowledge.reason', 'owner, by hand', true);
do $$ begin
  assert pg_temp.refused(format('update knowledge.records set status = %L where id = %L', 'retired', current_setting('t.new'))) ~ 'newer record',
    'the schema owner retired a decision with no newer record';
end $$;

-- test: a philosophy, pattern, decision or correction without a why is refused
-- [guards F125.3]
do $$
declare
  k text;
begin
  foreach k in array array['philosophy', 'pattern', 'decision', 'correction'] loop
    assert pg_temp.refused(format('select knowledge.record(%L, %L)',
        jsonb_build_object('kind', k, 'answer', 'Something true.', 'concern', 'posts'), 't')) ~ 'why',
      'a ' || k || ' with no why was accepted';
    assert pg_temp.refused(format('select knowledge.record(%L, %L)',
        jsonb_build_object('kind', k, 'answer', 'Something true.', 'why', '   ', 'concern', 'posts'), 't')) ~ 'why',
      'a ' || k || ' with a blank why was accepted';
  end loop;
  perform knowledge.record('{"id":"F999","kind":"feature","answer":"A test feature.","status":"draft"}', 't');
  perform set_config('t.d', knowledge.record(
    '{"kind":"decision","concern":"posts","answer":"Something true.","why":"Because.","audience":"public"}', 't'), true);
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L, %L)', current_setting('t.d'),
      '{"why":""}', 'blanking', '{"note":"test"}')) ~ 'why',
    'a decision''s why was blanked by an edit';
end $$;

-- test: one call returns every version and the chain; one call returns what was live on a date
-- [guards F125.4]
-- The brief's replacement chain: one market, Sacramento, then Northern California (2026-11-06).
select set_config('t.c0', knowledge.record(
  '{"kind":"decision","concern":"explore-and-map","answer":"Start in one dense city.","why":"Density makes a first market feel alive.","audience":"public"}',
  'import', null, '2026-08-01'), true);
select set_config('t.sac', knowledge.record(
  '{"kind":"decision","concern":"explore-and-map","answer":"One market: Sacramento.","why":"A dense start in one city.","audience":"public"}',
  'import', null, '2026-09-01'), true);
select knowledge.retire(current_setting('t.c0'), current_setting('t.sac'), 'the city chosen', '2026-09-01');
select set_config('t.norcal', knowledge.record(
  '{"kind":"decision","concern":"explore-and-map","answer":"One market: Northern California.","why":"Sacramento alone was too thin on weekdays.","audience":"public"}',
  'import', null, '2026-11-06'), true);
select knowledge.retire(current_setting('t.sac'), current_setting('t.norcal'), 'widened', '2026-11-06');
do $$
declare
  h jsonb;
begin
  h := knowledge.history_of(current_setting('t.sac'));
  assert jsonb_array_length(h->'versions') = 2, 'history_of did not return both versions: ' || h::text;
  assert h->'versions'->0->'snapshot'->>'status' = 'live' and h->'versions'->1->'snapshot'->>'status' = 'retired',
    'the versions are not in order';
  assert (select array_agg(e->>'id') from jsonb_array_elements(h->'older') e) = array[current_setting('t.c0')],
    'history_of did not walk back to the older decision: ' || (h->'older')::text;
  assert (select array_agg(e->>'id') from jsonb_array_elements(h->'newer') e) = array[current_setting('t.norcal')],
    'history_of did not walk forward to the newer decision: ' || (h->'newer')::text;
  h := knowledge.history_of(current_setting('t.c0'));
  assert jsonb_array_length(h->'newer') = 2, 'history_of did not follow the chain two steps: ' || (h->'newer')::text;

  assert (select array_agg(id) from knowledge.as_of('explore-and-map', '2026-08-15')) = array[current_setting('t.c0')],
    'as_of mid-August is not the one-city start';
  assert (select array_agg(id) from knowledge.as_of('explore-and-map', '2026-10-01')) = array[current_setting('t.sac')],
    'as_of October is not Sacramento';
  assert (select array_agg(id) from knowledge.as_of('explore-and-map', now())) = array[current_setting('t.norcal')],
    'as_of now is not Northern California';
  assert (select snapshot->>'why' from knowledge.as_of('explore-and-map', '2026-10-01')) = 'A dense start in one city.',
    'the October answer lost its why';
end $$;

-- test: every record has a kind and a strength, and they are separate
-- [guards F125.5]
do $$ begin
  perform set_config('t.d', knowledge.record(
    '{"kind":"decision","concern":"posts","answer":"Plain words, one line.","why":"Members read on phones.","audience":"public"}', 't'), true);
  assert (select strength from knowledge.records where id = current_setting('t.d')) = 'guideline',
    'a record with no strength did not default to guideline';
  perform knowledge.record('{"kind":"philosophy","answer":"Never extractive.","why":"Members are the point.","strength":"absolute"}', 't');
  perform knowledge.record('{"kind":"decision","concern":"sign-in-and-you","answer":"Sign-in is by email code only.","why":"No passwords to leak.","strength":"rule","enforced_by":"tests/auth-signup-route-t044.test.ts","audience":"public"}', 't');
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","strength":"maybe"}', 't')$q$) is not null,
    'a strength outside absolute, rule and guideline was accepted';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"opinion","answer":"x","why":"y"}', 't')$q$) is not null,
    'a kind outside the list was accepted';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","status":"shipped"}', 't')$q$) is not null,
    'a decision took a feature''s status';
  assert pg_temp.refused($q$select knowledge.record('{"id":"F998","kind":"feature","answer":"x","status":"live"}', 't')$q$) is not null,
    'a feature took a decision''s status';
  assert (select count(*) from information_schema.columns where table_schema = 'knowledge' and table_name = 'records'
           and column_name in ('kind', 'strength') and is_nullable = 'NO') = 2,
    'kind or strength can be empty';
end $$;

-- test: no record is written for one model or agent; the model a correction was seen in is evidence only
-- [guards F125.6]
-- The brief's guideline and correction: "No promises: state things as fact", and the
-- seen failure of "won't" written as "we will never".
select set_config('t.pat', knowledge.record(
  '{"kind":"pattern","answer":"No promises: state things as fact.","why":"A promise is a debt; a fact is a description.","audience":"public"}', 't'), true);
select set_config('t.cor', knowledge.record(
  '{"kind":"correction","concern":"words-and-voice","answer":"Write what we do, not what we will never do: not \"we will never sell your data\" but \"your data stays here\".","why":"\"won''t\" has been written as \"we will never\", which is a promise.","strength":"rule","audience":"public"}', 't'), true);
select knowledge.link(current_setting('t.cor'), current_setting('t.pat'), 'corrects');
do $$
declare
  as_build jsonb;
  as_tns jsonb;
begin
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","audience":"claude"}', 't')$q$) is not null,
    'a record named a model as its audience';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","audience":"agents"}', 't')$q$) is not null,
    'a record named agents as its audience';
  assert (select string_agg(table_name || '.' || column_name, ', ') from information_schema.columns
           where table_schema = 'knowledge' and column_name ~ 'model') = 'sightings.model',
    'a column other than a sighting''s evidence names a model';

  perform pg_temp.act('build');
  select to_jsonb(r) into as_build from knowledge.records r where id = current_setting('t.cor');
  perform pg_temp.act('tns');
  select to_jsonb(r) into as_tns from knowledge.records r where id = current_setting('t.cor');
  assert as_build is not null and as_build = as_tns, 'two agents were served the correction differently';

  perform pg_temp.act('ops');
  perform knowledge.log_sighting(current_setting('t.cor'), 'A reminder email said "we will never spam you".', 'some-model 4.1');
  assert (select model from knowledge.sightings where record_id = current_setting('t.cor')) = 'some-model 4.1',
    'the sighting did not keep the model as evidence';
  assert (select count(*) from knowledge.history where record_id = current_setting('t.cor')) = 1,
    'a sighting changed the correction itself';
  assert pg_temp.refused(format('select knowledge.log_sighting(%L, %L, %L)', current_setting('t.pat'), 'x', 'm')) ~ 'correction',
    'a sighting was logged against something that is not a correction';
end $$;

-- test: a settled record cannot be proposed for change by any agent; the attempt is refused and logged
-- [guards F125.7]
-- The brief's settled case: members are the investors; legal questions go to counsel.
select set_config('t.set', knowledge.record(
  '{"kind":"decision","concern":"terms","answer":"Members are the investors; legal questions go to counsel.","why":"Counsel answers what the law means for members.","audience":"public","owner":"legal","settled":true}', 't'), true);
select set_config('t.other', knowledge.record(
  '{"kind":"decision","concern":"terms","answer":"Members are customers.","why":"Simpler.","audience":"public"}', 't'), true);
do $$
declare
  r jsonb;
begin
  perform pg_temp.act('build');
  r := knowledge.revise(current_setting('t.set'), '{"answer":"Members are customers."}', 'simpler');
  assert r->>'refused' is not null, 'a building agent''s change to a settled record was not refused';
  assert pg_temp.refused(format('select knowledge.set_settled(%L, false, %L)', current_setting('t.set'), 'reopen')) ~ 'operator',
    'a building agent unsettled a settled record';

  perform pg_temp.act('ops');
  r := knowledge.revise(current_setting('t.set'), '{"why":"Shorter."}', 'tidy', '{"note":"t"}');
  assert r->>'refused' is not null, 'the operator agent''s change to a settled record was not refused';
  r := knowledge.retire(current_setting('t.set'), current_setting('t.other'), 'overturn');
  assert r->>'refused' is not null, 'a settled record was retired';
  r := knowledge.link(current_setting('t.other'), current_setting('t.set'), 'replaces');
  assert r->>'refused' is not null, 'a record was linked as replacing a settled one';

  assert (select answer from knowledge.records where id = current_setting('t.set')) = 'Members are the investors; legal questions go to counsel.'
     and (select status from knowledge.records where id = current_setting('t.set')) = 'live',
    'the settled record changed';
  assert (select count(*) from knowledge.history where record_id = current_setting('t.set')) = 1,
    'a refused change wrote a version';
  assert (select count(*) from knowledge.refusals where record_id = current_setting('t.set')) = 4,
    'the refused attempts were not all logged';
  assert exists (select 1 from knowledge.refusals where record_id = current_setting('t.set') and agent = 't-build' and person = 'a builder'),
    'a refusal does not name the agent and the person';

  perform knowledge.set_settled(current_setting('t.set'), false, 'the PM reopens it');
  r := knowledge.revise(current_setting('t.set'), '{"answer":"Members are the investors."}', 'shorter');
  assert r->>'refused' is null, 'an unsettled record could not be changed';
end $$;

-- test: the platform's why reads as it stood on any past date, and each change names its evidence
-- [guards F125.11]
select knowledge.record(
  '{"id":"platform-why","kind":"philosophy","answer":"The platform''s why.","why":"SocialUs exists so neighbours find what is on near them.","audience":"operators","strength":"absolute"}',
  'first wording', null, '2026-03-01');
do $$ begin
  assert pg_temp.refused($q$select knowledge.revise('platform-why', '{"why":"SocialUs exists so people get together."}', 'reworded')$q$) ~ 'evidence',
    'the platform''s why changed with no evidence';
  perform knowledge.revise('platform-why', '{"why":"SocialUs exists so people get together, near where they live."}',
    'reworded after the market widened', '{"records":["D-0001"],"signal":"weekday posts were thin"}', '2026-11-06');
  assert knowledge.record_as_of('platform-why', '2026-06-01')->>'why' = 'SocialUs exists so neighbours find what is on near them.',
    'the platform''s why as of June is not the first wording';
  assert knowledge.record_as_of('platform-why', now())->>'why' = 'SocialUs exists so people get together, near where they live.',
    'the platform''s why now is not the new wording';
  assert (select evidence->>'signal' from knowledge.history where record_id = 'platform-why' and version = 2) = 'weekday posts were thin',
    'the change does not name its evidence';
end $$;

-- test: the brief's stress tests
-- [guards F125.14 partial: the drift query and precedents(question) are the lookup tool's (#1219)]
-- The one never we keep: "Never extractive" departs from the no-promises pattern, as a named exception.
select set_config('t.nopromise', knowledge.record(
  '{"kind":"pattern","answer":"No promises: state things as fact.","why":"A promise is a debt.","audience":"public"}', 't'), true);
select set_config('t.never', knowledge.record(
  '{"kind":"philosophy","answer":"Never extractive.","why":"Members are the point, not the product.","strength":"absolute","holds":"always","audience":"public"}', 't'), true);
select set_config('t.d1', knowledge.record(
  '{"kind":"decision","concern":"words-and-voice","answer":"A reminder says what it is for.","why":"Fact, not promise.","audience":"public"}', 't'), true);
select set_config('t.d2', knowledge.record(
  '{"kind":"decision","concern":"emails","answer":"Emails say what we send.","why":"Fact, not promise.","audience":"public"}', 't'), true);
select knowledge.link(current_setting('t.d1'), current_setting('t.nopromise'), 'applies');
select knowledge.link(current_setting('t.d2'), current_setting('t.nopromise'), 'applies', 'inferred');
-- A rule with an end condition, and one decision three departments see.
select set_config('t.nearyou', knowledge.record(
  '{"kind":"decision","concern":"explore-and-map","answer":"No \"near you\" yet.","why":"One metro is all there is.","holds":"for now","until":"a second metro","audience":"public","as_of":"2026-09-30"}', 't'), true);
select set_config('t.fees', knowledge.record(
  '{"kind":"decision","concern":"fees-and-income","answer":"Transaction income is allowed; \"no fee\" language is retired.","why":"The platform needs an income that does not sell members.","audience":"department","departments":["finance","legal","communications"]}', 't'), true);
-- The same topic, two audiences.
select set_config('t.kids_pub', knowledge.record(
  '{"kind":"decision","concern":"child-safety","answer":"Photos of children are not posted.","why":"A child cannot agree to be shown.","audience":"public"}', 't'), true);
select set_config('t.kids_int', knowledge.record(
  '{"kind":"decision","concern":"child-safety","answer":"A photo of a child is removed on first report and the account reviewed.","why":"Speed matters more than certainty here.","audience":"department","departments":["trust-and-safety"]}', 't'), true);
select knowledge.link(current_setting('t.kids_pub'), current_setting('t.kids_int'), 'explains');
-- An agent's call, overturned.
select pg_temp.act('build');
select set_config('t.agentcall', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"A Page lists its photos newest first.","why":"Newest is most relevant.","audience":"public","path":"well-worn"}', 'well-worn'), true);
select pg_temp.act('ops');
select set_config('t.pmcall', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"A Page lists its photos in the order the owner set.","why":"The owner knows their best photo.","audience":"public"}', 't'), true);
select knowledge.retire(current_setting('t.agentcall'), current_setting('t.pmcall'), 'the PM overturned it');
-- Two live rulings that disagree, neither replacing the other.
select set_config('t.a', knowledge.record(
  '{"kind":"decision","concern":"notifications","answer":"Reminders go out the day before.","why":"Time to plan.","audience":"public"}', 't'), true);
select set_config('t.b', knowledge.record(
  '{"kind":"decision","concern":"notifications","answer":"Reminders go out the morning of.","why":"Fresh in mind.","audience":"public"}', 't'), true);
do $$
declare
  n int;
begin
  -- The one never we keep is a named exception, not a conflict.
  assert pg_temp.refused(format('select knowledge.link(%L, %L, %L)', current_setting('t.never'), current_setting('t.nopromise'), 'departs_from')) ~ 'reason',
    'a departure was recorded with no reason';
  perform knowledge.link(current_setting('t.never'), current_setting('t.nopromise'), 'departs_from', 'stated',
    '"Never" is the one promise we keep, because extraction is the harm we exist to refuse.');
  assert (select count(*) filter (where link_type = 'applies') from knowledge.precedents_of(current_setting('t.nopromise'))) = 2
     and (select count(*) filter (where link_type = 'departs_from') from knowledge.precedents_of(current_setting('t.nopromise'))) = 1,
    'the pattern does not count two that apply it and one that departs';
  assert (select count(*) from knowledge.precedents_of(current_setting('t.nopromise')) where basis = 'inferred') = 1,
    'an inferred link is not marked inferred';

  -- How strict: the agent can tell what it may depart from.
  assert (select strength from knowledge.records where id = current_setting('t.never')) = 'absolute', 'never extractive is not absolute';

  -- A rule with an end condition: everything waiting on a second metro, in one query.
  assert (select array_agg(id) from knowledge.records where holds = 'for now' and until ~* 'second metro')
         = array[current_setting('t.nearyou')],
    'the for-now decisions waiting on a second metro are not listable';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","holds":"always","until":"later"}', 't')$q$) is not null,
    'an always decision took an end condition';
  -- The review queue: for-now decisions not confirmed since a date.
  assert exists (select 1 from knowledge.records where holds = 'for now' and as_of < '2026-10-23'), 'the for-now review queue is empty';

  -- One decision, three departments: one record, seen by each, not by building.
  foreach n in array array[1, 2, 3] loop
    perform pg_temp.act((array['fin', 'legal', 'comms'])[n]);
    assert exists (select 1 from knowledge.records where id = current_setting('t.fees')),
      (array['finance', 'legal', 'communications'])[n] || ' cannot see the fees decision';
  end loop;
  perform pg_temp.act('build');
  assert not exists (select 1 from knowledge.records where id = current_setting('t.fees')), 'building can see the fees decision';

  -- The same topic, two audiences: the public rule, linked to the internal detail.
  assert exists (select 1 from knowledge.records where id = current_setting('t.kids_pub'))
     and not exists (select 1 from knowledge.records where id = current_setting('t.kids_int')),
    'building sees the wrong one of the two child-photo records';
  perform pg_temp.act('tns');
  assert exists (select 1 from knowledge.links where from_id = current_setting('t.kids_pub') and to_id = current_setting('t.kids_int') and type = 'explains'),
    'the two child-photo records are not linked';

  -- An agent's call, overturned: countable.
  perform pg_temp.act('ops');
  assert (select count(*) from knowledge.records old
            join knowledge.links l on l.to_id = old.id and l.type = 'replaces'
            join knowledge.records newer on newer.id = l.from_id
           where old.status = 'retired' and old.decided_through = 't-build' and newer.decided_by = 'the PM') = 1,
    'an overturned agent call is not countable';
  assert (select decided_by from knowledge.records where id = current_setting('t.agentcall')) = 'a builder',
    'the overturned call lost who made it';

  -- Two live rulings that disagree: both stay live and both answer for the concern.
  assert (select count(*) from knowledge.as_of('notifications', now())) = 2,
    'two live rulings in one concern did not both answer';

  -- A later department is a new value, not a redesign; a made-up one is refused.
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","audience":"department","departments":["nonsense"]}', 't')$q$) ~ 'department',
    'a record was given a department that does not exist';
end $$;

-- test: a search that finds nothing is kept, and only operators read the list
-- [guards F125.12 partial: logging every empty search is the lookup tool's (#1219)]
select pg_temp.act('build');
select knowledge.log_unanswered('Can a market stall take card payments?', 'payments');
do $$ begin
  assert not exists (select 1 from knowledge.unanswered), 'a building key read the unanswered list';
  perform pg_temp.act('ops');
  assert exists (select 1 from knowledge.unanswered where question ~ 'card payments' and agent = 't-build' and person = 'a builder'),
    'the unanswered question was not kept with its agent and person';
end $$;

-- test: philosophies, patterns and new-territory decisions are the PM's to make live
-- [guards F125.7 partial: settled is the test above; this is who may decide]
select pg_temp.act('build');
select set_config('t.prop', knowledge.record(
  '{"kind":"pattern","answer":"Show the next thing first.","why":"Three decisions say so.","audience":"department","departments":["building"]}', 'proposing a pattern'), true);
select set_config('t.nt', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"Pages can be co-owned.","why":"Clubs have committees.","audience":"department","departments":["building"],"path":"new territory"}', 'proposing'), true);
do $$ begin
  assert (select status from knowledge.records where id = current_setting('t.prop')) = 'proposed', 'a building agent''s pattern went live';
  assert (select status from knowledge.records where id = current_setting('t.nt')) = 'proposed', 'a building agent''s new-territory decision went live';
  assert pg_temp.refused(format('select knowledge.decide(%L, %L)', current_setting('t.nt'), 'go')) ~ 'operator',
    'a building agent decided its own new-territory proposal';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"philosophy","answer":"x","why":"y","status":"live","audience":"public"}', 't')$q$) ~ 'PM',
    'a building agent made a philosophy live';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"pages","answer":"x","why":"y","audience":"public","decided_by":"the PM"}', 't')$q$) ~ 'operator',
    'a building agent recorded a decision in the PM''s name';
  perform pg_temp.act('ops');
  perform knowledge.decide(current_setting('t.nt'), 'the PM approved');
  assert (select status from knowledge.records where id = current_setting('t.nt')) = 'live', 'the PM could not decide a proposal';
end $$;

-- test: a department agent changes only its own person's well-worn decisions
-- [guards F125.8 partial: what a department key may change, not what it may read]
select set_config('t.pm', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"A Page has one owner.","why":"One person answers for it.","audience":"public","path":"new territory","strength":"absolute"}', 't'), true);
select pg_temp.act('build');
select set_config('t.mine', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"A Page shows its owner.","why":"People ask who runs it.","audience":"public","path":"well-worn"}', 'well-worn'), true);
select set_config('t.prop2', knowledge.record(
  '{"kind":"decision","concern":"pages","answer":"A Page has many owners.","why":"Committees.","audience":"department","departments":["building"],"path":"new territory"}', 'proposing'), true);
do $$ begin
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.pm'), '{"answer":"A Page has many owners."}', 'x')) is not null,
    'a building agent rewrote the PM''s decision';
  assert pg_temp.refused(format('select knowledge.retire(%L, %L, %L)', current_setting('t.pm'), current_setting('t.mine'), 'x')) is not null,
    'a building agent retired the PM''s decision';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.mine'), '{"strength":"absolute"}', 'x')) is not null,
    'a building agent changed how strict a decision is';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.mine'), '{"path":"new territory"}', 'x')) is not null,
    'a building agent changed a decision''s path';
  perform knowledge.revise(current_setting('t.mine'), '{"answer":"A Page shows who runs it."}', 'clearer');
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"pages","answer":"x","why":"y","audience":"public","decided_on":"2026-01-01","path":"well-worn"}', 't')$q$) is not null,
    'a building agent back-dated a decision';
  perform set_config('t.nopath', knowledge.record(
      '{"kind":"decision","concern":"pages","answer":"No path given.","why":"y","audience":"public"}', 't'), true);
  assert (select status from knowledge.records where id = current_setting('t.nopath')) = 'proposed',
    'a building agent''s decision with no path went live';
  perform pg_temp.act('ops');
  assert pg_temp.refused(format('select knowledge.retire(%L, %L, %L)', current_setting('t.pm'), current_setting('t.prop2'), 'x')) ~ 'newer record',
    'a decision was retired in favour of a proposal that is not live';
end $$;

-- test: a department agent cannot move a record out of another department's sight
-- [guards F125.8 partial: what a department key may change, not what it may read]
select set_config('t.shared', knowledge.record(
  '{"kind":"decision","concern":"posts","answer":"Reported posts are hidden at three reports.","why":"Three is not one grudge.","audience":"department","departments":["building","trust-and-safety"]}', 't'), true);
select pg_temp.act('build');
do $$ begin
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.shared'), '{"departments":["building"]}', 'x')) is not null,
    'a building agent cut trust-and-safety off from a shared record';
  assert pg_temp.refused(format('select knowledge.revise(%L, %L, %L)', current_setting('t.shared'), '{"audience":"public"}', 'x')) is not null,
    'a building agent changed who may read a record';
  assert pg_temp.refused($q$select knowledge.record('{"kind":"decision","concern":"posts","answer":"x","why":"y","audience":"department","departments":["building","legal"],"path":"well-worn"}', 't')$q$) is not null,
    'a building agent filed a record under legal';
end $$;

-- test: an old version stays as private as it was when written
-- [guards F125.8 partial: history, not the record itself]
select pg_temp.act('tns');
select set_config('t.was_secret', knowledge.record(
  '{"kind":"decision","concern":"moderation-and-reports","answer":"Internal: the review threshold is two reports.","why":"Detail for moderators.","audience":"department","departments":["trust-and-safety"],"path":"well-worn"}', 't'), true);
select pg_temp.act('ops');
select knowledge.revise(current_setting('t.was_secret'), '{"answer":"Reports are reviewed.","audience":"public","departments":[]}', 'made public, detail removed');
do $$ begin
  perform pg_temp.act('build');
  assert exists (select 1 from knowledge.records where id = current_setting('t.was_secret')), 'the now-public record is hidden';
  assert not exists (select 1 from knowledge.history where record_id = current_setting('t.was_secret') and snapshot->>'answer' ~ 'two reports'),
    'a building key read the department-only version';
  assert knowledge.record_as_of(current_setting('t.was_secret'), now() - interval '1 microsecond') is null
     or knowledge.record_as_of(current_setting('t.was_secret'), now() - interval '1 microsecond')->>'answer' !~ 'two reports',
    'record_as_of served the department-only version';
end $$;

-- test: the store's own login can run no function the public key cannot
-- [guards F125.8 partial: functions every role can run stay runnable until the store moves to its own project]
reset role;
do $$
declare
  extra text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into extra
    from pg_proc p join pg_namespace s on s.oid = p.pronamespace
   where s.nspname not in ('knowledge', 'pg_catalog', 'information_schema') and s.nspname not like 'pg_temp%'
     and has_schema_privilege('knowledge_store', s.oid, 'USAGE')
     and has_function_privilege('knowledge_store', p.oid, 'EXECUTE')
     and not (has_schema_privilege('anon', s.oid, 'USAGE') and has_function_privilege('anon', p.oid, 'EXECUTE'));
  assert extra is null, 'the store''s login can run what the public key cannot: ' || extra;
end $$;
