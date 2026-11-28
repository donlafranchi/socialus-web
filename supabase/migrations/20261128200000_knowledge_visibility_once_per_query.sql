-- #1553 — a key is looked up once per query, not once per record.
--
-- Architecture note (RLS):
--   · Problem: records_by_audience called knowledge.can_see(audience, departments) on every row. can_see is
--     security definer with a fixed search_path, so Postgres cannot inline it: each row re-hashed the key and
--     looked up the agent. theme_of reads hundreds of rows, so an agent key ran ~14× the owner's time and
--     TH-GROW passed the knowledge_store login's 10s statement_timeout.
--   · Fix (Supabase RLS performance guide: wrap functions in select): the same rule, with the key read in
--     uncorrelated subqueries. Postgres runs each once per query (an InitPlan) and compares columns per row.
--     knowledge._sight() returns the key's own sight (known, operator, departments); like can_see, only the
--     store's login may run it, and it tells a key nothing about any other key.
--   · Same answer as can_see for every row: an operator sees all; a known key sees public and members; a
--     department record needs a shared department; no key sees nothing.
--   · live_state, live_state_taken and the six has_key / is_operator rules take no column, so wrapping their
--     call in select is enough.
--   · history keeps can_see per row: its audience lives in a JSON snapshot and it is read one record at a time.
--   · No table changes; can_see stays for the callers that use it.

create function knowledge._sight(out known boolean, out operator boolean, out departments text[])
language sql stable security definer set search_path = '' as $$
  select a.name is not null, coalesce(a.operator, false) and a.name is not null, case when a.name is not null then a.departments end
    from (select 1) one left join knowledge._agent() a on true
$$;
revoke execute on function knowledge._sight() from public;
grant execute on function knowledge._sight() to knowledge_store;
comment on function knowledge._sight() is
  'The calling key''s own sight, for the records rule to read once per query: is it a key, is it an operator, its departments.';

drop policy records_by_audience on knowledge.records;
create policy records_by_audience on knowledge.records for select to knowledge_store using (
  (select s.operator from knowledge._sight() s)
  or (audience in ('public', 'members') and (select s.known from knowledge._sight() s))
  or (audience = 'department' and departments && (select s.departments from knowledge._sight() s))
);

drop policy live_state_readers on knowledge.live_state;
create policy live_state_readers on knowledge.live_state for select to knowledge_store
  using ((select knowledge.can_see('department', array['building', 'telemetry-and-bugs'])));

drop policy live_state_taken_readers on knowledge.live_state_taken;
create policy live_state_taken_readers on knowledge.live_state_taken for select to knowledge_store
  using ((select knowledge.can_see('department', array['building', 'telemetry-and-bugs'])));

drop policy kinds_with_a_key on knowledge.kinds;
create policy kinds_with_a_key on knowledge.kinds for select to knowledge_store using ((select knowledge.has_key()));

drop policy departments_with_a_key on knowledge.departments;
create policy departments_with_a_key on knowledge.departments for select to knowledge_store using ((select knowledge.has_key()));

drop policy link_types_with_a_key on knowledge.link_types;
create policy link_types_with_a_key on knowledge.link_types for select to knowledge_store using ((select knowledge.has_key()));

drop policy concerns_with_a_key on knowledge.concerns;
create policy concerns_with_a_key on knowledge.concerns for select to knowledge_store using ((select knowledge.has_key()));

drop policy unanswered_operators on knowledge.unanswered;
create policy unanswered_operators on knowledge.unanswered for select to knowledge_store using ((select knowledge.is_operator()));

drop policy refusals_operators on knowledge.refusals;
create policy refusals_operators on knowledge.refusals for select to knowledge_store using ((select knowledge.is_operator()));
