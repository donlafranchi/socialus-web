-- F125 / T1016 (#1217) — the knowledge store, stage 1: its schema, its own
-- login, its access rules, its history, and its refusals.
--
-- Design: socialus-plan planning/briefs/knowledge-store-stage-1-2026-11-10.md.
-- Scenario: socialus-plan planning/scenario-F125.md (approved 2026-11-10).
-- Tests: supabase/tests/knowledge_store.sql, run by tests/knowledge-store-db.test.ts.
--
-- What it is. One schema, `knowledge`, that holds every decision, philosophy,
-- pattern and correction with its why, how strict it is, who may see it, and
-- every version it has had. It is not one of the API's exposed schemas
-- (supabase/config.toml lists only public and graphql_public), no app role
-- can reach it, and nothing in the app reads it. No app table changes here.
--
-- Who reaches it. Its own login, `knowledge_store`, created here WITHOUT a
-- password: the password is set out of band, as the PM, and kept in the
-- environment's secrets (`alter role knowledge_store password '…'`), because
-- a migration is in git. That login can use this schema and nothing else.
-- It reads through row-level security and writes only through the functions
-- below. Every caller also holds an agent key (`knowledge.key`, set per
-- transaction): one key per agent, tied to a person and departments, like a
-- restricted API key. No key, or a revoked one, sees nothing. An agent never
-- has permissions of its own: it sees at most what its person's departments
-- see, and an operator key (the PM's) sees everything.
--
-- What it refuses.
--   · A philosophy, pattern, decision or correction without a why.
--   · Retiring a decision without a link to the newer record that replaces it.
--   · Any delete, of anything; any rewrite of a history row.
--   · Any change that does not name a person, an agent and a reason; every
--     change to a record writes a full copy to `history`, with the time it
--     became true and the time it stopped (valid_from, valid_to). The trigger
--     writes it, not the caller, so no path around it skips it.
--   · Any change proposed against a settled record, by any agent. That
--     refusal is answered rather than raised, so the row in `refusals` that
--     logs it survives.
--   · An audience naming an agent or a model. Audience is public, members,
--     department or operators; the model a correction was seen in is kept in
--     `sightings`, as evidence, and filters nothing.
--
-- Reach outside the schema. The login holds no grant on any table, view or
-- sequence outside `knowledge`. Postgres still gives every role what it
-- gives PUBLIC: the `public` and `net` functions anyone may run. The suite
-- proves that is never more than the public anon key reaches; closing it
-- entirely is the move to the store's own project (F125 ruling, 2026-11-10).
--
-- Not here: the import (#1218), the lookup tool (#1219), the nightly export
-- (#1220).

create schema if not exists knowledge;
comment on schema knowledge is
  'F125: the platform''s decisions, philosophies, patterns and corrections, each with its why and every version. Reached only by the knowledge_store login, through row-level security and the write functions.';
revoke all on schema knowledge from public;

-- ---------------------------------------------------------------------------
-- The login. No password in git; see the header.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'knowledge_store') then
    create role knowledge_store login nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;
  end if;
end $$;
alter role knowledge_store set search_path = knowledge;
alter role knowledge_store set statement_timeout = '10s';
comment on role knowledge_store is
  'F125: the knowledge store''s own login. Uses the knowledge schema and nothing else. Its password is set out of band, never in a migration.';
grant usage on schema knowledge to knowledge_store;

-- ---------------------------------------------------------------------------
-- Departments and concerns. A later department or concern is a new row, not a
-- redesign (F125 ruling, 2026-11-10).

create table knowledge.departments (
  slug text primary key check (slug ~ '^[a-z][a-z-]*[a-z]$'),
  name text not null
);

create table knowledge.concerns (
  slug       text primary key check (slug ~ '^[a-z][a-z-]*[a-z]$'),
  name       text not null,
  department text not null references knowledge.departments (slug)
);

insert into knowledge.departments (slug, name) values
  ('building',           'Building'),
  ('finance',            'Finance'),
  ('telemetry-and-bugs', 'Telemetry and bugs'),
  ('communications',     'Communications'),
  ('trust-and-safety',   'Trust and safety'),
  ('legal',              'Legal');

insert into knowledge.concerns (slug, name, department) values
  ('explore-and-map',           'Explore and the map',            'building'),
  ('pages',                     'Pages',                          'building'),
  ('posts',                     'Posts',                          'building'),
  ('sign-in-and-you',           'Sign-in and you',                'building'),
  ('sharing-and-links',         'Sharing and links',              'building'),
  ('search-and-ranking',        'Search and ranking',             'building'),
  ('onboarding',                'Onboarding',                     'building'),
  ('uploads',                   'Uploads',                        'building'),
  ('notifications',             'Notifications',                  'building'),
  ('ontology',                  'The ontology',                   'building'),
  ('fees-and-income',           'Fees and transaction income',    'finance'),
  ('payments',                  'Payments',                       'finance'),
  ('performance',               'Performance',                    'telemetry-and-bugs'),
  ('uptime-and-alerts',         'Uptime and alerts',              'telemetry-and-bugs'),
  ('errors',                    'Errors',                         'telemetry-and-bugs'),
  ('ci-and-deploys',            'CI and deploys',                 'telemetry-and-bugs'),
  ('words-and-voice',           'Words and voice',                'communications'),
  ('emails',                    'Emails',                         'communications'),
  ('landing-and-announcements', 'Landing and announcements',      'communications'),
  ('moderation-and-reports',    'Moderation and reports',         'trust-and-safety'),
  ('privacy',                   'Privacy',                        'trust-and-safety'),
  ('security',                  'Security',                       'trust-and-safety'),
  ('child-safety',              'Child safety',                   'trust-and-safety'),
  ('terms',                     'Terms',                          'legal'),
  ('consent',                   'Consent',                        'legal'),
  ('data-retention',            'Data retention',                 'legal'),
  ('counsel-open-items',        'Counsel''s open items',          'legal');

-- ---------------------------------------------------------------------------
-- Agents: one key per agent, tied to a person and departments. Only the hash
-- of the key is stored; the key is shown once, by add_agent.

create table knowledge.agents (
  name        text primary key check (name ~ '^[a-z0-9][a-z0-9._-]*$'),
  person      text not null check (btrim(person) <> ''),
  departments text[] not null default '{}',
  operator    boolean not null default false,
  key_hash    text not null unique,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
comment on table knowledge.agents is
  'One key per agent, acting for one person. The agent sees what its departments see; an operator (the PM''s agents) sees everything. A key names no model.';

-- ---------------------------------------------------------------------------
-- Kinds and link types are rows, not hard-coded lists: a later kind (a
-- condition decisions wait on, say) or link type is an insert in a later
-- migration, never a rewrite of the tables.

create table knowledge.kinds (
  slug        text primary key check (slug ~ '^[a-z][a-z-]*[a-z]$'),
  statuses    text[] not null check (cardinality(statuses) > 0),
  needs_why   boolean not null default false,
  id_prefix   text unique check (id_prefix ~ '^[A-Z]{1,3}$'),
  last_number integer not null default 0
);
comment on table knowledge.kinds is
  'Every kind of record: its statuses, whether it needs a why, and its id prefix (none: the record keeps its own id, as features do). A new kind is a new row.';

insert into knowledge.kinds (slug, statuses, needs_why, id_prefix) values
  ('philosophy', '{proposed,live,retired}',                     true,  'PH'),
  ('pattern',    '{proposed,live,retired}',                     true,  'PT'),
  ('decision',   '{proposed,live,retired}',                     true,  'D'),
  ('correction', '{proposed,live,retired}',                     true,  'C'),
  ('feature',    '{draft,approved,building,shipped,dropped}',   false, null),
  ('criterion',  '{proposed,live,retired}',                     false, null),
  ('question',   '{open,answered}',                             false, 'Q'),
  ('risk',       '{open,accepted,closed}',                      false, 'R'),
  ('noun',       '{live,coming,refused,retired}',               false, 'N'),
  ('verb',       '{live,coming,refused,retired}',               false, 'V'),
  ('link',       '{live,coming,refused,retired}',               false, 'L');

create table knowledge.link_types (
  slug text primary key check (slug ~ '^[a-z][a-z_]*[a-z]$')
);
comment on table knowledge.link_types is 'Every way two records relate. A new link type is a new row.';

insert into knowledge.link_types (slug) values
  ('replaces'), ('implements'), ('governs'), ('depends_on'), ('guards'),
  ('relates'), ('applies'), ('departs_from'), ('corrects'), ('explains');

-- ---------------------------------------------------------------------------
-- Records: one table for every kind (the brief § The record).

create table knowledge.records (
  id              text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9._-]*$'),
  kind            text not null references knowledge.kinds (slug),
  concern         text references knowledge.concerns (slug),
  answer          text not null check (btrim(answer) <> ''),
  why             text,
  status          text not null,
  strength        text not null default 'guideline' check (strength in ('absolute', 'rule', 'guideline')),
  enforced_by     text,
  scope           text check (scope in ('product', 'process')),
  audience        text not null default 'operators' check (audience in ('public', 'members', 'department', 'operators')),
  departments     text[] not null default '{}',
  owner           text,
  decided_by      text,
  decided_through text,
  decided_on      date,
  path            text check (path in ('well-worn', 'new territory')),
  holds           text check (holds in ('always', 'for now')),
  until           text,
  settled         boolean not null default false,
  as_of           date,
  source          text,
  tags            text[] not null default '{}',
  embedding       vector(1536),
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint records_department_audience_names_one check (audience <> 'department' or cardinality(departments) > 0),
  constraint records_until_only_for_now check (until is null or holds = 'for now')
);
comment on table knowledge.records is
  'Every decision, philosophy, pattern and correction, one row each, with its why. Never deleted: retired or dropped keeps it findable. Changed only through the write functions; every change writes a full copy to history.';
comment on column knowledge.records.decided_through is
  'The agent a decision was recorded through, when an agent recorded it for its person.';
comment on column knowledge.records.settled is
  'The PM has said do not re-raise: any change proposed against it is refused and logged.';

create index records_concern_status on knowledge.records (concern, status);
create index records_kind_status on knowledge.records (kind, status);


-- ---------------------------------------------------------------------------
-- History: a full copy of the record at every version. Append-only: a row is
-- written once and closed once (valid_to), never rewritten or deleted.

create table knowledge.history (
  record_id   text not null references knowledge.records (id),
  version     integer not null,
  snapshot    jsonb not null,
  valid_from  timestamptz not null,
  valid_to    timestamptz,
  person      text not null,
  agent       text not null,
  reason      text not null,
  evidence    jsonb,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key (record_id, version),
  check (valid_to is null or valid_to >= valid_from)
);
create index history_valid on knowledge.history (record_id, valid_from);
create index history_concern on knowledge.history ((snapshot->>'concern'), valid_from);
comment on table knowledge.history is
  'Every version of every record, in full, with when it became true (valid_from) and stopped (valid_to), who changed it, through which agent, why, and on what evidence. Append-only. The snapshot leaves out the embedding.';

-- ---------------------------------------------------------------------------
-- Links between records. Append-only.

create table knowledge.links (
  id         bigint generated always as identity primary key,
  from_id    text not null references knowledge.records (id),
  to_id      text not null references knowledge.records (id),
  type       text not null references knowledge.link_types (slug),
  basis      text not null default 'stated' check (basis in ('stated', 'inferred')),
  reason     text,
  person     text not null,
  agent      text not null,
  created_at timestamptz not null default now(),
  unique (from_id, to_id, type),
  constraint links_not_to_itself check (from_id <> to_id),
  constraint links_a_departure_names_its_reason check (type <> 'departs_from' or coalesce(btrim(reason), '') <> '')
);
create index links_to on knowledge.links (to_id, type);
comment on table knowledge.links is
  'How records relate: replaces, implements, governs, depends_on, guards, relates, applies, departs_from, corrects, explains. Marked stated, or inferred when an import guessed it.';

-- References out to the trackers: the store links to them, it does not copy them.
create table knowledge.refs (
  id         bigint generated always as identity primary key,
  record_id  text not null references knowledge.records (id),
  kind       text not null check (kind in ('issue', 'pr', 'alert', 'deploy', 'doc', 'other')),
  url        text not null,
  label      text,
  person     text not null,
  agent      text not null,
  created_at timestamptz not null default now()
);
create index refs_record on knowledge.refs (record_id);

-- Every search that found nothing.
create table knowledge.unanswered (
  id       bigint generated always as identity primary key,
  question text not null check (btrim(question) <> ''),
  concern  text,
  kind     text,
  person   text not null,
  agent    text not null,
  asked_at timestamptz not null default now()
);

-- Each time a correction's failure is seen again: when, an example, and, as
-- plain evidence, the model that produced it. Evidence only: nothing is
-- served by model.
create table knowledge.sightings (
  id         bigint generated always as identity primary key,
  record_id  text not null references knowledge.records (id),
  seen_on    date not null default current_date,
  example    text not null check (btrim(example) <> ''),
  model      text,
  person     text not null,
  agent      text not null,
  created_at timestamptz not null default now()
);
create index sightings_record on knowledge.sightings (record_id, seen_on);

-- Every change the store refused because the record is settled.
create table knowledge.refusals (
  id        bigint generated always as identity primary key,
  record_id text not null references knowledge.records (id),
  action    text not null,
  reason    text not null,
  person    text not null,
  agent     text not null,
  at        timestamptz not null default clock_timestamp()
);

-- ---------------------------------------------------------------------------
-- Who is asking. The key travels as the setting knowledge.key, set by the
-- lookup tool for each transaction.

create function knowledge._agent() returns knowledge.agents
language sql stable security definer set search_path = '' as $$
  select a.*
    from knowledge.agents a
   where a.key_hash = encode(sha256(convert_to(nullif(current_setting('knowledge.key', true), ''), 'UTF8')), 'hex')
     and a.revoked_at is null
$$;

create function knowledge.whoami() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when a.name is null then null
              else jsonb_build_object('agent', a.name, 'person', a.person,
                                      'departments', to_jsonb(a.departments), 'operator', a.operator) end
    from knowledge._agent() a
$$;
comment on function knowledge.whoami() is 'The agent and person the current key belongs to, or null.';

create function knowledge.can_see(p_audience text, p_departments text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case
             when a.operator then true
             when p_audience in ('public', 'members') then true
             when p_audience = 'department' then a.departments && p_departments
             else false
           end
      from knowledge._agent() a
     where a.name is not null), false)
$$;
comment on function knowledge.can_see(text, text[]) is
  'Whether the current key may read a record with this audience. Stage 1: public and members records are open to every key; a department record to keys of that department; operators records to operator keys only.';

create function knowledge.is_operator() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select a.operator from knowledge._agent() a where a.name is not null), false)
$$;

