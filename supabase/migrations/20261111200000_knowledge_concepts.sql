-- F130 (#1232): concepts: one identity from first idea to what got built.
-- Stage 2 of the F125 store.
--
-- Scenario: socialus-plan planning/scenario-F130.md (approved 2026-11-11).
-- Brief: socialus-plan planning/briefs/concepts-in-the-store-2026-11-11.md.
-- Tests: supabase/tests/knowledge_concepts.sql, run by
-- tests/knowledge-concepts-db.test.ts. The loader is
-- scripts/knowledge/concepts.ts, called by the import; the weekly drift check
-- is scripts/knowledge/drift.ts, run by .github/workflows/knowledge-drift.yml.
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · `concept`, a new kind, ids CO-0001 on. Its id never changes (the
--     records trigger already refuses that); `answer` is its current name and
--     `why` its intent and what survived. Statuses: idea, scoped, built,
--     deferred, cut, merged.
--   · knowledge.concept_names: every name a concept has had, with the date it
--     took effect, whether it was used or refused, the ruling record behind it
--     when the store holds one, and its evidence. A refused name stays
--     refused: the table is append-only.
--   · knowledge.concept_events: each change to a concept as one event, typed
--     (idea, scoped, ruling, renamed, split, merged, cut, deferred, built,
--     reversed), dated, with what happened, its evidence (a plan commit, a
--     criterion or scenario, a web PR or commit, or the brief that traced
--     it) and the PM's words in their own field. Append-only.
--   · Four link types: split_from, merged_into, became (lineage between
--     concepts, scenarios and ideas) and scopes (a scenario scopes its
--     concept). Records are never deleted, so a link still resolves after the
--     file it was read from is gone.
--   · knowledge.name_concept and knowledge.concept_event: the only writes to
--     the two tables, by an operator (they date things in the past, which
--     only an operator does), re-runnable: the same name or event twice is
--     one row.
--   · knowledge.concept_timeline: "how did this concept change and why" in
--     one call. knowledge.find_concept: a concept by any name it ever had.
--   · knowledge.concept_drift: concepts whose built and ruled states
--     disagree. knowledge.concepts_returned: concepts cut and later back, with
--     every name they had, for the doc scan in the weekly check.
--
-- No app table changes. Nothing in the app reads the schema.

-- ---------------------------------------------------------------------------
-- The kind and the link types: rows, as #1217 designed for.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('concept', '{idea,scoped,built,deferred,cut,merged}', false, 'CO');

insert into knowledge.link_types (slug) values ('split_from'), ('merged_into'), ('became'), ('scopes');

comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains; for conditions part_of, starts_when, ends_when; for concepts split_from, merged_into, became, scopes. Marked stated, or inferred when an import guessed it.';

-- ---------------------------------------------------------------------------
-- Evidence: a non-empty list of {kind, ref}.

create function knowledge._evidence_problem(e jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when e is null or jsonb_typeof(e) <> 'array' or jsonb_array_length(e) = 0
      then 'evidence is a list of at least one {kind, ref}'
    when exists (
      select 1 from jsonb_array_elements(e) x
       where jsonb_typeof(x) <> 'object'
          or coalesce(x->>'kind', '') not in ('plan_commit', 'web_commit', 'web_pr', 'scenario', 'criterion', 'doc')
          or coalesce(btrim(x->>'ref'), '') = ''
          or exists (select 1 from jsonb_object_keys(x) k where k not in ('kind', 'ref', 'note')))
      then 'each piece of evidence is {kind, ref}, kind one of plan_commit, web_commit, web_pr, scenario, criterion, doc'
    else null
  end
$$;

-- ---------------------------------------------------------------------------
-- Names.

create table knowledge.concept_names (
  id          bigint generated always as identity primary key,
  concept_id  text not null references knowledge.records (id),
  name        text not null check (btrim(name) <> ''),
  named_on    date not null,
  state       text not null check (state in ('used', 'refused')),
  ruling_id   text references knowledge.records (id),
  evidence    jsonb not null check (knowledge._evidence_problem(evidence) is null),
  note        text,
  person      text not null,
  agent       text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (concept_id, name, state, named_on)
);
create index concept_names_name on knowledge.concept_names (lower(name));
comment on table knowledge.concept_names is
  'Every name a concept has had: when it took effect, used or refused, the ruling behind it and its evidence. Append-only: a refused name stays refused. The current name is the latest used one.';

-- ---------------------------------------------------------------------------
-- Events.

create table knowledge.concept_events (
  id          bigint generated always as identity primary key,
  concept_id  text not null references knowledge.records (id),
  type        text not null check (type in ('idea', 'scoped', 'ruling', 'renamed', 'split', 'merged', 'cut',
                                            'deferred', 'built', 'reversed')),
  happened_on date not null,
  what        text not null check (btrim(what) <> ''),
  evidence    jsonb not null check (knowledge._evidence_problem(evidence) is null),
  pm_words    text check (pm_words is null or btrim(pm_words) <> ''),
  ruling_id   text references knowledge.records (id),
  person      text not null,
  agent       text not null,
  recorded_at timestamptz not null default clock_timestamp(),
  unique (concept_id, type, happened_on, what)
);
create index concept_events_concept on knowledge.concept_events (concept_id, happened_on, id);
comment on table knowledge.concept_events is
  'Each change to a concept, one row: its type, the date, what happened, its evidence, and the PM''s words in their own field. Append-only.';
comment on column knowledge.concept_events.pm_words is 'The PM''s own words about this change, verbatim, or null.';

create trigger concept_names_append_only before update or delete on knowledge.concept_names
  for each row execute function knowledge._append_only();
create trigger concept_names_no_truncate before truncate on knowledge.concept_names
  for each statement execute function knowledge._append_only();
create trigger concept_events_append_only before update or delete on knowledge.concept_events
  for each row execute function knowledge._append_only();
create trigger concept_events_no_truncate before truncate on knowledge.concept_events
  for each statement execute function knowledge._append_only();

-- Names and events belong to a concept, and a ruling is a decision or a
-- philosophy. A trigger rather than a foreign key, because kind lives on the
-- record.
create function knowledge._concept_rows_check() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from knowledge.records r where r.id = new.concept_id and r.kind = 'concept') then
    raise exception '% is not a concept.', new.concept_id using errcode = 'check_violation';
  end if;
  if new.ruling_id is not null
     and not exists (select 1 from knowledge.records r where r.id = new.ruling_id and r.kind in ('decision', 'philosophy')) then
    raise exception '% is not a ruling: a ruling is a decision or a philosophy.', new.ruling_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger concept_names_check before insert on knowledge.concept_names
  for each row execute function knowledge._concept_rows_check();
create trigger concept_events_check before insert on knowledge.concept_events
  for each row execute function knowledge._concept_rows_check();

-- Lineage links join what a concept can be related to: concepts, scenarios
-- (features) and nothing else; `scopes` runs from a scenario to a concept.
create function knowledge._concept_links() returns trigger
language plpgsql set search_path = '' as $$
declare
  from_kind text;
  to_kind text;
begin
  if new.type not in ('split_from', 'merged_into', 'became', 'scopes') then
    return new;
  end if;
  select kind into from_kind from knowledge.records where id = new.from_id;
  select kind into to_kind from knowledge.records where id = new.to_id;
  if new.type = 'scopes' then
    if from_kind <> 'feature' or to_kind <> 'concept' then
      raise exception 'A scenario scopes a concept: % is a %, % is a %.', new.from_id, from_kind, new.to_id, to_kind
        using errcode = 'check_violation';
    end if;
  elsif from_kind not in ('concept', 'feature') or to_kind not in ('concept', 'feature') then
    raise exception 'Lineage (%) joins concepts and scenarios: % is a %, % is a %.', new.type, new.from_id, from_kind, new.to_id, to_kind
      using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger links_concepts before insert on knowledge.links
  for each row execute function knowledge._concept_links();

-- ---------------------------------------------------------------------------
-- Writes.

create function knowledge._concept_writer(p_concept text) returns knowledge.agents
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not w.operator then
    raise exception 'Only an operator records a concept''s names and events: they are dated, often in the past.'
      using errcode = 'insufficient_privilege';
  end if;
  if not exists (select 1 from knowledge.records r where r.id = p_concept and r.kind = 'concept') then
    raise exception 'No concept %.', p_concept using errcode = 'no_data_found';
  end if;
  return w;
end $$;

create function knowledge.name_concept(p_concept text, p_name text, p_on date, p_state text, p_evidence jsonb,
                                       p_ruling text default null, p_note text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._concept_writer(p_concept);
  problem text := knowledge._evidence_problem(p_evidence);
  new_id bigint;
begin
  if problem is not null then
    raise exception 'A name needs its evidence: %.', problem using errcode = 'check_violation';
  end if;
  if p_on > current_date then
    raise exception 'A name cannot be dated in the future.' using errcode = 'check_violation';
  end if;
  insert into knowledge.concept_names (concept_id, name, named_on, state, ruling_id, evidence, note, person, agent)
  values (p_concept, btrim(p_name), p_on, p_state, p_ruling, p_evidence, p_note, w.person, w.name)
  on conflict (concept_id, name, state, named_on) do nothing
  returning id into new_id;
  return new_id;
end $$;
comment on function knowledge.name_concept(text, text, date, text, jsonb, text, text) is
  'Records a name a concept took (used) or that was refused for it, dated, with its evidence and the ruling behind it. Operators only; the same name twice is one row.';

create function knowledge.concept_event(p_concept text, p_type text, p_on date, p_what text, p_evidence jsonb,
                                        p_pm_words text default null, p_ruling text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._concept_writer(p_concept);
  problem text := knowledge._evidence_problem(p_evidence);
  new_id bigint;
begin
  if problem is not null then
    raise exception 'An event needs its evidence: %.', problem using errcode = 'check_violation';
  end if;
  if p_on > current_date then
    raise exception 'An event cannot be dated in the future.' using errcode = 'check_violation';
  end if;
  insert into knowledge.concept_events (concept_id, type, happened_on, what, evidence, pm_words, ruling_id, person, agent)
  values (p_concept, p_type, p_on, btrim(p_what), p_evidence, nullif(btrim(p_pm_words), ''), p_ruling, w.person, w.name)
  on conflict (concept_id, type, happened_on, what) do nothing
  returning id into new_id;
  return new_id;
end $$;
comment on function knowledge.concept_event(text, text, date, text, jsonb, text, text) is
  'Records one change to a concept: its type, date, what happened, evidence and the PM''s words in their own field. Operators only; the same event twice is one row.';

-- ---------------------------------------------------------------------------
-- Reads. Security invoker: row-level security decides what each key sees.

create function knowledge.find_concept(p_name text)
returns table (id text, matched text, state text)
language sql stable set search_path = '' as $$
  select r.id, r.answer, 'current'
    from knowledge.records r
   where r.kind = 'concept' and (r.id = p_name or lower(r.answer) = lower(btrim(p_name)))
  union
  select n.concept_id, n.name, n.state
    from knowledge.concept_names n
   where lower(n.name) = lower(btrim(p_name))
$$;
comment on function knowledge.find_concept(text) is 'A concept by its id or any name it ever had, refused names included.';

create function knowledge.concept_timeline(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'concept', jsonb_build_object('id', r.id, 'name', r.answer, 'status', r.status, 'why', r.why,
                                  'concern', r.concern, 'source', r.source),
    'names', coalesce((
      select jsonb_agg(jsonb_build_object('name', n.name, 'on', n.named_on, 'state', n.state, 'ruling', n.ruling_id,
                                          'evidence', n.evidence, 'note', n.note) order by n.named_on, n.id)
        from knowledge.concept_names n where n.concept_id = r.id), '[]'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('on', e.happened_on, 'type', e.type, 'what', e.what, 'evidence', e.evidence,
                                          'pm_words', e.pm_words, 'ruling', e.ruling_id) order by e.happened_on, e.id)
        from knowledge.concept_events e where e.concept_id = r.id), '[]'::jsonb),
    'lineage', coalesce((
      select jsonb_agg(jsonb_build_object('from', l.from_id, 'type', l.type, 'to', l.to_id,
                                          'other', o.answer, 'other_kind', o.kind, 'other_status', o.status, 'reason', l.reason)
                       order by l.type, l.from_id, l.to_id)
        from knowledge.links l
        join knowledge.records o on o.id = case when l.from_id = r.id then l.to_id else l.from_id end
       where (l.from_id = r.id or l.to_id = r.id)
         and l.type in ('split_from', 'merged_into', 'became', 'scopes')), '[]'::jsonb))
    from knowledge.records r
   where r.id = p_id and r.kind = 'concept'
$$;
comment on function knowledge.concept_timeline(text) is
  'One call: how a concept changed and why. Its current name and status, every name with its date and ruling, every event by date with evidence and the PM''s words, and its lineage both ways.';

-- In code: a built event on or after the last cut. Ruled: the record's status.
create function knowledge.concept_drift()
returns table (id text, name text, status text, in_code boolean, last_built date, last_cut date, problem text)
language sql stable set search_path = '' as $$
  with s as (
    select r.id, r.answer, r.status,
           (select max(e.happened_on) from knowledge.concept_events e where e.concept_id = r.id and e.type = 'built') as last_built,
           (select max(e.happened_on) from knowledge.concept_events e where e.concept_id = r.id and e.type = 'cut') as last_cut
      from knowledge.records r
     where r.kind = 'concept'
  ), t as (
    select s.*, (s.last_built is not null and (s.last_cut is null or s.last_built >= s.last_cut)) as in_code from s
  )
  select t.id, t.answer, t.status, t.in_code, t.last_built, t.last_cut,
         case
           when t.in_code and t.status in ('cut', 'idea', 'merged')
             then format('ruled %s, but built on %s after its last cut', t.status, t.last_built)
           when not t.in_code and t.status = 'built' and t.last_cut is not null
             then format('ruled built, but cut on %s with no build since', t.last_cut)
           when not t.in_code and t.status = 'built'
             then 'ruled built, with no build event'
         end
    from t
   where (t.in_code and t.status in ('cut', 'idea', 'merged'))
      or (not t.in_code and t.status = 'built')
   order by t.id
$$;
comment on function knowledge.concept_drift() is
  'Concepts whose built and ruled states disagree: in code (a build on or after its last cut) while ruled cut, idea or merged; or ruled built with no build since its last cut.';

create function knowledge.concepts_returned()
returns table (id text, name text, last_cut date, back_on date, names text[])
language sql stable set search_path = '' as $$
  select r.id, r.answer, c.last_cut, b.back_on,
         array(select distinct x from unnest(array[r.answer] || array(
                 select n.name from knowledge.concept_names n where n.concept_id = r.id)) x order by x)
    from knowledge.records r
    cross join lateral (
      select max(e.happened_on) as last_cut from knowledge.concept_events e where e.concept_id = r.id and e.type = 'cut') c
    cross join lateral (
      select min(e.happened_on) as back_on from knowledge.concept_events e
       where e.concept_id = r.id and e.type in ('scoped', 'built', 'reversed', 'renamed', 'ruling')
         and e.happened_on > c.last_cut) b
   where r.kind = 'concept' and c.last_cut is not null and b.back_on is not null and r.status not in ('cut', 'merged')
   order by r.id
$$;
comment on function knowledge.concepts_returned() is
  'Concepts that were cut and came back, with every name they had: the weekly check looks for docs that still call them cut.';

-- ---------------------------------------------------------------------------
-- Row-level security and grants.

alter table knowledge.concept_names  enable row level security;
alter table knowledge.concept_events enable row level security;
create policy concept_names_of_visible_concepts on knowledge.concept_names for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = concept_id));
create policy concept_events_of_visible_concepts on knowledge.concept_events for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = concept_id));

revoke all on knowledge.concept_names, knowledge.concept_events from public, anon, authenticated, service_role;
revoke all on function
  knowledge._evidence_problem(jsonb), knowledge._concept_writer(text),
  knowledge.name_concept(text, text, date, text, jsonb, text, text),
  knowledge.concept_event(text, text, date, text, jsonb, text, text),
  knowledge.find_concept(text), knowledge.concept_timeline(text),
  knowledge.concept_drift(), knowledge.concepts_returned()
  from public, anon, authenticated, service_role;

grant select on knowledge.concept_names, knowledge.concept_events to knowledge_store;
grant execute on function
  knowledge.name_concept(text, text, date, text, jsonb, text, text),
  knowledge.concept_event(text, text, date, text, jsonb, text, text),
  knowledge.find_concept(text),
  knowledge.concept_timeline(text),
  knowledge.concept_drift(),
  knowledge.concepts_returned()
  to knowledge_store;
