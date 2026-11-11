-- F132 (#1256): story maps in the store, so every item sits in the bigger
-- picture and a new idea shows where it fits.
--
-- Scenario: socialus-plan planning/scenario-F132.md (approved 2026-11-11).
-- Research: socialus-plan planning/research/story-mapping-and-roles-2026-11-11.md.
-- Tests: supabase/tests/knowledge_maps.sql, run by tests/knowledge-maps-db.test.ts.
-- The import that brings today's maps in is scripts/knowledge/maps.ts; the
-- lookup tool's verbs are src/lib/knowledge/maps.ts.
--
-- Jeff Patton's user story mapping, as records:
--   · Four kinds: `journey` (the map), `activity` (the backbone, left to
--     right), `task` (one member, one sitting: Cockburn's sea level) and
--     `detail` (under a task, top to bottom by priority). Statuses proposed,
--     live, retired. Ids JY-, AC-, TK-, DT- and a number, or given by the
--     import. An id is identity, not location: an item that moves keeps it.
--   · Two columns, `parent` and `place`: each item knows its parent and its
--     order there. Not links, because a link is never removed and items move;
--     a move is a new version of the record, with its why, like any change.
--   · A release slice (F127's `slice`) may now be a slice_of a journey: a line
--     across the map named by its outcome. Its new column `takes` lists the
--     tasks and details above the line. Horizon, rank, status and history are
--     F127's.
--   · `knowledge.placements`: where a feature or an idea sits on a map (a
--     task or detail), or "no journey yet", with what it stands on, what must
--     be built first and what it clashes with. Append-only; the latest row for
--     an item is its place.
--   · `knowledge.map_proposals` and `map_decisions`: a change proposed to an
--     item, answered with the picture around it before it is decided.
--   · Built is derived, never typed: a task or detail is built when a shipped
--     slice takes it or a shipped feature is placed on it.
--
-- Who writes what. The PM rules on journeys and slices: only an operator
-- records a map item as live, changes one, or draws a slice. Any key may
-- propose an item, place a feature or idea, or propose a change.
--
-- record() and revise() are not replaced (F128 replaces them): neither writes
-- parent, place or takes, so a map item made through record() is refused for
-- want of them. revise() still changes an item's words and status, operators
-- only, with history.
--
-- No app table changes. Nothing in the app reads the schema.

-- ---------------------------------------------------------------------------
-- The kinds and the columns.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('journey',  '{proposed,live,retired}', false, 'JY'),
  ('activity', '{proposed,live,retired}', false, 'AC'),
  ('task',     '{proposed,live,retired}', false, 'TK'),
  ('detail',   '{proposed,live,retired}', false, 'DT');

alter table knowledge.records
  add column parent text references knowledge.records (id),
  add column place  integer check (place > 0),
  add column takes  text[];

create index records_parent on knowledge.records (parent, place);

comment on column knowledge.records.parent is
  'A story-map item''s parent: an activity''s journey, a task''s activity, a detail''s task. Map items only.';
comment on column knowledge.records.place is
  'A story-map item''s order under its parent: activities and tasks left to right, details top to bottom by priority. Map items only.';
comment on column knowledge.records.takes is
  'A journey slice''s line: the tasks and details above it. Slices of a journey only.';

-- The level above each kind on a map.
create function knowledge._map_parent_kind(p_kind text) returns text
language sql immutable set search_path = '' as $$
  select case p_kind when 'activity' then 'journey' when 'task' then 'activity' when 'detail' then 'task' end
$$;

create function knowledge._is_map_kind(p_kind text) returns boolean
language sql immutable set search_path = '' as $$
  select p_kind in ('journey', 'activity', 'task', 'detail')
$$;

-- ---------------------------------------------------------------------------
-- The rules on records.

create function knowledge._maps_before() returns trigger
language plpgsql set search_path = '' as $$
declare
  pk text;
  anc text;
  depth integer := 0;
begin
  if knowledge._is_map_kind(new.kind) then
    if new.place is null then
      raise exception 'A % has a place under its parent: record it through knowledge.map_item.', new.kind
        using errcode = 'check_violation';
    end if;
    if new.kind = 'journey' then
      if new.parent is not null then
        raise exception 'A journey is the whole map: it has no parent.' using errcode = 'check_violation';
      end if;
    else
      select kind into pk from knowledge.records where id = new.parent;
      if new.parent is null or pk is distinct from knowledge._map_parent_kind(new.kind) then
        raise exception 'A % sits under a %: % is %.', new.kind, knowledge._map_parent_kind(new.kind),
          coalesce(new.parent, 'nothing'), coalesce('a ' || pk, 'not a record') using errcode = 'check_violation';
      end if;
    end if;
    if new.takes is not null then
      raise exception 'Only a slice takes items; % is a %.', new.id, new.kind using errcode = 'check_violation';
    end if;
    -- The PM rules on journeys: an agent proposes, an operator decides.
    if not knowledge.is_operator() then
      if tg_op = 'UPDATE' then
        raise exception 'Only an operator changes a map item: propose it with knowledge.map_propose.'
          using errcode = 'insufficient_privilege';
      end if;
      if new.status <> 'proposed' then
        raise exception 'Any key may propose a %; only an operator records one as %.', new.kind, new.status
          using errcode = 'insufficient_privilege';
      end if;
    end if;
  else
    if new.parent is not null or new.place is not null then
      raise exception 'Only a story-map item has a parent and a place; % is a %.', new.id, new.kind
        using errcode = 'check_violation';
    end if;
    if new.takes is not null and new.kind <> 'slice' then
      raise exception 'Only a slice takes items; % is a %.', new.id, new.kind using errcode = 'check_violation';
    end if;
    if new.takes is not null and (tg_op = 'INSERT' or new.takes is distinct from old.takes)
       and coalesce(current_setting('knowledge.via', true), '') <> 'map_slice' then
      raise exception 'A slice''s line moves only through knowledge.map_slice or knowledge.map_retake.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger records_maps before insert or update on knowledge.records
  for each row execute function knowledge._maps_before();

-- F127's rule, widened: a slice belongs to one feature or one journey, for good.
create or replace function knowledge._plan_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type <> 'slice_of' then
    return new;
  end if;
  if not knowledge.is_operator() then
    raise exception 'Only an operator says which feature a slice belongs to: a link is never removed.'
      using errcode = 'insufficient_privilege';
  end if;
  if (select kind from knowledge.records where id = new.from_id) is distinct from 'slice'
     or (select kind from knowledge.records where id = new.to_id) not in ('feature', 'journey') then
    raise exception 'A slice is a slice_of a feature or a journey: % to %.', new.from_id, new.to_id using errcode = 'check_violation';
  end if;
  if exists (select 1 from knowledge.links l where l.from_id = new.from_id and l.type = 'slice_of' and l.to_id <> new.to_id) then
    raise exception '% already belongs to another feature or journey.', new.from_id using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Placements: where a feature or an idea sits, latest row wins.

create table knowledge.placements (
  id          bigint generated always as identity primary key,
  item_id     text not null references knowledge.records (id),
  on_id       text references knowledge.records (id),
  basis       text not null default 'stated' check (basis in ('stated', 'inferred')),
  stands_on   text[] not null default '{}',
  needs_first text[] not null default '{}',
  clashes     text[] not null default '{}',
  note        text,
  reason      text not null check (btrim(reason) <> ''),
  person      text not null,
  agent       text not null,
  placed_at   timestamptz not null default clock_timestamp()
);
create index placements_item on knowledge.placements (item_id, id desc);
create index placements_on on knowledge.placements (on_id);
comment on table knowledge.placements is
  'Where a feature or an idea sits on a story map: on a task or detail, or nowhere yet (on_id null: "no journey yet"), with what it stands on, what must be built first and what it clashes with. Append-only; the latest row for an item is its place.';

create trigger placements_append_only before update or delete on knowledge.placements
  for each row execute function knowledge._append_only();
create trigger placements_no_truncate before truncate on knowledge.placements
  for each statement execute function knowledge._append_only();

-- Each item's place now.
create view knowledge.current_placements with (security_invoker = true) as
  select distinct on (p.item_id) p.*
    from knowledge.placements p
   order by p.item_id, p.id desc;

-- ---------------------------------------------------------------------------
-- Proposed changes to a map item, and what was decided.

create table knowledge.map_proposals (
  id          bigint generated always as identity primary key,
  item_id     text not null references knowledge.records (id),
  changes     jsonb not null,
  reason      text not null check (btrim(reason) <> ''),
  person      text not null,
  agent       text not null,
  proposed_at timestamptz not null default clock_timestamp()
);
create table knowledge.map_decisions (
  proposal_id bigint primary key references knowledge.map_proposals (id),
  accepted    boolean not null,
  reason      text not null check (btrim(reason) <> ''),
  person      text not null,
  agent       text not null,
  decided_at  timestamptz not null default clock_timestamp()
);
create trigger map_proposals_append_only before update or delete on knowledge.map_proposals
  for each row execute function knowledge._append_only();
create trigger map_proposals_no_truncate before truncate on knowledge.map_proposals
  for each statement execute function knowledge._append_only();
create trigger map_decisions_append_only before update or delete on knowledge.map_decisions
  for each row execute function knowledge._append_only();
create trigger map_decisions_no_truncate before truncate on knowledge.map_decisions
  for each statement execute function knowledge._append_only();

-- ---------------------------------------------------------------------------
-- Writes.

create function knowledge._map_writer() returns knowledge.agents
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
begin
  if not w.operator then
    raise exception 'Only an operator draws or moves a slice: the PM rules on journeys and slices.'
      using errcode = 'insufficient_privilege';
  end if;
  return w;
end $$;

-- The place after the last of a parent's children.
create function knowledge._next_place(p_parent text, p_kind text) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(r.place), 0) + 1 from knowledge.records r
   where r.kind = p_kind and r.parent is not distinct from p_parent
$$;

create function knowledge.map_item(p jsonb, p_reason text, p_evidence jsonb default null,
                                   p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  k text := p->>'kind';
  parent_rec knowledge.records;
  the_id text;
begin
  if exists (select 1 from jsonb_object_keys(p) x
              where x not in ('id', 'kind', 'answer', 'why', 'parent', 'place', 'status', 'concern', 'source')) then
    raise exception 'A map item takes id, kind, answer, why, parent, place, status, concern and source.'
      using errcode = 'undefined_column';
  end if;
  if not coalesce(knowledge._is_map_kind(k), false) then
    raise exception 'A map item is a journey, activity, task or detail; not %.', coalesce(k, 'nothing')
      using errcode = 'check_violation';
  end if;
  if p ? 'parent' then
    select * into parent_rec from knowledge.records where id = p->>'parent';
    if parent_rec.id is null or not knowledge.can_see(parent_rec.audience, parent_rec.departments) then
      raise exception 'No record %.', p->>'parent' using errcode = 'no_data_found';
    end if;
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  the_id := coalesce(p->>'id', knowledge._next_id(k));
  insert into knowledge.records (id, kind, concern, answer, why, status, audience, departments, decided_by,
                                 decided_through, decided_on, source, parent, place)
  values (the_id, k, coalesce(p->>'concern', parent_rec.concern), p->>'answer', p->>'why',
          coalesce(p->>'status', 'proposed'), 'department', '{building}', w.person, w.name,
          coalesce(p_effective, now())::date, p->>'source', p->>'parent',
          coalesce((p->>'place')::integer, knowledge._next_place(p->>'parent', k)));
  return the_id;
end $$;
comment on function knowledge.map_item(jsonb, text, jsonb, timestamptz) is
  'Records a journey, activity, task or detail under its parent, at a place (last if not given). Any key may propose one; only an operator records one live.';

create function knowledge.map_move(p_id text, p_parent text, p_place integer, p_reason text,
                                   p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._map_writer();
  v integer;
begin
  if not exists (select 1 from knowledge.records r where r.id = p_id and knowledge._is_map_kind(r.kind)) then
    raise exception 'No map item %.', p_id using errcode = 'no_data_found';
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  update knowledge.records set parent = p_parent, place = p_place
   where id = p_id and (parent, place) is distinct from (p_parent, p_place)
  returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;
comment on function knowledge.map_move(text, text, integer, text, jsonb, timestamptz) is
  'Moves a map item to a parent and place, with a reason: a new version of it. Operators only; no change, no version.';

-- A line's items must be tasks or details of the slice's journey.
create function knowledge._takes_problem(p_journey text, p_takes text[]) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(t, ', ' order by t)
    from unnest(coalesce(p_takes, '{}')) t
   where not exists (
     select 1 from knowledge.records r
       join knowledge.records a on a.id = (case when r.kind = 'detail'
                                                then (select x.parent from knowledge.records x where x.id = r.parent)
                                                else r.parent end)
      where r.id = t and r.kind in ('task', 'detail') and a.parent = p_journey)
$$;

create function knowledge.map_slice(p_journey text, p_outcome text, p_takes text[], p_horizon text, p_rank integer,
                                    p_reason text, p_status text default 'planned', p_id text default null,
                                    p_waits_on text[] default '{}', p_evidence jsonb default null,
                                    p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._map_writer();
  j knowledge.records;
  the_id text;
  n integer;
  bad text;
  c text;
begin
  select * into j from knowledge.records where id = p_journey;
  if j.id is null or j.kind <> 'journey' then
    raise exception 'No journey %.', p_journey using errcode = 'no_data_found';
  end if;
  if coalesce(btrim(p_outcome), '') = '' then
    raise exception 'A slice across a journey is named by its outcome.' using errcode = 'check_violation';
  end if;
  bad := knowledge._takes_problem(p_journey, p_takes);
  if bad is not null then
    raise exception 'A slice takes tasks and details of its own journey; not %.', bad using errcode = 'check_violation';
  end if;
  if p_status = 'building' and exists (
       select 1 from unnest(coalesce(p_waits_on, '{}')) cw
        where coalesce(knowledge.condition_status(cw), '') not in ('met', 'withdrawn')) then
    raise exception 'A slice that waits on an unmet condition is not started as building.' using errcode = 'check_violation';
  end if;
  if p_id is null then
    select coalesce(max(substring(r.id from '-S(\d+)$')::integer), 0) + 1 into n
      from knowledge.records r where r.kind = 'slice' and r.id like p_journey || '-S%';
    the_id := p_journey || '-S' || n;
  else
    the_id := p_id;
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  perform set_config('knowledge.via', 'map_slice', true);
  insert into knowledge.records (id, kind, concern, answer, status, audience, departments, decided_by, decided_through,
                                 decided_on, source, horizon, rank, takes)
  values (the_id, 'slice', j.concern, p_outcome, p_status, j.audience, j.departments, w.person, w.name,
          coalesce(p_effective, now())::date, j.source, p_horizon, p_rank, coalesce(p_takes, '{}'));
  perform set_config('knowledge.via', '', true);
  insert into knowledge.links (from_id, to_id, type, reason, person, agent)
  values (the_id, p_journey, 'slice_of', 'A line across its journey.', w.person, w.name);
  foreach c in array coalesce(p_waits_on, '{}') loop
    if not exists (select 1 from knowledge.records r where r.id = c and r.kind = 'condition') then
      raise exception '% is not a condition.', c using errcode = 'check_violation';
    end if;
    insert into knowledge.links (from_id, to_id, type, reason, person, agent)
    values (the_id, c, 'starts_when', 'The slice waits on it.', w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
  end loop;
  return the_id;
end $$;
comment on function knowledge.map_slice(text, text, text[], text, integer, text, text, text, text[], jsonb, timestamptz) is
  'Draws a slice across a journey: named by its outcome, taking the tasks and details above its line, with a horizon and rank. Operators only.';

create function knowledge.map_retake(p_slice text, p_takes text[], p_reason text,
                                     p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._map_writer();
  j text;
  bad text;
  v integer;
begin
  select l.to_id into j from knowledge.links l
    join knowledge.records r on r.id = l.to_id and r.kind = 'journey'
   where l.from_id = p_slice and l.type = 'slice_of';
  if j is null then
    raise exception 'No slice across a journey %.', p_slice using errcode = 'no_data_found';
  end if;
  bad := knowledge._takes_problem(j, p_takes);
  if bad is not null then
    raise exception 'A slice takes tasks and details of its own journey; not %.', bad using errcode = 'check_violation';
  end if;
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  perform set_config('knowledge.via', 'map_slice', true);
  update knowledge.records set takes = coalesce(p_takes, '{}')
   where id = p_slice and takes is distinct from coalesce(p_takes, '{}')
  returning version into v;
  perform set_config('knowledge.via', '', true);
  return jsonb_build_object('id', p_slice, 'version', v);
end $$;
comment on function knowledge.map_retake(text, text[], text, jsonb, timestamptz) is
  'Moves a journey slice''s line: the tasks and details it takes. A new version of the slice, with its reason. Operators only.';

create function knowledge.place(p_item text, p_on text, p_reason text, p_stands_on text[] default '{}',
                                p_needs_first text[] default '{}', p_clashes text[] default '{}',
                                p_basis text default 'stated', p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  it knowledge.records;
  target knowledge.records;
  cur knowledge.placements;
  new_id bigint;
begin
  select * into it from knowledge.records where id = p_item;
  if it.id is null or not knowledge.can_see(it.audience, it.departments) then
    raise exception 'No record %.', p_item using errcode = 'no_data_found';
  end if;
  if it.kind not in ('feature', 'concept') then
    raise exception 'A feature or an idea is placed on a map; % is a %.', p_item, it.kind using errcode = 'check_violation';
  end if;
  if p_on is not null then
    select * into target from knowledge.records where id = p_on;
    if target.id is null or not knowledge.can_see(target.audience, target.departments) then
      raise exception 'No record %.', p_on using errcode = 'no_data_found';
    end if;
    if target.kind not in ('task', 'detail') then
      raise exception 'A feature or an idea sits on a task or a detail; % is a %.', p_on, target.kind
        using errcode = 'check_violation';
    end if;
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Every placement gives a reason.' using errcode = 'check_violation';
  end if;
  select * into cur from knowledge.placements where item_id = p_item order by id desc limit 1;
  if cur.id is not null
     and (cur.on_id, cur.basis, cur.stands_on, cur.needs_first, cur.clashes, cur.note)
         is not distinct from (p_on, coalesce(p_basis, 'stated'), coalesce(p_stands_on, '{}'), coalesce(p_needs_first, '{}'),
                               coalesce(p_clashes, '{}'), p_note) then
    return jsonb_build_object('item', p_item, 'on', p_on, 'unchanged', true);
  end if;
  -- A stated place is not undone by a guess.
  if cur.id is not null and cur.basis = 'stated' and coalesce(p_basis, 'stated') = 'inferred' then
    return jsonb_build_object('item', p_item, 'on', cur.on_id, 'kept', 'a stated place is not replaced by an inferred one');
  end if;
  insert into knowledge.placements (item_id, on_id, basis, stands_on, needs_first, clashes, note, reason, person, agent)
  values (p_item, p_on, coalesce(p_basis, 'stated'), coalesce(p_stands_on, '{}'), coalesce(p_needs_first, '{}'),
          coalesce(p_clashes, '{}'), p_note, p_reason, w.person, w.name)
  returning id into new_id;
  return jsonb_build_object('item', p_item, 'on', p_on, 'placement', new_id);
end $$;
comment on function knowledge.place(text, text, text, text[], text[], text[], text, text) is
  'Places a feature or an idea on a task or detail, or nowhere yet (null: "no journey yet"), with what it stands on, what must be built first and what it clashes with. Any key; a stated place is not replaced by an inferred one. The same place twice is one row.';

-- ---------------------------------------------------------------------------
-- Reads. Security invoker: row-level security decides what each key sees.

-- Built, derived: 'built', 'partly' or 'not'. A detail or task is built when
-- a shipped slice takes it or a shipped feature is placed on it, partly when a
-- building one is; a task is also built when its top detail is, and partly
-- when any detail is. An activity or journey is built when every task under
-- it is, partly when any is.
create function knowledge.built(p_id text) returns text
language plpgsql stable set search_path = '' as $$
declare
  r knowledge.records;
  own text;
  kids text[];
begin
  select * into r from knowledge.records where id = p_id;
  if r.id is null then
    return null;
  end if;
  if r.kind in ('task', 'detail') then
    own := case
      when exists (select 1 from knowledge.records s where s.kind = 'slice' and s.status = 'shipped' and p_id = any (s.takes))
        or exists (select 1 from knowledge.current_placements p join knowledge.records f on f.id = p.item_id
                    where p.on_id = p_id and f.kind = 'feature' and f.status = 'shipped')
        then 'built'
      when exists (select 1 from knowledge.records s where s.kind = 'slice' and s.status = 'building' and p_id = any (s.takes))
        or exists (select 1 from knowledge.current_placements p join knowledge.records f on f.id = p.item_id
                    where p.on_id = p_id and f.kind = 'feature' and f.status = 'building')
        then 'partly'
      else 'not' end;
    if r.kind = 'detail' or own = 'built' then
      return own;
    end if;
    kids := array(select knowledge.built(d.id) from knowledge.records d
                   where d.parent = p_id and d.kind = 'detail' and d.status <> 'retired' order by d.place, d.id);
    if cardinality(kids) > 0 and kids[1] = 'built' then
      return 'built';
    end if;
    return case when own = 'partly' or 'built' = any (kids) or 'partly' = any (kids) then 'partly' else 'not' end;
  end if;
  if r.kind in ('activity', 'journey') then
    kids := array(select knowledge.built(t.id)
                    from knowledge.records t
                   where t.status <> 'retired' and t.kind = 'task'
                     and (t.parent = p_id
                          or (r.kind = 'journey' and t.parent in (select a.id from knowledge.records a where a.parent = p_id))));
    if cardinality(kids) = 0 then
      return 'not';
    end if;
    return case when 'built' = all (kids) then 'built'
                when 'built' = any (kids) or 'partly' = any (kids) then 'partly' else 'not' end;
  end if;
  return null;
end $$;
comment on function knowledge.built(text) is
  'Whether a map item is built (built, partly, not), derived from shipped slices that take it and features placed on it; never typed.';

-- An item in a line: id, words, status, built.
create function knowledge._map_line(r knowledge.records) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'kind', r.kind, 'answer', r.answer, 'status', r.status,
                            'built', knowledge.built(r.id))
$$;

-- The journey, activity and task an item sits in, itself included.
create function knowledge._map_path(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  with recursive up as (
    select r.*, 0 as depth from knowledge.records r where r.id = p_id
    union all
    select p.*, up.depth + 1 from knowledge.records p join up on p.id = up.parent where up.depth < 4
  )
  select coalesce(jsonb_object_agg(up.kind, jsonb_build_object('id', up.id, 'answer', up.answer)), '{}')
    from up where knowledge._is_map_kind(up.kind)
$$;

-- Every task and detail under an item, itself included.
create function knowledge._map_below(p_id text) returns setof text
language sql stable set search_path = '' as $$
  with recursive down as (
    select r.id, 0 as depth from knowledge.records r where r.id = p_id
    union all
    select c.id, down.depth + 1 from knowledge.records c join down on c.parent = down.id where down.depth < 4
  )
  select id from down
$$;

-- The item before (-1) or after (1) an item in story order: a task's
-- neighbours run on across activities, as the story reads left to right;
-- anything else's are its siblings.
create function knowledge._map_beside(p_id text, p_step integer) returns jsonb
language sql stable set search_path = '' as $$
  with me as (select * from knowledge.records where id = p_id),
  peers as (
    select s.*, row_number() over (order by coalesce(a.place, 0), coalesce(a.id, ''), s.place, s.id) as n
      from knowledge.records s
      join me on s.kind = me.kind and s.status <> 'retired'
      left join knowledge.records a on me.kind = 'task' and a.id = s.parent
     where case when me.kind = 'task'
                then a.parent = (select x.parent from knowledge.records x where x.id = me.parent)
                else s.parent is not distinct from me.parent end
        or s.id = me.id
  )
  select knowledge._map_line(r)
    from knowledge.records r
   where r.id = (select p.id from peers p where p.n = (select n from peers where id = p_id) + p_step)
$$;

create function knowledge.map_place(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'item', knowledge._map_line(r) || jsonb_build_object('why', r.why),
    'place', knowledge._map_path(r.id),
    'before', knowledge._map_beside(r.id, -1),
    'after',  knowledge._map_beside(r.id, 1),
    'made_of', coalesce((select jsonb_agg(knowledge._map_line(c) order by c.place, c.id) from knowledge.records c
                          where c.parent = r.id and c.status <> 'retired'), '[]'),
    'slices', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'outcome', s.answer, 'status', s.status, 'horizon', s.horizon,
                                          'rank', s.rank, 'takes_it', r.id = any (s.takes)) order by array_position(array['now', 'next', 'later'], s.horizon), s.rank, s.id)
        from knowledge.records s
       where s.kind = 'slice'
         and (s.takes && array(select knowledge._map_below(r.id))
              or exists (select 1 from knowledge.links l where l.from_id = s.id and l.type = 'slice_of' and l.to_id = r.id))), '[]'),
    'features', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'answer', f.answer, 'status', f.status, 'on', p.on_id, 'basis', p.basis)
                       order by f.id)
        from knowledge.current_placements p join knowledge.records f on f.id = p.item_id
       where f.kind = 'feature' and p.on_id in (select knowledge._map_below(r.id))), '[]'),
    'ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'answer', c.answer, 'status', c.status, 'on', p.on_id) order by c.id)
        from knowledge.current_placements p join knowledge.records c on c.id = p.item_id
       where c.kind = 'concept' and p.on_id in (select knowledge._map_below(r.id))), '[]'))
    from knowledge.records r
   where r.id = p_id and knowledge._is_map_kind(r.kind)
