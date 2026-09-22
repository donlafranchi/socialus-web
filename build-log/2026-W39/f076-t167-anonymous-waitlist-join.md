# F076 · T167 · Leave an email for a metro that isn't open

Issue #193. Scenario F076 criteria 13-15, amended 2026-09-21.

## Built

`metro.waitlist_join_anonymous` — a second handler rather than a branch inside
`metro.waitlist_join`, because that handler's every guard is keyed on
`ctx.actingMemberId` and a caller here has no identity at all.

`resolveAnonymousActionContext()` in `src/lib/action-context.ts`, whose
`actingMemberId` **throws** on access. Widening `ActingMemberId` with an
`'anonymous'` sentinel was the obvious move and would have been the fourth
instance this month of a guard answering a question it was no longer asking:
roughly twenty-five handlers check `!ctx.actingMemberId || ctx.actingMemberId
=== 'self-bootstrap'`, and a new sentinel passes every one of them. Throwing
inverts it — a handler that reaches for an identity it should not have fails at
the first read.

`joinMetroWaitlistAnonymousAction` — no `getUser()`, no Supabase client at all.
The handler returns the counts it read inside its own transaction, so the
action has nothing to read back.

## Verified against a real database, not a mock

Local Postgres with the applied migration, calling the handler directly:

- one row per address, `member_id` NULL, across two submissions
- the move between metros: one row, old counter down, new counter up, both
- ` PROBE@EXAMPLE.COM ` folds onto the existing `probe@example.com` row
- no statement writes `is_open`

Full suite: **2430 passed, 212 files, 0 failed, 0 skipped**, with
`DATABASE_URL` set so the DB-bound suites actually ran rather than reporting
"cannot run".

## What the real database contradicted, and what was ruled

The criterion-14 test **passed against the mock and was false against Postgres.**

```
new   : creatorCount 0
repeat: creatorCount 1
```

Reading the count before the write does not make two submissions
indistinguishable — the first submission inserts, so the second one's pre-write
read is one higher. The test asserted the two results were equal and they were,
because the mock returns a fixed count whatever it is asked. It was asking
whether the handler returns what the mock returns.

Reading after the write is not the fix: it makes two submissions of one address
agree and makes a single probe of someone else's address leak in one request
instead of two. Any truthful live count leaks membership by differencing.

**Ruled 2026-09-22 (#196): an anonymous submitter is shown no count at all.**

Implemented structurally rather than as a display rule. The handler does not
SELECT `creator_count` or `patron_count`, its result type has no field for one,
and the confirmation message is a fixed constant with no digit in it. There is
no read order left to get wrong. The counters are still *maintained*, because a
write is not a read.

Three tests hold it: the SELECT statements are asserted not to mention the
count columns; the result keys are asserted to be exactly
`metroId, metroName, open`; and the message is asserted to contain no digit.
Asserting the *absence of a read* cannot pass on a mock the way the old test
did.

Re-verified against local Postgres after the change:

```
new   : {"open":false,"metroId":"3fb9e838…","metroName":"Abilene-Sweetwater, TX"}
repeat: {"open":false,"metroId":"3fb9e838…","metroName":"Abilene-Sweetwater, TX"}
IDENTICAL RESPONSE (real DB): true
DIFFERENT ADDRESS, SAME RESPONSE: true
```

The third line is the one the old design could not produce — it is the
differencing attack, and the response no longer moves for it.

## Three documents corrected

All three asserted that read-before-write closes this:

- `planning/scenario-F076.md` in ops-pattern — criteria 7 and 14 amended, the
  Why section corrected, and a `DECISIONS.md` entry added. Separate commit in
  that repo, never cross-committed.
- the header comment in `supabase/migrations/20260922034637_metro_waitlist_anonymous.sql`
  — applied to production already, so the comment is corrected in place and the
  SQL is untouched. Only the comment overclaimed.
- the body of PR #191, corrected via a note in place.

## Not built

The UI (#194) — next, now unblocked. Rate limiting (#195) — no primitive in
this repo, and what may identify an anonymous caller is still a privacy ruling.
That Issue is about count inflation, which is a different problem from this one.
