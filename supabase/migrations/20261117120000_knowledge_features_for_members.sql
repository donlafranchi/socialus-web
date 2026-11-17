-- F132: every department reads the features placed on the story maps,
-- including departments added later (the PM, 2026-11-17: "make every
-- department see those too", after 20261116120000 opened the maps
-- themselves).
--
-- Scenario: socialus-plan planning/scenario-F132.md.
-- Tests: supabase/tests/knowledge_maps.sql, run by tests/knowledge-maps-db.test.ts;
-- the imports in tests/knowledge-{maps,plans,concepts,capabilities}.test.ts.
--
-- Why. A placement is read only by a key that can read both ends, and the
-- imports recorded every feature as audience department, building only. So
-- since the maps opened to every key, a department other than building saw a
-- map's tasks but not the features that sit on them, nor whether a step is
-- built because of one.
--
-- What changes.
--   · Every feature, not only those placed today: a feature placed tomorrow
--     would otherwise be hidden again. The features are the scenarios, whose
--     files are already readable in socialus-plan; members is internal and
--     never exported (outside agents are served public records only, F125).
--     The four imports that make features (scripts/knowledge/maps.ts,
--     plans.ts, concepts.ts, capabilities.ts) now record them as members.
--   · Existing features still as an import wrote them (audience department,
--     departments unchanged in every version) move to members, one record at a
--     time, each a new version with this reason in its history. Then the
--     roadmap slices of a feature that is now members, on the same rule:
--     add_slice gives a slice its feature's audience, so a slice is read by
--     whoever reads its feature. A feature or slice an operator narrowed or
--     widened stays as it is. Plan versions stay building's.
--
-- Who writes the move: a one-off operator key for the PM, minted and revoked
-- inside knowledge._features_to_members, as 20261116120000 did.
--
-- No app table changes. Nothing in the app reads the schema.

create function knowledge._features_to_members() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  -- A name of its own per run: a revoked key's name stays taken.
  who text := 'f132-features-for-members-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-US');
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
       and (x.kind = 'feature'
            or (x.kind = 'slice' and exists (select 1 from knowledge.links l
                                               join knowledge.records f on f.id = l.to_id and f.kind = 'feature'
                                              where l.from_id = x.id and l.type = 'slice_of')))
     -- Features first: a slice is checked against its feature after the feature's move.
     order by (x.kind = 'slice'), x.id
  loop
    if r.kind = 'slice' and not exists (select 1 from knowledge.links l
                                          join knowledge.records f on f.id = l.to_id and f.kind = 'feature'
                                         where l.from_id = r.id and l.type = 'slice_of' and f.audience = 'members') then
      continue;
    end if;
    -- One reason per change: the history trigger clears it after each row.
    perform knowledge._context(knowledge._writer(),
      'Every department reads the features on the maps, including ones added later: audience members instead of building only.',
      '{"decided_by": "the PM", "decided_on": "2026-11-17", "scenario": "socialus-plan planning/scenario-F132.md"}'::jsonb,
      null);
    update knowledge.records set audience = 'members', departments = '{}' where id = r.id;
    n := n + 1;
  end loop;
  perform set_config('knowledge.key', '', true);
  perform knowledge.revoke_agent(who);
  return n;
end $$;
comment on function knowledge._features_to_members() is
  'F132, 2026-11-17: moves features, and the roadmap slices of features, still as an import wrote them to audience members, each a new version with its reason. Returns how many moved. Owner only.';
revoke all on function knowledge._features_to_members() from public, anon, authenticated, service_role, knowledge_store;

do $$
begin
  raise notice 'F132: % features and feature slices moved to members.', knowledge._features_to_members();
end $$;