$$;
comment on function knowledge.map_place(text) is
  'One call, up and down: an item''s place (journey, activity, task), the items before and after it, what it is made of, the slices that cross it, and the features and ideas placed on it or below it, each with whether it is built.';

create function knowledge.map_of(p_journey text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'journey', knowledge._map_line(j) || jsonb_build_object('why', j.why),
    'activities', coalesce((
      select jsonb_agg(knowledge._map_line(a) || jsonb_build_object('tasks', coalesce((
               select jsonb_agg(knowledge._map_line(t) || jsonb_build_object('details', coalesce((
                        select jsonb_agg(knowledge._map_line(d) order by d.place, d.id)
                          from knowledge.records d where d.parent = t.id and d.status <> 'retired'), '[]'))
                      order by t.place, t.id)
                 from knowledge.records t where t.parent = a.id and t.status <> 'retired'), '[]'))
             order by a.place, a.id)
        from knowledge.records a where a.parent = j.id and a.status <> 'retired'), '[]'),
    'slices', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'outcome', s.answer, 'status', s.status, 'horizon', s.horizon,
                                          'rank', s.rank, 'takes', to_jsonb(s.takes)) order by array_position(array['now', 'next', 'later'], s.horizon), s.rank, s.id)
        from knowledge.links l join knowledge.records s on s.id = l.from_id
       where l.type = 'slice_of' and l.to_id = j.id), '[]'))
    from knowledge.records j
   where j.id = p_journey and j.kind = 'journey'
