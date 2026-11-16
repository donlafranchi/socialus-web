-- bug #1340: story maps call live features "not built".
--
-- Scenario: socialus-plan planning/scenario-F132.md (criterion 3: every task
-- shows whether it is built). Tests: supabase/tests/knowledge_maps.sql.
--
-- Why. knowledge.built() (F132, 20261112200000) read only a feature's status
-- in the store and shipped slices. A feature whose scenario is still open in
-- socialus-plan carries the scenario's status (F072 is approved), not what
-- has shipped, and a walk-through's look lines had no feature on most of
-- them, so live journeys read "not built".
--
-- What. `knowledge.shipped`: what has shipped of a feature or a map item, as
-- criteria shipped out of total, from the roll-up (build-log/reports/
-- rollup.json), written by the import. Append-only; the latest row for an
-- item is what has shipped now. It sits beside the status the PM rules on
-- and never changes it. built() reads it: all shipped is built, some is
-- part built. A walk-through's tasks take their journey's evidence when
-- nothing sits on them.

create table knowledge.shipped (
  id          bigint generated always as identity primary key,
  item_id     text not null references knowledge.records (id),
  shipped     integer not null check (shipped >= 0),
  total       integer not null check (total > 0 and shipped <= total),
  source      text not null check (btrim(source) <> ''),
  as_of       date not null,
  person      text not null,
  agent       text not null,
  recorded_at timestamptz not null default clock_timestamp()
);
create index shipped_item on knowledge.shipped (item_id, id desc);
comment on table knowledge.shipped is
  'What has shipped of a feature or a map item, criteria shipped out of total, from the roll-up. Append-only; the latest row is now. Beside the status the PM rules on, never instead of it.';

create trigger shipped_append_only before update or delete on knowledge.shipped
  for each row execute function knowledge._append_only();
create trigger shipped_no_truncate before truncate on knowledge.shipped
  for each statement execute function knowledge._append_only();

alter table knowledge.shipped enable row level security;
create policy shipped_of_visible_records on knowledge.shipped for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = item_id));