create function knowledge.has_key() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from knowledge._agent() a where a.name is not null)
$$;

create function knowledge._writer() returns knowledge.agents
language plpgsql stable security definer set search_path = '' as $$
declare
  w knowledge.agents;
begin
  w := knowledge._agent();
  if w.name is null then
    raise exception 'Every change names a person and an agent; this one holds no valid agent key (knowledge.key).'
      using errcode = 'insufficient_privilege';
  end if;
  return w;
end $$;

-- Sets the reason, evidence and date the history trigger records.
create function knowledge._context(w knowledge.agents, p_reason text, p_evidence jsonb, p_effective timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'Every change gives a reason.' using errcode = 'check_violation';
  end if;
  if p_effective is not null and not w.operator then
    raise exception 'Only an operator dates a change in the past.' using errcode = 'insufficient_privilege';
  end if;
  if p_effective > now() then
    raise exception 'A change cannot be dated in the future.' using errcode = 'check_violation';
  end if;
  perform set_config('knowledge.reason', p_reason, true);
  perform set_config('knowledge.evidence', coalesce(p_evidence::text, ''), true);
  perform set_config('knowledge.effective', coalesce(p_effective::text, ''), true);
end $$;

create function knowledge._refuse(w knowledge.agents, p_id text, p_action text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  insert into knowledge.refusals (record_id, action, reason, person, agent)
  values (p_id, p_action, p_reason, w.person, w.name);
  return jsonb_build_object('id', p_id, 'refused', p_reason);
end $$;

create function knowledge._check_departments(p_departments text[]) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  bad text;
begin
  select string_agg(d, ', ') into bad
    from unnest(coalesce(p_departments, '{}')) d
   where not exists (select 1 from knowledge.departments x where x.slug = d);
  if bad is not null then
    raise exception 'No such department: %. A new department is a new row in knowledge.departments.', bad
      using errcode = 'foreign_key_violation';
  end if;
end $$;

create function knowledge._next_id(p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  prefix text;
  n integer;
  candidate text;
begin
  select id_prefix into prefix from knowledge.kinds where slug = p_kind;
  if prefix is null then
    raise exception 'A % keeps its own id; give one.', p_kind using errcode = 'not_null_violation';
  end if;
  loop
    update knowledge.kinds set last_number = last_number + 1 where slug = p_kind returning last_number into n;
    candidate := prefix || '-' || lpad(n::text, 4, '0');
    exit when not exists (select 1 from knowledge.records where id = candidate);
  end loop;
  return candidate;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers: history on every change, nothing deleted, history append-only,
-- a retired decision always points at its replacement.

create function knowledge._records_before() returns trigger
language plpgsql set search_path = '' as $$
declare
  k knowledge.kinds;
begin
  if tg_op = 'DELETE' then
    raise exception 'A record is never deleted; retire it instead.' using errcode = 'restrict_violation';
  end if;
  if tg_op = 'UPDATE' then
    if new.id <> old.id or new.kind <> old.kind then
      raise exception 'A record keeps its id and its kind.' using errcode = 'check_violation';
    end if;
    new.version := old.version + 1;
    new.created_at := old.created_at;
  else
    new.version := 1;
  end if;
  new.updated_at := now();
  perform knowledge._check_departments(new.departments);
  select * into k from knowledge.kinds where slug = new.kind;
  if not new.status = any (k.statuses) then
    raise exception 'A % takes a status from: %; not %.', new.kind, array_to_string(k.statuses, ', '), new.status
      using errcode = 'check_violation';
  end if;
  if k.needs_why and coalesce(btrim(new.why), '') = '' then
    raise exception 'A % needs a why.', new.kind using errcode = 'check_violation';
  end if;
  return new;
end $$;

create function knowledge._records_history() returns trigger
language plpgsql set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  why text := nullif(btrim(current_setting('knowledge.reason', true)), '');
  -- A change takes effect at its transaction's time, so every change in one
  -- transaction lands together; versions it passes through are zero-length.
  eff timestamptz := coalesce(nullif(current_setting('knowledge.effective', true), '')::timestamptz, now());
  open_from timestamptz;
begin
  if why is null then
    raise exception 'Every change gives a reason.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' then
    select valid_from into open_from from knowledge.history where record_id = new.id and valid_to is null;
    if open_from > eff then
      raise exception 'A change cannot be dated before the version it replaces (%).', open_from
        using errcode = 'check_violation';
    end if;
    update knowledge.history set valid_to = eff where record_id = new.id and valid_to is null;
  end if;
  insert into knowledge.history (record_id, version, snapshot, valid_from, person, agent, reason, evidence)
  values (new.id, new.version, to_jsonb(new) - 'embedding', eff, w.person, w.name, why,
          nullif(current_setting('knowledge.evidence', true), '')::jsonb);
  -- One reason per change: the next change has to give its own.
  perform set_config('knowledge.reason', '', true);
  perform set_config('knowledge.evidence', '', true);
  perform set_config('knowledge.effective', '', true);
  return null;
end $$;

create function knowledge._retired_needs_newer() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'decision' and new.status = 'retired'
     and not exists (select 1 from knowledge.links where to_id = new.id and type = 'replaces') then
    raise exception 'A decision is retired only with a link to the newer record that replaces it (%).', new.id
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create function knowledge._history_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and old.valid_to is null and new.valid_to is not null
     and (new.record_id, new.version, new.snapshot, new.valid_from, new.person, new.agent, new.reason, new.evidence, new.recorded_at)
         is not distinct from
         (old.record_id, old.version, old.snapshot, old.valid_from, old.person, old.agent, old.reason, old.evidence, old.recorded_at) then
    return new;
  end if;
  raise exception 'History is append-only: a version is closed once and never rewritten or deleted.'
    using errcode = 'restrict_violation';
end $$;

create function knowledge._append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception '% is append-only: nothing in it is changed or deleted.', tg_table_name
    using errcode = 'restrict_violation';
end $$;

create trigger records_before before insert or update or delete on knowledge.records
  for each row execute function knowledge._records_before();
create trigger records_history after insert or update on knowledge.records
  for each row execute function knowledge._records_history();
create constraint trigger records_retired_needs_newer after insert or update on knowledge.records
  deferrable initially immediate
  for each row execute function knowledge._retired_needs_newer();
create trigger records_no_truncate before truncate on knowledge.records
  for each statement execute function knowledge._append_only();

create trigger history_append_only before update or delete on knowledge.history
  for each row execute function knowledge._history_append_only();
create trigger history_no_truncate before truncate on knowledge.history
  for each statement execute function knowledge._append_only();

create trigger links_append_only before update or delete on knowledge.links
  for each row execute function knowledge._append_only();
create trigger links_no_truncate before truncate on knowledge.links
  for each statement execute function knowledge._append_only();
create trigger refusals_append_only before update or delete on knowledge.refusals
  for each row execute function knowledge._append_only();
create trigger sightings_append_only before update or delete on knowledge.sightings
  for each row execute function knowledge._append_only();
create trigger unanswered_append_only before update or delete on knowledge.unanswered
  for each row execute function knowledge._append_only();

-- A department agent changes only its own person's well-worn calls: the
-- brief's role table lets it record well-worn decisions and propose the rest;
-- only an operator decides anything.
create function knowledge._own_call(w knowledge.agents, r knowledge.records) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if r.kind in ('philosophy', 'pattern') then
    raise exception 'Philosophies and patterns change only when the PM decides; record a proposal instead.'
      using errcode = 'insufficient_privilege';
  end if;
  if r.decided_by is distinct from w.person or r.path is distinct from 'well-worn' or r.strength = 'absolute' then
    raise exception 'An agent changes only its own person''s well-worn calls; propose a newer record instead.'
      using errcode = 'insufficient_privilege';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Writes. Each is the only way in, checks the key, and leaves the history row
-- to the trigger.

create function knowledge.record(p jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  k text := p->>'kind';
  allowed text[] := array['id', 'kind', 'concern', 'answer', 'why', 'status', 'strength', 'enforced_by', 'scope',
                          'audience', 'departments', 'owner', 'decided_by', 'decided_on', 'path', 'holds', 'until',
                          'settled', 'as_of', 'source', 'tags', 'embedding'];
  extra text;
  the_id text;
  the_status text;
  the_audience text := coalesce(p->>'audience', 'operators');
  the_departments text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p->'departments') x), '{}');
  -- A non-operator's decision that does not say it is well-worn is treated as
  -- new territory: it starts proposed.
  pm_only boolean := k in ('philosophy', 'pattern') or p->>'path' = 'new territory'
                     or (k = 'decision' and p->>'path' is null and not w.operator);
  -- Typed from the column, so the cast finds pgvector whichever schema holds it.
  the_embedding knowledge.records.embedding%type := p->>'embedding';
begin
  perform knowledge._context(w, p_reason, p_evidence, p_effective);

  select string_agg(key, ', ') into extra from jsonb_object_keys(p) key where key <> all (allowed);
  if extra is not null then
    raise exception 'A record has no field %.', extra using errcode = 'undefined_column';
  end if;
  if not exists (select 1 from knowledge.kinds x where x.slug = k) then
    raise exception 'No such kind: %. A new kind is a new row in knowledge.kinds.', k using errcode = 'foreign_key_violation';
  end if;
  if (select needs_why from knowledge.kinds x where x.slug = k) and coalesce(btrim(p->>'why'), '') = '' then
    raise exception 'A % needs a why.', k using errcode = 'check_violation';
  end if;

  -- Default: proposed where the kind has it and the PM must decide, else live
  -- where the kind has it, else the kind's first status.
  the_status := coalesce(p->>'status', (
    select case
             when pm_only and not w.operator and 'proposed' = any (x.statuses) then 'proposed'
             when 'live' = any (x.statuses) then 'live'
             else x.statuses[1] end
      from knowledge.kinds x where x.slug = k));
  if the_status = 'retired' then
    raise exception 'A record is retired through knowledge.retire, with what replaced it.' using errcode = 'check_violation';
  end if;
  if not w.operator then
    if pm_only and the_status = 'live' then
      raise exception 'Philosophies, patterns and new-territory decisions go live only when the PM decides.'
        using errcode = 'insufficient_privilege';
    end if;
    if p ? 'decided_by' or p ? 'decided_on' then
      raise exception 'Only an operator records a decision in someone else''s name; an agent''s decision names its own person.'
        using errcode = 'insufficient_privilege';
    end if;
    if coalesce((p->>'settled')::boolean, false) then
      raise exception 'Only an operator settles a record.' using errcode = 'insufficient_privilege';
    end if;
    if not knowledge.can_see(the_audience, the_departments) or not the_departments <@ w.departments then
      raise exception 'An agent writes only records its key can read, filed under its own departments.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  the_id := coalesce(p->>'id', knowledge._next_id(k));

  insert into knowledge.records (id, kind, concern, answer, why, status, strength, enforced_by, scope, audience,
                                 departments, owner, decided_by, decided_through, decided_on, path, holds, until,
                                 settled, as_of, source, tags, embedding)
  values (the_id, k, p->>'concern', p->>'answer', p->>'why', the_status, coalesce(p->>'strength', 'guideline'),
          p->>'enforced_by', p->>'scope', the_audience, the_departments, p->>'owner',
          coalesce(p->>'decided_by', w.person),
          case when p ? 'decided_by' then null else w.name end,
          coalesce((p->>'decided_on')::date, coalesce(p_effective, now())::date),
          p->>'path', p->>'holds', p->>'until',
          coalesce((p->>'settled')::boolean, false), (p->>'as_of')::date, p->>'source',
          coalesce((select array_agg(x) from jsonb_array_elements_text(p->'tags') x), '{}'),
          the_embedding);
  return the_id;
end $$;
comment on function knowledge.record(jsonb, text, jsonb, timestamptz) is
  'Records a new record. A philosophy, pattern, decision or correction needs a why. A non-operator''s philosophy, pattern or new-territory decision starts proposed. p_effective (operators only) dates it in the past, for an import.';

create function knowledge.revise(p_id text, p_changes jsonb, p_reason text, p_evidence jsonb default null, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  allowed text[] := array['concern', 'answer', 'why', 'status', 'strength', 'enforced_by', 'scope', 'audience',
                          'departments', 'owner', 'path', 'holds', 'until', 'as_of', 'source', 'tags', 'embedding'];
  extra text;
  new_audience text;
  new_departments text[];
  the_embedding knowledge.records.embedding%type := p_changes->>'embedding';
  v integer;
begin
  perform knowledge._context(w, p_reason, p_evidence, p_effective);
  select * into r from knowledge.records where id = p_id for update;
  if not found or not knowledge.can_see(r.audience, r.departments) then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'revise', 'This record is settled: the PM has said do not re-raise it.');
  end if;

  select string_agg(key, ', ') into extra from jsonb_object_keys(p_changes) key where key <> all (allowed);
  if extra is not null then
    raise exception 'A revise cannot change %.', extra using errcode = 'check_violation';
  end if;
  if p_changes ? 'status' and (p_changes->>'status' in ('live', 'retired')
                               or (select 'retired' = any (x.statuses) from knowledge.kinds x where x.slug = r.kind)) then
    raise exception 'A % changes status through knowledge.decide or knowledge.retire.', r.kind using errcode = 'check_violation';
  end if;
  if p_changes ? 'why' and (select x.needs_why from knowledge.kinds x where x.slug = r.kind)
     and coalesce(btrim(p_changes->>'why'), '') = '' then
    raise exception 'A % needs a why.', r.kind using errcode = 'check_violation';
  end if;
  if p_changes ? 'why' and p_changes->>'why' is distinct from r.why and p_evidence is null then
    raise exception 'A new why names its evidence: the decisions, exceptions or signals that prompted it.'
      using errcode = 'check_violation';
  end if;

  new_audience := coalesce(p_changes->>'audience', r.audience);
  new_departments := case when p_changes ? 'departments'
    then coalesce((select array_agg(x) from jsonb_array_elements_text(p_changes->'departments') x), '{}')
    else r.departments end;
  if not w.operator then
    perform knowledge._own_call(w, r);
    if p_changes ?| array['strength', 'path', 'audience', 'departments'] then
      raise exception 'Only an operator changes how strict a record is, its path, or who may read it.'
        using errcode = 'insufficient_privilege';
    end if;
  end if;

  update knowledge.records set
    concern     = case when p_changes ? 'concern'     then p_changes->>'concern'     else concern end,
    answer      = case when p_changes ? 'answer'      then p_changes->>'answer'      else answer end,
    why         = case when p_changes ? 'why'         then p_changes->>'why'         else why end,
    status      = case when p_changes ? 'status'      then p_changes->>'status'      else status end,
    strength    = case when p_changes ? 'strength'    then p_changes->>'strength'    else strength end,
    enforced_by = case when p_changes ? 'enforced_by' then p_changes->>'enforced_by' else enforced_by end,
    scope       = case when p_changes ? 'scope'       then p_changes->>'scope'       else scope end,
    audience    = new_audience,
    departments = new_departments,
    owner       = case when p_changes ? 'owner'       then p_changes->>'owner'       else owner end,
    path        = case when p_changes ? 'path'        then p_changes->>'path'        else path end,
    holds       = case when p_changes ? 'holds'       then p_changes->>'holds'       else holds end,
    until       = case when p_changes ? 'until'       then p_changes->>'until'       else until end,
    as_of       = case when p_changes ? 'as_of'       then (p_changes->>'as_of')::date else as_of end,
    source      = case when p_changes ? 'source'      then p_changes->>'source'      else source end,
    tags        = case when p_changes ? 'tags'
                    then coalesce((select array_agg(x) from jsonb_array_elements_text(p_changes->'tags') x), '{}')
                    else tags end,
    embedding   = case when p_changes ? 'embedding'   then the_embedding else embedding end
  where id = p_id
  returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;
comment on function knowledge.revise(text, jsonb, text, jsonb, timestamptz) is
  'Changes a record and writes a new version. Refused and logged when the record is settled. A new why needs evidence.';

create function knowledge.decide(p_id text, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  v integer;
begin
  if not w.operator then
    raise exception 'Only an operator decides a proposal.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  select * into r from knowledge.records where id = p_id for update;
  if not found then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'decide', 'This record is settled: the PM has said do not re-raise it.');
  end if;
  if r.status <> 'proposed' then
    raise exception 'Only a proposed record is decided; % is %.', p_id, r.status using errcode = 'check_violation';
  end if;
  update knowledge.records set status = 'live', decided_by = w.person, decided_through = w.name, decided_on = current_date
   where id = p_id returning version into v;
  return jsonb_build_object('id', p_id, 'version', v);
end $$;

create function knowledge.retire(p_id text, p_replaced_by text, p_reason text, p_effective timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  newer knowledge.records;
  v integer;
begin
  perform knowledge._context(w, p_reason, null, p_effective);
  select * into r from knowledge.records where id = p_id for update;
  if not found or not knowledge.can_see(r.audience, r.departments) then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  if r.settled then
    return knowledge._refuse(w, p_id, 'retire', 'This record is settled: the PM has said do not re-raise it.');
  end if;
  if not (select 'retired' = any (x.statuses) from knowledge.kinds x where x.slug = r.kind) then
    raise exception 'A % changes status through knowledge.revise.', r.kind using errcode = 'check_violation';
  end if;
  if r.status = 'retired' then
    raise exception '% is already retired.', p_id using errcode = 'check_violation';
  end if;
  if not w.operator then
    perform knowledge._own_call(w, r);
  end if;

  if p_replaced_by is not null then
    select * into newer from knowledge.records where id = p_replaced_by;
  end if;
  if r.kind = 'decision'
     and (p_replaced_by is null or p_replaced_by = p_id or newer.id is null or newer.status <> 'live'
          or not knowledge.can_see(newer.audience, newer.departments)) then
    raise exception 'A decision is retired only with a link to the newer record that replaces it.'
      using errcode = 'check_violation';
  end if;
  if p_replaced_by is not null and newer.id is null then
    raise exception 'No record %.', p_replaced_by using errcode = 'no_data_found';
  end if;

  if newer.id is not null then
    insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
    values (newer.id, p_id, 'replaces', 'stated', p_reason, w.person, w.name)
    on conflict (from_id, to_id, type) do nothing;
  end if;
  update knowledge.records set status = 'retired' where id = p_id returning version into v;
  return jsonb_build_object('id', p_id, 'version', v, 'replaced_by', newer.id);
end $$;
comment on function knowledge.retire(text, text, text, timestamptz) is
  'Retires a record, never deletes it. A decision is retired only with the newer record that replaces it, and the replaces link is written here.';

create function knowledge.set_settled(p_id text, p_settled boolean, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  v integer;
begin
  if not w.operator then
    raise exception 'Only an operator settles or unsettles a record.' using errcode = 'insufficient_privilege';
  end if;
  perform knowledge._context(w, p_reason, null, null);
  update knowledge.records set settled = p_settled where id = p_id returning version into v;
  if not found then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  return jsonb_build_object('id', p_id, 'version', v, 'settled', p_settled);
end $$;

create function knowledge.link(p_from text, p_to text, p_type text, p_basis text default 'stated', p_reason text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  a knowledge.records;
  b knowledge.records;
  new_id bigint;
begin
  select * into a from knowledge.records where id = p_from;
  select * into b from knowledge.records where id = p_to;
  if a.id is null or not knowledge.can_see(a.audience, a.departments) then
    raise exception 'No record %.', p_from using errcode = 'no_data_found';
  end if;
  if b.id is null or not knowledge.can_see(b.audience, b.departments) then
    raise exception 'No record %.', p_to using errcode = 'no_data_found';
  end if;
  if not exists (select 1 from knowledge.link_types t where t.slug = p_type) then
    raise exception 'No such link type: %. A new link type is a new row in knowledge.link_types.', p_type
      using errcode = 'foreign_key_violation';
  end if;
  if p_type = 'departs_from' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'A departure names its reason.' using errcode = 'check_violation';
  end if;
  if p_type = 'replaces' and b.settled then
    return knowledge._refuse(w, p_to, 'link replaces', 'This record is settled: the PM has said do not re-raise it.');
  end if;
  insert into knowledge.links (from_id, to_id, type, basis, reason, person, agent)
  values (p_from, p_to, p_type, coalesce(p_basis, 'stated'), p_reason, w.person, w.name)
  on conflict (from_id, to_id, type) do nothing
  returning id into new_id;
  return jsonb_build_object('id', new_id, 'from', p_from, 'to', p_to, 'type', p_type);
end $$;

create function knowledge.add_ref(p_id text, p_kind text, p_url text, p_label text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  new_id bigint;
begin
  select * into r from knowledge.records where id = p_id;
  if r.id is null or not knowledge.can_see(r.audience, r.departments) then
    raise exception 'No record %.', p_id using errcode = 'no_data_found';
  end if;
  insert into knowledge.refs (record_id, kind, url, label, person, agent)
  values (p_id, p_kind, p_url, p_label, w.person, w.name) returning id into new_id;
  return new_id;
end $$;

create function knowledge.log_unanswered(p_question text, p_concern text default null, p_kind text default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  new_id bigint;
begin
  insert into knowledge.unanswered (question, concern, kind, person, agent)
  values (p_question, p_concern, p_kind, w.person, w.name) returning id into new_id;
  return new_id;
end $$;

create function knowledge.log_sighting(p_correction text, p_example text, p_model text default null, p_seen_on date default current_date)
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  w knowledge.agents := knowledge._writer();
  r knowledge.records;
  new_id bigint;
begin
  select * into r from knowledge.records where id = p_correction;
  if r.id is null or not knowledge.can_see(r.audience, r.departments) or r.kind <> 'correction' then
    raise exception 'A sighting is logged against a correction; % is not one.', p_correction using errcode = 'check_violation';
  end if;
  insert into knowledge.sightings (record_id, seen_on, example, model, person, agent)
  values (p_correction, coalesce(p_seen_on, current_date), p_example, p_model, w.person, w.name)
  returning id into new_id;
  return new_id;
end $$;
comment on function knowledge.log_sighting(text, text, text, date) is
  'Logs that a correction''s failure was seen again. The model is evidence only; every agent is served the correction alike.';

-- Agents are added by the schema owner (the PM, as postgres), never through
-- the store's own login. The key is returned once; only its hash is kept.
create function knowledge.add_agent(p_name text, p_person text, p_departments text[], p_operator boolean default false)
returns text language plpgsql security definer set search_path = '' as $$
declare
  key text := 'ks_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  perform knowledge._check_departments(p_departments);
  insert into knowledge.agents (name, person, departments, operator, key_hash)
  values (p_name, p_person, coalesce(p_departments, '{}'), coalesce(p_operator, false),
          encode(sha256(convert_to(key, 'UTF8')), 'hex'));
  return key;
end $$;

create function knowledge.revoke_agent(p_name text) returns void
language sql security definer set search_path = '' as $$
  update knowledge.agents set revoked_at = now() where name = p_name and revoked_at is null
$$;

-- ---------------------------------------------------------------------------
-- Reads. Security invoker: row-level security decides what each key sees.

create function knowledge.chain(p_id text, p_direction text)
returns table (id text, depth integer)
language sql stable set search_path = '' as $$
  with recursive walk (id, depth, seen) as (
    select p_id, 0, array[p_id]
    union all
    select case when p_direction = 'newer' then l.from_id else l.to_id end,
           w.depth + 1,
           w.seen || case when p_direction = 'newer' then l.from_id else l.to_id end
      from walk w
      join knowledge.links l
        on l.type = 'replaces'
       and ((p_direction = 'newer' and l.to_id = w.id) or (p_direction = 'older' and l.from_id = w.id))
     where w.depth < 50
       and not (case when p_direction = 'newer' then l.from_id else l.to_id end) = any (w.seen)
  )
  select walk.id, walk.depth from walk where walk.depth > 0
$$;
comment on function knowledge.chain(text, text) is
  'The decisions a record replaced (older) or was replaced by (newer), following replaces links as far as they go.';

create function knowledge.history_of(p_id text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'record', (select to_jsonb(r) - 'embedding' from knowledge.records r where r.id = p_id),
    'versions', coalesce((
      select jsonb_agg(jsonb_build_object('version', h.version, 'valid_from', h.valid_from, 'valid_to', h.valid_to,
                                          'person', h.person, 'agent', h.agent, 'reason', h.reason,
                                          'evidence', h.evidence, 'snapshot', h.snapshot) order by h.version)
        from knowledge.history h where h.record_id = p_id), '[]'::jsonb),
    'older', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'depth', c.depth, 'status', r.status, 'answer', r.answer)
                       order by c.depth, c.id)
        from knowledge.chain(p_id, 'older') c join knowledge.records r on r.id = c.id), '[]'::jsonb),
    'newer', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'depth', c.depth, 'status', r.status, 'answer', r.answer)
                       order by c.depth, c.id)
        from knowledge.chain(p_id, 'newer') c join knowledge.records r on r.id = c.id), '[]'::jsonb))
