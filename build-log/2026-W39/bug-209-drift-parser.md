# bug #209 · The migration drift check could not see an unapplied migration in CI

Found by noticing that #206 — a PR that plainly carries an unapplied migration
— showed **Migrations applied to production: pass**.

## The bug

`supabase migration list` emits a markdown table when stdout is not a TTY, so
in CI every cell is backtick-wrapped and an *absent* cell is `` ` ` ``. The
parser stripped whitespace and not backticks, so that cell survived as two
backticks — non-empty — and the row was classified as neither local-only nor
remote-only.

Fed exactly the table CI logs, before the fix:

```
   `20260921200710` | `20260921200710` | `2026-09-21 20:07:10`
   `20260922204457` | ` `              | `2026-09-22 20:44:57`

check-migration-drift: clean — nothing applied that is missing a file here.
EXIT: 0
```

In a terminal the CLI renders the same table without backticks, which is why
it worked by hand and why nobody noticed.

## Three checks, one root cause

- **`Migrations applied to production`** — #188's merge gate, built after the
  2026-09-21 outage. Passed on every PR. **The fix for that outage had never
  worked.**
- **`Production behind main?`** — the daily `--strict` run, whose own comment
  says *"the window between merge and apply is exactly the window the outage
  lived in, and nothing else was watching it."* Neither was it.
- **`No undocumented migrations in the database`** — same parse, other column.
  A remote-only row has `` ` ` `` in *Local*. So the check that exists because
  of the 2026-09-11 management-API divergence was blind to a recurrence.

## Why the suite missed it

`tests/migrations-pending-parse.test.ts` was written for this exact failure on
2026-09-19 and its header says why it executes rather than greps: *"a grep
cannot see a parse bug"*. **It tests `scripts/migrations-pending.sh`.** That
file was fixed. `check-migration-drift.sh` has the same parser, was never
fixed, and had no test at all. One bug, two files, one repaired.

## Fixed

`tr -d '[:space:]'` → `tr -d '[:space:]\`'`, and a test that executes the
script against the captured CI table: both modes, both directions, plus the
plain terminal rendering so stripping backticks does not break what a human
sees.

Regression-checked properly — with the fix reverted, exactly the three
backtick cases fail and the three plain-table cases stay green; restored, all
six pass.

## One thing I did not do

The new tests carry an explicit 30s timeout. Every test here spawns a bash
subprocess, and vitest's 5s default is not enough under the full suite's
parallel load — `migrations-pending-parse.test.ts` timed out six times today
for that reason, including on this branch. Adding another subprocess-spawning
file without a budget would have made that worse.

The wider fix for the other ~10 files is still queued separately. It belongs
with this one in spirit: **a guard people learn to re-run is a guard that
stops being believed**, which is the same disease this PR is about, one stage
earlier.

## What this does to #206

It will correctly go **red**, because #206 does carry an unapplied migration.
That is the gate working for the first time.
