-- F137 (#1525): themes in the store, with journeys that belong to one or more of them.
--
-- Scenario: socialus-plan planning/scenario-F137.md (approved 2026-11-26). Builds on F132's story maps.
-- Tests: supabase/tests/knowledge_themes.sql, run by tests/knowledge-themes-db.test.ts.
--
--   · A new kind, `theme` (TH-), proposed, live or retired, with the PM's words as its why. It has no parent, place
--     or steps: the map trigger already refuses those on any kind that is not a map item; the steps live on its
--     journeys. Audience members, as the maps are: every department reads it, nothing is public.
--   · The PM rules on themes: any key proposes one; only the PM's own key (knowledge._pm_key, #1538) records one live
--     or changes it, whatever the department switch says. His 2026-11-27 ruling keeps map items going live or changing
--     with his key, and themes sit above the maps.
--   · Which journeys sit under which themes: knowledge.theme_journeys, append-only, latest row per pair wins (as
--     placements do). Not links: a link is never removed, and a journey can leave a theme. Any key attaches or
--     detaches a journey, with a reason; agents keep it current as ideas arrive.
--   · Reads: theme_of (a theme's journeys, their built state, what is placed on them, their open questions) and
--     themes_for (every theme above a journey, a map item, or a feature or idea placed on one).
--
-- Additive: no app table, no change to existing rows. Nothing in the app reads the schema.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values ('theme', '{proposed,live,retired}', true, 'TH');

create function knowledge._themes_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'theme' and not knowledge._pm_key() then
    if tg_op = 'UPDATE' then
      raise exception 'Only an operator changes a theme: the PM rules on themes.' using errcode = 'insufficient_privilege';
    end if;
    if new.status <> 'proposed' then
      raise exception 'Any key may propose a theme; only an operator records one %.', new.status
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end $$;
create trigger records_themes before insert or update on knowledge.records
  for each row execute function knowledge._themes_before();

create function knowledge.theme(p jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  pm boolean := knowledge._pm_key();
begin
  if exists (select 1 from jsonb_object_keys(p) x where x not in ('id', 'answer', 'why', 'status', 'source')) then
    raise exception 'A theme takes id, answer, why, status and source: its steps live on its journeys.'
      using errcode = 'undefined_column';
  end if;
  return knowledge.record(
    jsonb_build_object('kind', 'theme', 'audience', 'members', 'departments', '[]'::jsonb,
                       'status', coalesce(p->>'status', case when pm then 'live' else 'proposed' end))
      || jsonb_strip_nulls(jsonb_build_object('id', p->>'id', 'answer', p->>'answer', 'why', p->>'why', 'source', p->>'source')),
    p_reason, p_evidence, p_effective);
end $$;
comment on function knowledge.theme(jsonb, text, jsonb, timestamptz) is
  'Records a theme: a name and the PM''s why. Any key proposes one; only an operator records one live.';

create table knowledge.theme_journeys (
  id         bigint generated always as identity primary key,
  theme_id   text not null references knowledge.records (id),
  journey_id text not null references knowledge.records (id),
  member     boolean not null,
  reason     text not null check (btrim(reason) <> ''),
  person     text not null,
  agent      text not null,
  at         timestamptz not null default clock_timestamp()
);
create index theme_journeys_pair on knowledge.theme_journeys (theme_id, journey_id, id desc);
create index theme_journeys_journey on knowledge.theme_journeys (journey_id);
comment on table knowledge.theme_journeys is
  'Which journeys sit under which themes: a row when a journey joins (member) or leaves a theme, with its reason. Append-only; the latest row per pair is the state now.';
create trigger theme_journeys_append_only before update or delete on knowledge.theme_journeys
  for each row execute function knowledge._append_only();
create trigger theme_journeys_no_truncate before truncate on knowledge.theme_journeys
  for each statement execute function knowledge._append_only();

create view knowledge.current_theme_journeys with (security_invoker = true) as
  select x.theme_id, x.journey_id, x.reason, x.person, x.agent, x.at
    from (select distinct on (t.theme_id, t.journey_id) t.*
            from knowledge.theme_journeys t
           order by t.theme_id, t.journey_id, t.id desc) x
   where x.member;

create function knowledge.theme_journey(p_theme text, p_journey text, p_member boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  t knowledge.records;
  j knowledge.records;
  now_member boolean;
  new_id bigint;
begin
  select * into t from knowledge.records where id = p_theme;
  select * into j from knowledge.records where id = p_journey;
  if t.id is null or not knowledge.can_see(t.audience, t.departments) or t.kind <> 'theme' or t.status = 'retired' then
    raise exception 'No theme %.', p_theme using errcode = 'no_data_found';
  end if;
  if j.id is null or not knowledge.can_see(j.audience, j.departments) or j.kind <> 'journey' then
    raise exception 'Only a journey sits under a theme; % is not one.', p_journey using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A journey joins or leaves a theme with a reason.' using errcode = 'check_violation';
  end if;
  select x.member into now_member from knowledge.theme_journeys x
   where x.theme_id = p_theme and x.journey_id = p_journey order by x.id desc limit 1;
  if coalesce(now_member, false) = p_member then
    return jsonb_build_object('theme', p_theme, 'journey', p_journey, 'member', p_member, 'unchanged', true);
  end if;
  insert into knowledge.theme_journeys (theme_id, journey_id, member, reason, person, agent)
  values (p_theme, p_journey, p_member, p_reason, w.person, w.name) returning id into new_id;
  return jsonb_build_object('id', new_id, 'theme', p_theme, 'journey', p_journey, 'member', p_member);
end $$;
comment on function knowledge.theme_journey(text, text, boolean, text) is
  'Puts a journey under a theme (true) or takes it out (false), with a reason. Any key; the same state twice writes nothing.';

-- Reads. Security invoker: row-level security decides what each key sees.
-- The open questions on a set of records: questions still open, linked either way to any of them.
create function knowledge._open_questions(p_ids text[]) returns jsonb
language sql stable set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', q.id, 'answer', q.answer) order by q.id), '[]')
    from knowledge.records q
   where q.kind = 'question' and q.status = 'open'
     and exists (select 1 from knowledge.links l
                  where (l.from_id = q.id and l.to_id = any (p_ids)) or (l.to_id = q.id and l.from_id = any (p_ids)))
$$;

create function knowledge.theme_of(p_theme text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'theme', jsonb_build_object('id', t.id, 'answer', t.answer, 'why', t.why, 'status', t.status),
    'journeys', coalesce((
      select jsonb_agg(jsonb_build_object('id', j.id, 'answer', j.answer, 'status', j.status, 'built', knowledge.built(j.id),
                                          'features', p->'features', 'ideas', p->'ideas',
                                          'questions', knowledge._open_questions(
                                            array(select knowledge._map_below(j.id))
                                            || array(select x->>'id' from jsonb_array_elements(p->'features') x)
                                            || array(select x->>'id' from jsonb_array_elements(p->'ideas') x)))
                       order by j.id)
        from knowledge.current_theme_journeys m
        join knowledge.records j on j.id = m.journey_id and j.status <> 'retired'
        cross join lateral (select knowledge.map_place(j.id) as p) mp(p)
       where m.theme_id = t.id), '[]'))
    from knowledge.records t
   where t.id = p_theme and t.kind = 'theme'
$$;
comment on function knowledge.theme_of(text) is
  'A theme in one call: its why, its journeys, whether each is built, the features and ideas placed on each, and the open questions on them.';

-- The journey an item sits in: itself, its map path, or the map item it is placed on.
create function knowledge._journey_of(p_id text) returns text
language sql stable set search_path = '' as $$
  select coalesce(
    knowledge._map_path(p_id)->'journey'->>'id',
    (select knowledge._map_path(p.on_id)->'journey'->>'id' from knowledge.current_placements p where p.item_id = p_id))
$$;

create function knowledge.themes_for(p_id text)
returns table (id text, answer text, status text, journey_id text, journey text)
language sql stable set search_path = '' as $$
  select t.id, t.answer, t.status, j.id, j.answer
    from knowledge.current_theme_journeys m
    join knowledge.records t on t.id = m.theme_id and t.status <> 'retired'
    join knowledge.records j on j.id = m.journey_id and j.status <> 'retired'
   where m.journey_id = knowledge._journey_of(p_id)
   order by t.id
$$;
comment on function knowledge.themes_for(text) is
  'Every theme above a journey, an item on a journey, or a feature or idea placed on one, with the journey that carries it.';

-- Row-level security and grants: a membership is read only while both its theme and its journey are.
alter table knowledge.theme_journeys enable row level security;
create policy theme_journeys_of_visible_records on knowledge.theme_journeys for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = theme_id)
         and exists (select 1 from knowledge.records r where r.id = journey_id));

revoke all on knowledge.theme_journeys, knowledge.current_theme_journeys from public, anon, authenticated, service_role;
grant select on knowledge.theme_journeys, knowledge.current_theme_journeys to knowledge_store;

revoke all on function
  knowledge._themes_before(), knowledge.theme(jsonb, text, jsonb, timestamptz), knowledge.theme_journey(text, text, boolean, text),
  knowledge._open_questions(text[]), knowledge.theme_of(text), knowledge._journey_of(text), knowledge.themes_for(text)
  from public, anon, authenticated, service_role;
grant execute on function
  knowledge.theme(jsonb, text, jsonb, timestamptz), knowledge.theme_journey(text, text, boolean, text),
  knowledge._open_questions(text[]), knowledge.theme_of(text), knowledge._journey_of(text), knowledge.themes_for(text)
  to knowledge_store;
