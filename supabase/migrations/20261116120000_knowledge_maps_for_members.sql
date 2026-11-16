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
--   · Every existing map item and journey slice whose audience still names
--     every department (what map_item wrote) moves to members, one record at a
--     time, each a new version with this reason in its history. One an
--     operator narrowed on purpose (to operators, or to fewer departments) is
--     left as it is.
--
-- Who writes the move. History names a person and an agent for every change,
-- so the move is made under a one-off operator key for the PM, minted here and
-- revoked at the end of this file; its key is never stored or shown.
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

do $$
declare
  key text := knowledge.add_agent('f132-maps-for-members', 'the PM', '{}', true);
  everyone text[] := array(select d.slug from knowledge.departments d);
  r record;
begin
  perform set_config('knowledge.key', key, true);
  for r in
    select x.id
      from knowledge.records x
     where x.audience = 'department' and x.departments @> everyone
       and (knowledge._is_map_kind(x.kind)
            or (x.kind = 'slice' and exists (select 1 from knowledge.links l
                                               join knowledge.records j on j.id = l.to_id and j.kind = 'journey'
                                              where l.from_id = x.id and l.type = 'slice_of')))
     order by x.id
  loop
    -- One reason per change: the history trigger clears it after each row.
    perform knowledge._context(knowledge._writer(),
      'Every department reads the maps, including ones added later: audience members instead of a list of today''s departments.',
      '{"decided_by": "the PM", "decided_on": "2026-11-16", "scenario": "socialus-plan planning/scenario-F132.md"}'::jsonb,
      null);
    update knowledge.records set audience = 'members', departments = '{}' where id = r.id;
  end loop;
  perform set_config('knowledge.key', '', true);
  perform knowledge.revoke_agent('f132-maps-for-members');
end $$;