$$;
comment on function knowledge.history_of(text) is
  'One call: the record, every version it has had, and the chain of decisions it replaced and was replaced by.';

create function knowledge.as_of(p_concern text, p_at timestamptz)
returns table (id text, version integer, snapshot jsonb)
language sql stable set search_path = '' as $$
  select h.record_id, h.version, h.snapshot
    from knowledge.history h
   where h.snapshot->>'concern' = p_concern
     and h.snapshot->>'status' = 'live'
     and h.valid_from <= p_at
     and (h.valid_to is null or h.valid_to > p_at)
   order by h.record_id
$$;
comment on function knowledge.as_of(text, timestamptz) is
  'One call: what was live for a concern at a given time, each record as it read then.';

create function knowledge.record_as_of(p_id text, p_at timestamptz) returns jsonb
language sql stable set search_path = '' as $$
  select h.snapshot || jsonb_build_object('version', h.version, 'valid_from', h.valid_from, 'evidence', h.evidence)
    from knowledge.history h
   where h.record_id = p_id and h.valid_from <= p_at and (h.valid_to is null or h.valid_to > p_at)
$$;
comment on function knowledge.record_as_of(text, timestamptz) is
  'One record as it read at a given time, such as the platform''s why on a past date.';

create function knowledge.precedents_of(p_id text)
returns table (id text, link_type text, basis text, reason text, kind text, answer text)
language sql stable set search_path = '' as $$
  select r.id, l.type, l.basis, l.reason, r.kind, r.answer
    from knowledge.links l
    join knowledge.records r on r.id = l.from_id
   where l.to_id = p_id and l.type in ('applies', 'departs_from') and r.status = 'live'
   order by l.type, r.id
