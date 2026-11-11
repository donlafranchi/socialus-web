-- F129 (#1239): anyone can ask what SocialUs can and can't do, and get a
-- short true answer. Stage 4 of the F125 store, after plans (F127, #1238).
--
-- Scenario: socialus-plan planning/scenario-F129.md (approved 2026-11-10).
-- Tests: supabase/tests/knowledge_capabilities.sql, run by
-- tests/knowledge-capabilities-db.test.ts. The generator that keeps the lines
-- true is scripts/knowledge/capabilities.ts, run nightly by
-- .github/workflows/knowledge-capabilities.yml; the lookup tool's verb is
-- src/lib/knowledge/capabilities.ts.
--
-- What it adds, all inside the `knowledge` schema from #1217:
--   · `capability`, a new kind, ids CA-0001 on: one thing a person can or
--     can't do, in a member's words (`answer`). Statuses: can (shipped and
--     proven live), cant_now (proven once, failing the live smoke tonight),
--     cant_yet (not built or not proven; `why` says what it waits on),
--     not_planned, and withdrawn (a line no longer listed).
--   · `who` on a record: the kinds of person a capability is for, any of
--     visitor (no account), member (signed in) and runner (runs a Page or an
--     event). Required on a capability, refused on every other kind.
--   · `capability_of`, a link type: a capability to its feature. That link is
--     how each line of the answer names its feature (F129.5).
--   · knowledge.set_capability: the one write, by an operator (the nightly
--     generator for the PM). It records a line or changes it; a change is a
--     new history version with its reason, and the same line twice is no change.
--     Its `waits_on` names the condition (F126) a can't-yet line waits on, as
--     a starts_when link.
--   · knowledge.capabilities(who): the lines for one kind of person, or all,
--     with each line's feature and, for a can't-yet line, the unmet
--     condition's own words.
--
-- record() and revise() are not replaced, and neither can write `who`: a
-- capability made through record() is refused for want of one.
--
-- No app table changes. Nothing in the app reads the schema.

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('capability', '{can,cant_now,cant_yet,not_planned,withdrawn}', false, 'CA');

insert into knowledge.link_types (slug) values ('capability_of');

comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains; for conditions part_of, starts_when, ends_when; for concepts split_from, merged_into, became, scopes; for plans slice_of; for capabilities capability_of. Marked stated, or inferred when an import guessed it.';

alter table knowledge.records
  add column who text[] check (who is null or (cardinality(who) > 0 and who <@ array['visitor', 'member', 'runner']));
comment on column knowledge.records.who is
  'For a capability: who it is for, any of visitor (no account), member (signed in), runner (runs a Page or an event).';

create function knowledge._capabilities_before() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'capability' and new.who is null then
    raise exception 'A capability says who it is for: record it through knowledge.set_capability.'
      using errcode = 'check_violation';
  end if;
  if new.kind <> 'capability' and new.who is not null then
    raise exception 'Only a capability says who it is for; % is a %.', new.id, new.kind using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger records_capabilities before insert or update on knowledge.records
  for each row execute function knowledge._capabilities_before();

-- A capability belongs to one feature, for good, and only an operator says so.
create function knowledge._capability_links() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.type <> 'capability_of' then
    return new;
  end if;
  if not knowledge.is_operator() then
    raise exception 'Only an operator says which feature a capability belongs to: a link is never removed.'
      using errcode = 'insufficient_privilege';
  end if;
  if (select kind from knowledge.records where id = new.from_id) is distinct from 'capability'
     or (select kind from knowledge.records where id = new.to_id) is distinct from 'feature' then
    raise exception 'A capability is a capability_of a feature: % to %.', new.from_id, new.to_id using errcode = 'check_violation';
  end if;
  if exists (select 1 from knowledge.links l where l.from_id = new.from_id and l.type = 'capability_of' and l.to_id <> new.to_id) then
    raise exception '% already belongs to another feature.', new.from_id using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger links_capabilities before insert on knowledge.links
  for each row execute function knowledge._capability_links();

-- ---------------------------------------------------------------------------
-- The write. A line is found by its source (the hand-kept words file and the
-- criteria it stands on), so its id holds while its words change.

create function knowledge.set_capability(p jsonb, p_reason text, p_evidence jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  the_id text;
  the_who text[];
  the_status text := p->>'status';
  v integer;
  changed boolean;
begin
  if not w.operator then
    raise exception 'Only an operator writes what SocialUs can do: the nightly check does it for the PM.'
      using errcode = 'insufficient_privilege';
  end if;
  if exists (select 1 from jsonb_object_keys(p) k
              where k not in ('source', 'answer', 'who', 'status', 'why', 'feature', 'waits_on', 'concern')) then
    raise exception 'A capability takes source, answer, who, status, why, feature, waits_on and concern.'
      using errcode = 'undefined_column';
  end if;
  if coalesce(btrim(p->>'source'), '') = '' or coalesce(btrim(p->>'answer'), '') = '' then
    raise exception 'A capability has a source and words.' using errcode = 'check_violation';
  end if;
  the_who := array(select distinct x from jsonb_array_elements_text(p->'who') x order by 1);
  if not exists (select 1 from knowledge.records f where f.id = p->>'feature' and f.kind = 'feature') then
    raise exception 'No feature %.', p->>'feature' using errcode = 'no_data_found';
  end if;
  if p ? 'waits_on' and jsonb_typeof(p->'waits_on') = 'string'
     and not exists (select 1 from knowledge.records c where c.id = p->>'waits_on' and c.kind = 'condition') then
    raise exception '% is not a condition.', p->>'waits_on' using errcode = 'check_violation';
  end if;
  -- Can't yet says why (F129.4): the condition it waits on, or what is missing.
  if the_status = 'cant_yet' and coalesce(btrim(p->>'why'), '') = '' and jsonb_typeof(p->'waits_on') is distinct from 'string' then
    raise exception 'A can''t-yet line says why: the condition it waits on, or what is missing.' using errcode = 'check_violation';
  end if;

  select * into r from knowledge.records where kind = 'capability' and source = p->>'source' for update;
  perform knowledge._context(w, p_reason, p_evidence, null);
  if r.id is null then
    the_id := knowledge._next_id('capability');
    insert into knowledge.records (id, kind, concern, answer, why, status, audience, departments, decided_by, decided_through,
                                   decided_on, source, who)
    values (the_id, 'capability', p->>'concern', btrim(p->>'answer'), nullif(btrim(p->>'why'), ''), the_status,
            'public', '{}', w.person, w.name, now()::date, p->>'source', the_who);
    insert into knowledge.links (from_id, to_id, type, reason, person, agent)
    values (the_id, p->>'feature', 'capability_of', 'The feature this line stands on.', w.person, w.name);
    v := 1;
  else
    the_id := r.id;
    if exists (select 1 from knowledge.links l where l.from_id = the_id and l.type = 'capability_of' and l.to_id <> p->>'feature') then
      raise exception '% belongs to another feature; a line that moves feature is a new line.', the_id using errcode = 'check_violation';
    end if;
    changed := (r.answer, r.why, r.status, r.who, r.concern)
               is distinct from (btrim(p->>'answer'), nullif(btrim(p->>'why'), ''), the_status, the_who, p->>'concern');
    if changed then
      update knowledge.records
         set answer = btrim(p->>'answer'), why = nullif(btrim(p->>'why'), ''), status = the_status, who = the_who,
             concern = p->>'concern'
       where id = the_id
      returning version into v;
    else
      v := r.version;
      perform set_config('knowledge.reason', '', true);
      perform set_config('knowledge.evidence', '', true);
    end if;
  end if;
  if jsonb_typeof(p->'waits_on') = 'string' then
    insert into knowledge.links (from_id, to_id, type, reason, person, agent)
    values (the_id, p->>'waits_on', 'starts_when', 'The line waits on it.', w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
  end if;
  return jsonb_build_object('id', the_id, 'version', v, 'changed', r.id is null or changed);
end $$;
comment on function knowledge.set_capability(jsonb, text, jsonb) is
  'Records a line of what SocialUs can do, found by its source: words, who it is for, status, why, its feature and the condition it waits on. Operators only; a change is a new version with its reason; the same line twice changes nothing.';

-- ---------------------------------------------------------------------------
-- The read. Security invoker: row-level security decides what each key sees;
-- capabilities are public, so every key reads them.

create function knowledge.capabilities(p_who text default null)
returns table (id text, who text[], words text, status text, why text, feature text,
               waits_on text, waits_on_words text, changed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  -- Security definer, so every key reads the same answer: a line's feature id
  -- is not secret, and the lines are public on purpose, but the features they
  -- link to are filed under building, which row-level security would hide from
  -- a chat project's key (and drop the feature from every line). What a key may
  -- read is still checked here, by can_see: a line it cannot read is not
  -- returned, and a condition it cannot read is named only as "something not
  -- yet public". The condition named is the latest unmet one the line waits on.
  select c.id, c.who, c.answer, c.status, c.why, l.to_id,
         case when c.status = 'cant_yet' then w.id end,
         case when c.status <> 'cant_yet' or w.id is null then null
              when knowledge.can_see(w.audience, w.departments) then w.answer
              else 'something not yet public' end,
         c.updated_at
    from knowledge.records c
    left join knowledge.links l on l.from_id = c.id and l.type = 'capability_of'
    left join lateral (
      select x.id, x.answer, x.audience, x.departments
        from knowledge.links s join knowledge.records x on x.id = s.to_id
       where s.from_id = c.id and s.type = 'starts_when'
         and coalesce(knowledge.condition_status(x.id), '') not in ('met', 'withdrawn')
       order by s.id desc limit 1) w on true
   where c.kind = 'capability' and c.status <> 'withdrawn'
     and knowledge.has_key() and knowledge.can_see(c.audience, c.departments)
     and (p_who is null or p_who = any (c.who))
   order by array_position(array['can', 'cant_now', 'cant_yet', 'not_planned'], c.status), l.to_id, c.id
$$;
comment on function knowledge.capabilities(text) is
  'What SocialUs can and can''t do, for one kind of person (visitor, member, runner) or all: each line''s words, status, why, feature id, and for a can''t-yet line the latest unmet condition it waits on, in its own words where this key may read it. The same for every key.';

revoke all on function
  knowledge.set_capability(jsonb, text, jsonb), knowledge.capabilities(text)
  from public, anon, authenticated, service_role;
grant execute on function
  knowledge.set_capability(jsonb, text, jsonb), knowledge.capabilities(text)
  to knowledge_store;