$$;
comment on function knowledge.map_of(text) is
  'A whole journey in one call: its activities left to right, the tasks under each, the details under each task by priority, and the slices across it, each item with whether it is built.';

-- Where a new idea would fit: the tasks and details whose words share the
-- most of the idea's words (at least half, as search does), best first. An
-- idea already placed answers with its own placement.
create function knowledge.fit(p_words text, p_limit integer default 3)
returns table (on_id text, kind text, answer text, matched integer, total integer)
language sql stable set search_path = '' as $$
  with q as (
    select (select array_agg(distinct t.lexeme) from unnest(to_tsvector('english', p_words)) t) as terms
  ), docs as (
    select r.id, r.kind, r.answer,
           to_tsvector('english', r.answer || ' ' || coalesce(r.why, '') || ' ' ||
             coalesce((select string_agg(c.answer, ' ') from knowledge.records c where c.parent = r.id and c.kind = 'detail'), '')) as vec
      from knowledge.records r
     where r.kind in ('task', 'detail') and r.status <> 'retired'
  ), scored as (
    select d.id, d.kind, d.answer,
           (select count(*) from unnest(q.terms) t where d.vec @@ to_tsquery('simple', quote_literal(t)))::integer as matched,
           coalesce(cardinality(q.terms), 0) as total
      from docs d, q
  )
  select s.id, s.kind, s.answer, s.matched, s.total
    from scored s
   where s.total > 0 and s.matched > 0 and s.matched * 2 >= s.total
   order by s.matched desc, (s.kind = 'task') desc, s.id
   limit greatest(1, least(coalesce(p_limit, 3), 10))