$$;
comment on function knowledge.precedents_of(text) is
  'Every live record that applies a philosophy or pattern, and the ones that depart from it, each marked stated or inferred.';

-- ---------------------------------------------------------------------------
-- Row-level security: what each key reads. The login has no write grant on
-- any table; writes go through the functions above.

alter table knowledge.kinds       enable row level security;
alter table knowledge.link_types  enable row level security;
alter table knowledge.departments enable row level security;
alter table knowledge.concerns    enable row level security;
alter table knowledge.agents      enable row level security;
alter table knowledge.records     enable row level security;
alter table knowledge.history     enable row level security;
alter table knowledge.links       enable row level security;
alter table knowledge.refs        enable row level security;
alter table knowledge.unanswered  enable row level security;
alter table knowledge.sightings   enable row level security;
alter table knowledge.refusals    enable row level security;

create policy kinds_with_a_key on knowledge.kinds for select to knowledge_store
  using (knowledge.has_key());
create policy link_types_with_a_key on knowledge.link_types for select to knowledge_store
  using (knowledge.has_key());
create policy departments_with_a_key on knowledge.departments for select to knowledge_store
  using (knowledge.has_key());
create policy concerns_with_a_key on knowledge.concerns for select to knowledge_store
  using (knowledge.has_key());
