-- F076 (amendment pending) — a person can leave an email without an account.
--
-- Don asked for this unprompted after using Explore. The panel already admits
-- the gap in its own comment: `joinMetroWaitlistAction` calls `getUser()` and
-- throws without one, so a signed-out stranger — the common case on that
-- surface — is routed to sign-in instead of being counted.
--
-- THIS MIGRATION ENCODES A PROPOSAL, NOT A RATIFIED CRITERION.
-- The approved scenario is signup-based and its idempotency rule (criterion 4)
-- is `member_id unique`, which an anonymous row cannot satisfy. The amendment
-- is being written in ops-pattern. Nothing that depends on this ships until it
-- lands; the schema goes first only because applying it is a manual step that
-- has to happen before any dependent code can merge.
--
-- WHAT REPLACES `member_id unique`
--   One row per email, ACROSS ALL METROS — not per metro.
--
--   Per-metro uniqueness is the obvious candidate and it is wrong. It lets one
--   address sit on Boise and Reno at once, which double-counts exactly the way
--   criterion 5 ("changing metro MOVES the count, leaving neither
--   double-counted nor stranded") was written to prevent. Global uniqueness on
--   the email mirrors what `member_id unique` does for a member: joining again
--   is an UPDATE, changing metro is a move, and both criteria 4 and 5 stay
--   consequences of one constraint rather than application-side logic.
--
-- THE PRIVACY COST, STATED
--   Any uniqueness on email makes "is this address already waiting?" a
--   question the endpoint can answer. That is inherent to the constraint, not
--   to this particular shape of it, and it cannot be designed away in SQL.
--   It is closed in the handler, and the handler PR carries the tests:
--     1. the response is identical whether a row was created or updated — no
--        "you are already on the list", same shape, same standing popup;
--     2. the count shown is read BEFORE the write, so it cannot be diffed
--        across two submissions to learn whether an address was new;
--     3. rate limiting on the endpoint.
--   (1) and (2) are the ones that matter: without (2) the popup's own number
--   is the oracle, which is easy to miss.
--
-- WHAT THIS DOES NOT DO
--   No email is verified here. An unverified address means the count is
--   inflatable by anyone, which is a scenario question and not a schema one —
--   flagged for the amendment, deliberately not decided in a migration.

------------------------------------------------------------
-- 1. member_id becomes optional, and email joins it
------------------------------------------------------------

alter table public.metro_waitlist
  alter column member_id drop not null;

-- The unique CONSTRAINT has to go so a partial unique INDEX can take its place:
-- a constraint cannot be partial, and with NULLs now allowed an unconditional
-- one would be the wrong rule anyway.
alter table public.metro_waitlist
  drop constraint metro_waitlist_member_id_key;

alter table public.metro_waitlist
  add column email text;

-- Exactly one identity per row, enforced here rather than trusted to callers.
-- A row with both would be countable twice and repairable by nobody.
alter table public.metro_waitlist
  add constraint metro_waitlist_one_identity
  check (num_nonnulls(member_id, email) = 1);

-- Deliberately permissive: enough shape to reject a typo or a stray word, not
-- an attempt to adjudicate RFC 5322. Over-strict address validation rejects
-- real addresses, and the person it rejects is someone trying to be counted.
alter table public.metro_waitlist
  add constraint metro_waitlist_email_shape
  check (
    email is null
    or (email = lower(btrim(email)) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
  );

------------------------------------------------------------
-- 2. The two identities, each unique in its own right
------------------------------------------------------------

-- What `metro_waitlist_member_id_key` used to say, now scoped to rows that
-- have a member. Criterion 4 for a signed-in person is unchanged.
create unique index metro_waitlist_member_unique
  on public.metro_waitlist (member_id)
  where member_id is not null;

-- The replacement rule, for rows that do not. `lower(...)` is belt-and-braces:
-- the CHECK above already requires the stored value to be lowercased and
-- trimmed, so this index and that constraint agree by construction, and the
-- index still holds if the CHECK is ever relaxed.
create unique index metro_waitlist_email_unique
  on public.metro_waitlist (lower(email))
  where email is not null;

comment on column public.metro_waitlist.member_id is
  'The member waiting, when there is one. NULL for a row created by someone with no account, which carries an email instead — exactly one of the two is present (metro_waitlist_one_identity). Unique among non-NULL values, which is what F076 criterion 4 means for a signed-in person.';
comment on column public.metro_waitlist.email is
  'Where to reach someone waiting who has no account. NULL for a member row. Unique across ALL metros, not per metro: per-metro uniqueness would let one address sit on two metros at once and double-count, which criterion 5 forbids. Stored lowercased and trimmed. Never verified at this layer, and never displayed or ranked — see the table comment.';

------------------------------------------------------------
-- 3. Reading rows stays exactly as closed as it was
------------------------------------------------------------

-- `metro_waitlist_select_own` is `member_id = auth.uid()`. For an anonymous
-- row member_id is NULL, so the predicate is NULL — never true — and the row
-- is readable by no browser client at all. That is the behaviour we want and
-- it needs no new policy; stated here because "we added a column and touched
-- no policy" should be a decision on the record rather than an omission.
--
-- There is still no INSERT/UPDATE/DELETE policy, per ADR-7. Writes go through
-- the action layer, which connects as the table owner. An anonymous WRITE path
-- is emphatically not an anonymous DIRECT-TO-POSTGREST path.
