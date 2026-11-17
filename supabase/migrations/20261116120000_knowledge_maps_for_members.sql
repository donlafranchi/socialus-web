-- F132: every department reads the story maps, including departments added
-- later (the PM, 2026-11-16: "All departments should see the maps"; option A,
-- fixed in code rather than granting access each time a department is added).
--
-- Scenario: socialus-plan planning/scenario-F132.md.
-- Tests: supabase/tests/knowledge_maps.sql, run by tests/knowledge-maps-db.test.ts.
--
-- Who reads them, now. Every key: a map item's audience is members, which
-- knowledge.can_see opens to every valid key, today's departments and later
-- ones alike. Members is internal: outside agents are served only public
-- records (F125 ruling), so nothing on a map is public or exported.
--
-- Why. 20261112200000_knowledge_story_maps.sql recorded each journey,
-- activity, task and detail as audience department, naming the departments
-- that existed at the moment of insert. That is a snapshot: a department added
-- later (F125: "a later department is a new value, not a redesign") read no
-- map at all, and the slices drawn across a journey, which copy its audience,
-- had the same gap.
--
-- What changes.
--   · knowledge.map_item writes audience members with no departments.
--     knowledge.map_slice is unchanged: it copies the journey's audience, so a
--     slice drawn across a members journey is members too.
--   · Every existing map item and journey slice still as map_item wrote it
--     moves to members, one record at a time, each a new version with this
--     reason in its history (rule and why: knowledge._maps_to_members below).
--     One an operator narrowed or widened is left as it is. The apply log
--     says how many moved.
--
-- Who writes the move. History names a person and an agent for every change,
-- so the move is made under a one-off operator key for the PM, minted and
-- revoked inside knowledge._maps_to_members; its key is never stored or shown.
--
-- No app table changes. Nothing in the app reads the schema.

-- ---------------------------------------------------------------------------
-- map_item: members, not a snapshot of the departments.

create or replace function knowledge.map_item(p jsonb, p_reason text, p_evidence jsonb default null,
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
          coalesce(p->>'status', 'proposed'),
          -- Every department plans against the maps, later ones too; none is public.
          'members', '{}', w.person, w.name,
          coalesce(p_effective, now())::date, p->>'source', p->>'parent',
          coalesce((p->>'place')::integer, knowledge._next_place(p->>'parent', k)));
  return the_id;
end $$;
comment on function knowledge.map_item(jsonb, text, jsonb, timestamptz) is
  'Records a journey, activity, task or detail under its parent, at a place (last if not given), readable by every key and never public. Any key may propose one; only an operator records one live.';

-- ---------------------------------------------------------------------------
-- The items already recorded, and the slices across their journeys.
--
-- Which ones move: a map item still as map_item wrote it, audience department
-- in every version and its departments never changed, whatever departments
-- exist now (one added since the maps were loaded is the case this is for).
-- One an operator narrowed or widened, in any version, is left as it is. A
-- journey slice moves on the same rule, and only once its journey reads as
-- members, so a slice is never seen by keys its journey is hidden from.
--
-- A function rather than a bare block so supabase/tests/knowledge_maps.sql
-- can run the move against items written the old way. Owner only.

create function knowledge._maps_to_members() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  -- A name of its own per run: a revoked key's name stays taken.
  who text := 'f132-maps-for-members-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-US');
  key text := knowledge.add_agent(who, 'the PM', '{}', true);
  r record;
  n integer := 0;
begin
  perform set_config('knowledge.key', key, true);
  for r in
    select x.id, x.kind
      from knowledge.records x
     where x.audience = 'department'
       and not exists (select 1 from knowledge.history h
                        where h.record_id = x.id
                          and (h.snapshot->>'audience' is distinct from 'department'
                               or array(select jsonb_array_elements_text(h.snapshot->'departments') order by 1)
                                  is distinct from array(select unnest(x.departments) order by 1)))
       and (knowledge._is_map_kind(x.kind)
            or (x.kind = 'slice' and exists (select 1 from knowledge.links l
                                               join knowledge.records j on j.id = l.to_id and j.kind = 'journey'
                                              where l.from_id = x.id and l.type = 'slice_of')))
     -- Map items first: a slice is checked against its journey after the journey's move.
     order by (x.kind = 'slice'), x.id
  loop
    if r.kind = 'slice' and not exists (select 1 from knowledge.links l
                                          join knowledge.records j on j.id = l.to_id and j.kind = 'journey'
                                         where l.from_id = r.id and l.type = 'slice_of' and j.audience = 'members') then
      continue;
    end if;
    -- One reason per change: the history trigger clears it after each row.
    perform knowledge._context(knowledge._writer(),
      'Every department reads the maps, including ones added later: audience members instead of a list of today''s departments.',
      '{"decided_by": "the PM", "decided_on": "2026-11-16", "scenario": "socialus-plan planning/scenario-F132.md"}'::jsonb,
      null);
    update knowledge.records set audience = 'members', departments = '{}' where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('knowledge.key', '', true);
  perform knowledge.revoke_agent(who);
  return n;
end $$;
comment on function knowledge._maps_to_members() is
  'F132, 2026-11-16: moves map items and journey slices still as the first map_item wrote them to audience members, each a new version with its reason. Returns how many moved. Owner only.';
revoke all on function knowledge._maps_to_members() from public, anon, authenticated, service_role, knowledge_store;

do $$
begin
  raise notice 'F132: % map items and journey slices moved to members.', knowledge._maps_to_members();
end $$;