$$;
comment on function knowledge.fit(text, integer) is
  'Where a new idea would fit: the tasks and details sharing at least half of its words, best first. None means no journey yet.';

-- The live rules a new idea must be read against: philosophies, patterns and
-- decisions sharing its words, strictest first.
create function knowledge.fit_rules(p_words text, p_limit integer default 3)
returns table (id text, kind text, strength text, answer text)
language sql stable set search_path = '' as $$
  with q as (
    select (select array_agg(distinct t.lexeme) from unnest(to_tsvector('english', p_words)) t) as terms
  ), scored as (
    select r.id, r.kind, r.strength, r.answer,
           (select count(*) from unnest(q.terms) t
             where to_tsvector('english', r.answer || ' ' || coalesce(r.why, '')) @@ to_tsquery('simple', quote_literal(t))) as matched,
           coalesce(cardinality(q.terms), 0) as total
      from knowledge.records r, q
     where r.kind in ('philosophy', 'pattern', 'decision') and r.status = 'live'
  )
  select s.id, s.kind, s.strength, s.answer from scored s
   where s.total > 0 and s.matched * 2 >= s.total
   order by array_position(array['absolute', 'rule', 'guideline'], s.strength), s.matched desc, s.id
   limit greatest(1, least(coalesce(p_limit, 3), 10))