-- The one write: an operator's (the import, for the PM). The same numbers
-- again are no new row.
create function knowledge.record_shipped(p_item text, p_shipped integer, p_total integer, p_source text,
                                         p_as_of date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  cur knowledge.shipped;
  k text;
  new_id bigint;
begin
  if not w.operator then
    raise exception 'Only an operator records what has shipped: the import does, from the roll-up.'
      using errcode = 'insufficient_privilege';
  end if;
  select kind into k from knowledge.records where id = p_item;
  if k is null then
    raise exception 'No record %.', p_item using errcode = 'no_data_found';
  end if;
  if not (k = 'feature' or knowledge._is_map_kind(k)) then
    raise exception 'What has shipped is recorded for a feature or a map item; % is a %.', p_item, k
      using errcode = 'check_violation';
  end if;
  select * into cur from knowledge.shipped where item_id = p_item order by id desc limit 1;
  if cur.id is not null and (cur.shipped, cur.total, cur.as_of) = (p_shipped, p_total, p_as_of) then
    return jsonb_build_object('item', p_item, 'unchanged', true);
  end if;
  insert into knowledge.shipped (item_id, shipped, total, source, as_of, person, agent)
  values (p_item, p_shipped, p_total, p_source, p_as_of, w.person, w.name) returning id into new_id;
  return jsonb_build_object('item', p_item, 'shipped', new_id);
end $$;
comment on function knowledge.record_shipped(text, integer, integer, text, date) is
  'Records how much of a feature or map item has shipped (criteria shipped out of total) from the roll-up. Operators only; the same numbers again are no new row.';

-- built, partly or not, from the latest evidence; null when there is none.
create function knowledge._shipped_state(p_id text) returns text
language sql stable set search_path = '' as $$
  select case when s.shipped >= s.total then 'built' when s.shipped > 0 then 'partly' else 'not' end
    from knowledge.shipped s where s.item_id = p_id order by s.id desc limit 1
$$;

-- A feature's built state: the better of its ruled status and what has shipped.
create function knowledge.feature_built(p_id text) returns text
language sql stable set search_path = '' as $$
  select case
           when f.status = 'shipped' or knowledge._shipped_state(f.id) = 'built' then 'built'
           when f.status = 'building' or knowledge._shipped_state(f.id) = 'partly' then 'partly'
           else 'not' end
    from knowledge.records f where f.id = p_id and f.kind = 'feature'
$$;
comment on function knowledge.feature_built(text) is
  'Whether a feature is built (built, partly, not): shipped by its status, or by what the roll-up says has shipped.';

create or replace function knowledge.built(p_id text) returns text
language plpgsql stable set search_path = '' as $$
declare
  r knowledge.records;
  own text;
  kids text[];
  ev text;
  states text[];
begin
  select * into r from knowledge.records where id = p_id;
  if r.id is null then
    return null;
  end if;
  if r.kind in ('task', 'detail') then
    states := array(select knowledge.feature_built(p.item_id)
                      from knowledge._placed_on(p_id) p join knowledge.records f on f.id = p.item_id
                     where f.kind = 'feature' and f.status <> 'dropped');
    own := case
      when exists (select 1 from knowledge.records s where s.kind = 'slice' and s.status = 'shipped' and p_id = any (s.takes))
        or 'built' = any (states) or knowledge._shipped_state(p_id) = 'built'
        then 'built'
      when exists (select 1 from knowledge.records s where s.kind = 'slice' and s.status = 'building' and p_id = any (s.takes))
        or 'partly' = any (states) or knowledge._shipped_state(p_id) = 'partly'
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
    if own = 'partly' or 'built' = any (kids) or 'partly' = any (kids) then
      return 'partly';
    end if;
    -- Nothing sits on it: a walk-through's line takes its journey's evidence.
    if cardinality(states) = 0 and cardinality(kids) = 0 then
      ev := (select knowledge._shipped_state(a.parent) from knowledge.records a where a.id = r.parent);
      return coalesce(ev, 'not');
    end if;
    return 'not';
  end if;
  if r.kind in ('activity', 'journey') then
    ev := knowledge._shipped_state(p_id);
    if ev is not null then
      return ev;
    end if;
    kids := array(select knowledge.built(t.id)
                    from knowledge.records t
                   where t.status <> 'retired' and t.kind = 'task'
                     and (t.parent = p_id
                          or (r.kind = 'journey' and t.parent in (select a.id from knowledge.records a
                                                                    where a.parent = p_id and a.status <> 'retired'))));
    if cardinality(kids) = 0 then
      return 'not';
    end if;
    return case when 'built' = all (kids) then 'built'
                when 'built' = any (kids) or 'partly' = any (kids) then 'partly' else 'not' end;
  end if;
  return null;
end $$;
comment on function knowledge.built(text) is
  'Whether a map item is built (built, partly, not), derived from shipped slices that take it, the features placed on it and what the roll-up says has shipped; never typed.';

-- The picture names each feature's built state, not only its ruled status.
create or replace function knowledge.map_place(p_id text) returns jsonb
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
      select jsonb_agg(jsonb_build_object('id', f.id, 'answer', f.answer, 'status', f.status, 'built', knowledge.feature_built(f.id),
                                          'on', p.on_id, 'basis', p.basis)
                       order by f.id)
        from knowledge._map_below(r.id) b cross join lateral knowledge._placed_on(b) p
        join knowledge.records f on f.id = p.item_id
       where f.kind = 'feature'), '[]'),
    'ideas', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'answer', c.answer, 'status', c.status, 'on', p.on_id) order by c.id)
        from knowledge._map_below(r.id) b cross join lateral knowledge._placed_on(b) p
        join knowledge.records c on c.id = p.item_id
       where c.kind = 'concept'), '[]'))
    from knowledge.records r
   where r.id = p_id and knowledge._is_map_kind(r.kind)
$$;

revoke all on knowledge.shipped from public, anon, authenticated, service_role;
grant select on knowledge.shipped to knowledge_store;
revoke all on function
  knowledge.record_shipped(text, integer, integer, text, date), knowledge._shipped_state(text),
  knowledge.feature_built(text)
  from public, anon, authenticated, service_role;
grant execute on function
  knowledge.record_shipped(text, integer, integer, text, date), knowledge._shipped_state(text),
  knowledge.feature_built(text)
  to knowledge_store;
