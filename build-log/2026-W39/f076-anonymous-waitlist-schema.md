# F076 — schema for a waitlist entry with no account

**Kind:** scenario (amendment pending) · **Scenario:** F076 · **Branch:** `f076-anonymous-waitlist-schema`

**THIS PR CARRIES A MIGRATION. DON APPLIES IT. NOTHING DEPENDENT MERGES FIRST.**

## Why

`MetroNotCoveredPanel` already names the gap in its own comment: the waitlist
needs an account, `joinMetroWaitlistAction` calls `getUser()` and throws
without one, so a signed-out stranger — the common case on that surface — is
routed to sign-in instead of being counted. Don asked for the fix unprompted
after using Explore.

## The replacement for `member_id unique`

**One row per email, across all metros — not per metro.**

Per-metro uniqueness is the obvious candidate and it is wrong: it lets one
address sit on Boise and Reno at once, double-counting in exactly the way
criterion 5 ("changing metro MOVES the count, leaving neither double-counted
nor stranded") exists to prevent. Global uniqueness mirrors what `member_id
unique` does for a member — joining again is an UPDATE, changing metro is a
move — so criteria 4 and 5 stay consequences of one constraint.

A test inserts the same address on a second metro and requires the insert to
fail. That is the test per-metro uniqueness would not pass.

## The privacy cost

Any uniqueness on email makes "is this address already waiting?" answerable by
anyone who can reach the endpoint. It is inherent to the constraint and cannot
be designed away in SQL. Closed in the handler PR, with tests:

1. identical response whether a row was created or updated — never "you are
   already on the list";
2. **the count is read BEFORE the write**, so it cannot be diffed across two
   submissions. Without this the popup's own number is the oracle, which is the
   easy one to miss;
3. rate limiting on the endpoint.

## Not decided here

No address is verified, so the count is inflatable by anyone. That is a
scenario question, flagged for the amendment, deliberately not settled in a
migration.

## One existing test changed

`migrations-metro-waitlist.test.ts` asserted a unique **constraint** on
`member_id` via `pg_constraint`. A constraint cannot be partial, and
`member_id` is now nullable, so the rule is a partial unique **index**. The
test asked about the mechanism and went red on a migration that broke nothing.
It asks about the rule now — uniqueness on `member_id` exists somewhere the
database enforces it — and the behaviour is pinned separately by an insert that
must fail.

## Verified

`supabase db reset` from empty: applies clean. 32 tests green across both
waitlist suites, including every rejection path (neither identity, both
identities, duplicate address, un-normalised address). Full suite with a local
database: 2398 passed, the one failure a `cannot run` guard needing storage
keys this machine does not have.
