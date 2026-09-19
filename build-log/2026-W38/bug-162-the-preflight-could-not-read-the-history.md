# The preflight could not read the history it was printing

*2026-09-19. The production apply for T156's `browse_feed` failed. Nothing was
applied — the failure was one step earlier than the part that writes.*

## What happened

Run 35469653868 died at **"What would this apply?"** with

```
::error::Could not read the remote migration history. Not proceeding — refusing to guess.
```

That step is the wrong-ref guard, and it sits **before** `supabase db push`.
So `20260919203015_browse_feed.sql` never ran: `browse_pages` and `browse_posts`
are still there, `browse_feed` is not, and the database is exactly where it was.
The drop and the create being in one migration — the thing that would have made
a half-applied run ugly — never came into it.

## The cause

The step above it, "History before", printed the whole table successfully. So
the history was readable; the preflight could not **parse** it.

`supabase migration list` renders its table as markdown when stdout is not a
TTY. In CI every cell arrives backtick-wrapped:

```
 `20260917210000` | `20260917210000` | `2026-09-17 21:00:00`
```

The parser stripped spaces from column 2 and then required `^[0-9]+$`. The
backticks defeat that, so `remote_versions` came back empty on every run, and
empty is the one condition the script treats as "I cannot tell" — by design, and
correctly. It failed closed. It just failed closed **every time**.

In a terminal the same command prints bare digits, which is why it passed by
hand. And #153 landed after the last successful apply, so run 35469653868 was
**the first time this script ever ran against production**. There was no
regression; it had never worked in CI.

## Why the existing test could not catch it

`tests/migrations-apply-guard.test.ts` reads `migrations-pending.sh` as a string
and greps it for phrases — that it says "exit 3", that it mentions
`refs/remotes/origin`. Every one of those assertions was green while the script
could not parse a single row. **A grep over source cannot see a parse bug.**

## The fix

`tests/migrations-pending-parse.test.ts` **executes** the script with a fake
`supabase` on `PATH` that prints the table exactly as run 35469653868 logged it,
backticks and all, built from the repo's real migration versions so it stays
true as migrations are added. Four cases: the backticked table CI gets, the
plain table a terminal renders, nothing-pending (exit 3, not 2), and an
unreadable history (exit 2).

The parser now takes the digits out of column 2 and ignores every decoration
around them, so neither form can break it again.

And when it *does* refuse, it prints what the CLI said. The original failure
printed one line and nothing to diagnose from; reading that run meant opening
the log of the step above it to find out the connection had been fine all along.