create policy agents_self_or_operator on knowledge.agents for select to knowledge_store
  using (name = knowledge.whoami()->>'agent' or knowledge.is_operator());
create policy records_by_audience on knowledge.records for select to knowledge_store
  using (knowledge.can_see(audience, departments));
-- A version is read as private as it was when written, and only while the
-- record itself is still readable.
create policy history_of_visible_records on knowledge.history for select to knowledge_store
  using (knowledge.can_see(snapshot->>'audience',
                           array(select jsonb_array_elements_text(snapshot->'departments')))
         and exists (select 1 from knowledge.records r where r.id = record_id));
create policy links_between_visible_records on knowledge.links for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = from_id)
     and exists (select 1 from knowledge.records r where r.id = to_id));
create policy refs_of_visible_records on knowledge.refs for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = record_id));
create policy sightings_of_visible_records on knowledge.sightings for select to knowledge_store
  using (exists (select 1 from knowledge.records r where r.id = record_id));
create policy unanswered_operators on knowledge.unanswered for select to knowledge_store
  using (knowledge.is_operator());
create policy refusals_operators on knowledge.refusals for select to knowledge_store
  using (knowledge.is_operator());

-- ---------------------------------------------------------------------------
-- Grants. Nothing for public or any app role; the login reads and calls.