$$;

-- ---------------------------------------------------------------------------
-- Proposing a change shows the picture first.

create function knowledge.map_propose(p_id text, p_changes jsonb, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  pk text;
  new_id bigint;
begin
  select * into r from knowledge.records where id = p_id;
  if r.id is null or not knowledge._is_map_kind(r.kind) or not knowledge.can_see(r.audience, r.departments) then
    raise exception 'No map item %.', p_id using errcode = 'no_data_found';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' or p_changes = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_changes) x where x not in ('answer', 'why', 'parent', 'place', 'status')) then
    raise exception 'A change to a map item names answer, why, parent, place or status.' using errcode = 'undefined_column';
  end if;
  if p_changes ? 'parent' then
    select kind into pk from knowledge.records where id = p_changes->>'parent';
    if pk is distinct from knowledge._map_parent_kind(r.kind) then
      raise exception 'A % sits under a %: % is not one.', r.kind, knowledge._map_parent_kind(r.kind), p_changes->>'parent'
        using errcode = 'check_violation';
    end if;
  end if;
  if p_changes ? 'status' and not (p_changes->>'status' = any (array['proposed', 'live', 'retired'])) then
    raise exception 'A map item is proposed, live or retired.' using errcode = 'check_violation';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Every proposal gives a reason.' using errcode = 'check_violation';
  end if;
  insert into knowledge.map_proposals (item_id, changes, reason, person, agent)
  values (p_id, p_changes, p_reason, w.person, w.name) returning id into new_id;
  return jsonb_build_object('proposal', new_id, 'changes', p_changes,
                            'picture', knowledge.map_place(p_id),
                            'moving_to', case when p_changes ? 'parent' then knowledge.map_place(p_changes->>'parent') end);
end $$;
comment on function knowledge.map_propose(text, jsonb, text) is
  'Proposes a change to a map item and answers with the picture before it is decided: the journey around it, the slices and features it touches, and what is built around it (and where it would move to). Any key.';

create function knowledge.map_decide(p_proposal bigint, p_accept boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._map_writer();
  pr knowledge.map_proposals;
  v integer;
begin
  select * into pr from knowledge.map_proposals where id = p_proposal;
  if pr.id is null then
    raise exception 'No proposal %.', p_proposal using errcode = 'no_data_found';
  end if;
  if exists (select 1 from knowledge.map_decisions d where d.proposal_id = p_proposal) then
    raise exception 'Proposal % is already decided.', p_proposal using errcode = 'unique_violation';
  end if;
  insert into knowledge.map_decisions (proposal_id, accepted, reason, person, agent)
  values (p_proposal, p_accept, p_reason, w.person, w.name);
  if p_accept then
    perform knowledge._context(w, p_reason, jsonb_build_object('proposal', p_proposal, 'proposed_because', pr.reason), null);
    update knowledge.records set
      answer = coalesce(pr.changes->>'answer', answer),
      why    = case when pr.changes ? 'why' then pr.changes->>'why' else why end,
      parent = coalesce(pr.changes->>'parent', parent),
      place  = coalesce((pr.changes->>'place')::integer, place),
      status = coalesce(pr.changes->>'status', status)
     where id = pr.item_id
    returning version into v;
  end if;
  return jsonb_build_object('proposal', p_proposal, 'accepted', p_accept, 'id', pr.item_id, 'version', v);
end $$;
comment on function knowledge.map_decide(bigint, boolean, text) is
  'Accepts or declines a proposed change to a map item, with a reason; accepting makes it a new version of the item. Operators only; once per proposal.';

-- ---------------------------------------------------------------------------
-- Row-level security and grants.

alter table knowledge.placements    enable row level security;
alter table knowledge.map_proposals enable row level security;
alter table knowledge.map_decisions enable row level security;
create policy placements_of_visible_records on knowledge.placements for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = item_id));
create policy map_proposals_of_visible_records on knowledge.map_proposals for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = item_id));
create policy map_decisions_of_visible_proposals on knowledge.map_decisions for select to knowledge_store
  using (exists (select 1 from knowledge.map_proposals p where p.id = proposal_id));

