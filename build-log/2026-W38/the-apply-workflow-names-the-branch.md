# The apply workflow refuses to be a silent no-op

*2026-09-17. Second time the same mistake cost a round trip. Fixing the cause.*

## The failure

`workflow_dispatch` renders a **"Use workflow from"** dropdown that defaults to
`main`. A migration under review lives on its branch until the PR merges. So
accepting the default runs the job against a ref with nothing pending:
`supabase db push` prints *"Remote database is up to date"*, every step passes,
**the job goes green — and the migration was not applied.**

From the run list, a green run and a run that did nothing look identical.

It happened on 2026-09-17 with the moderation migration (run 35294725894,
against `main`). Verified harmless: the log shows `Remote database is up to
date` and nothing was written. But the round trip was real, and it was the
second one.

## Why not the other two options

**"Have the PR say which branch to select."** That was already true — PR #152
said Don runs the apply — and the mistake happened anyway. A reminder relies on
someone remembering the thing they just forgot. It is a workaround.

**"Report which migrations it would apply, then apply."** Better, but on its own
it still lets a wrong-ref run proceed to a green no-op. Useful as half of the
fix, not as the fix.

## What it does now

A preflight step, `scripts/migrations-pending.sh`, between *History before* and
*Push migrations*:

- **Something pending** → prints exactly which migrations, by version and
  filename, then the push proceeds. The log now says what changed, not only
  that something did.
- **Nothing pending** → **fails the job** and says why. Green-and-did-nothing
  was the entire bug, so it must not be green.

And the part that actually removes the memory burden: when it refuses, **it
names the branches that do have something pending**, newest first, with their
migration filenames. Not "wrong ref" — *"try `f058-reversible-decisions`, it has
`20260917210000_report_decisions_reversible.sql`"*.

Capped at five. There are 43 remote branches, and a wall someone scrolls past is
the same as no message. Newest-first puts the branch of the PR just read at the
top, which is nearly always the answer.

## Verified against the real repository state

Run with a stubbed CLI, both directions:

- remote has everything on this ref → exit 3, refuses, and lists
  `f058-reversible-decisions — 1 pending: 20260917210000_report_decisions_reversible.sql` **first**
- remote missing one → exit 0, names it, push proceeds

Had this existed this morning, the wrong-ref run would have printed the answer
instead of going green.

## Two smaller things

`fetch-depth: 0` on the checkout — a shallow single-branch clone cannot see what
other refs carry, so without it the guard could refuse but not help.

The `confirm` input's own description now reads *"FIRST check 'Use workflow
from' above — a migration under review is on its branch, not main."* It sits
where the person is already typing, which is the only place a reminder has a
chance.

## Checks

10 tests. Two of them caught the test itself matching the file's header comment
rather than its steps — the header explains at length why `db push` and not the
management API, so it mentions both.