revoke all on all tables    in schema knowledge from public, anon, authenticated, service_role;
revoke all on all sequences in schema knowledge from public, anon, authenticated, service_role;
revoke all on all functions in schema knowledge from public, anon, authenticated, service_role;
alter default privileges in schema knowledge revoke all on tables    from public, anon, authenticated, service_role;
alter default privileges in schema knowledge revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges in schema knowledge revoke all on functions from public, anon, authenticated, service_role;

grant select on knowledge.kinds, knowledge.link_types, knowledge.departments, knowledge.concerns, knowledge.records, knowledge.history, knowledge.links,
                knowledge.refs, knowledge.unanswered, knowledge.sightings, knowledge.refusals
  to knowledge_store;
grant select (name, person, departments, operator, created_at, revoked_at) on knowledge.agents to knowledge_store;

grant execute on function
  knowledge.whoami(), knowledge.can_see(text, text[]), knowledge.is_operator(), knowledge.has_key(),
  knowledge.record(jsonb, text, jsonb, timestamptz),
  knowledge.revise(text, jsonb, text, jsonb, timestamptz),
  knowledge.decide(text, text),
  knowledge.retire(text, text, text, timestamptz),
  knowledge.set_settled(text, boolean, text),
  knowledge.link(text, text, text, text, text),
  knowledge.add_ref(text, text, text, text),
  knowledge.log_unanswered(text, text, text),
  knowledge.log_sighting(text, text, text, date),
  knowledge.chain(text, text),
  knowledge.history_of(text),
  knowledge.as_of(text, timestamptz),
  knowledge.record_as_of(text, timestamptz),
  knowledge.precedents_of(text)
  to knowledge_store;