revoke all on knowledge.placements, knowledge.map_proposals, knowledge.map_decisions, knowledge.current_placements
  from public, anon, authenticated, service_role;
grant select on knowledge.placements, knowledge.map_proposals, knowledge.map_decisions, knowledge.current_placements
  to knowledge_store;

revoke all on function
  knowledge._map_parent_kind(text), knowledge._is_map_kind(text), knowledge._maps_before(),
  knowledge._map_writer(), knowledge._next_place(text, text), knowledge._takes_problem(text, text[]),
  knowledge.map_item(jsonb, text, jsonb, timestamptz),
  knowledge.map_move(text, text, integer, text, jsonb, timestamptz),
  knowledge.map_slice(text, text, text[], text, integer, text, text, text, text[], jsonb, timestamptz),
  knowledge.map_retake(text, text[], text, jsonb, timestamptz),
  knowledge.place(text, text, text, text[], text[], text[], text, text),
  knowledge.built(text), knowledge._map_line(knowledge.records), knowledge._map_path(text), knowledge._map_below(text),
  knowledge._map_beside(text, integer),
  knowledge.map_place(text), knowledge.map_of(text), knowledge.fit(text, integer), knowledge.fit_rules(text, integer),
  knowledge.map_propose(text, jsonb, text), knowledge.map_decide(bigint, boolean, text)
  from public, anon, authenticated, service_role;

grant execute on function
  knowledge._map_parent_kind(text), knowledge._is_map_kind(text),
  knowledge.map_item(jsonb, text, jsonb, timestamptz),
  knowledge.map_move(text, text, integer, text, jsonb, timestamptz),
  knowledge.map_slice(text, text, text[], text, integer, text, text, text, text[], jsonb, timestamptz),
  knowledge.map_retake(text, text[], text, jsonb, timestamptz),
  knowledge.place(text, text, text, text[], text[], text[], text, text),
  knowledge.built(text), knowledge._map_line(knowledge.records), knowledge._map_path(text), knowledge._map_below(text),
  knowledge._map_beside(text, integer),
  knowledge.map_place(text), knowledge.map_of(text), knowledge.fit(text, integer), knowledge.fit_rules(text, integer),
  knowledge.map_propose(text, jsonb, text), knowledge.map_decide(bigint, boolean, text)
  to knowledge_store;
