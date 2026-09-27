# bug #224 — the migration gate names the direction that failed

`check-migration-drift.sh` now exits 2 for pending (a file production has not applied, `--strict` only) and 3 for drift (production has a migration with no file here). Under `--strict` it reports both before exiting. The CI merge gate branches on the code: 2 says apply first, 3 says update from main or add the file and never says apply, and anything else claims neither.

Red first: `tests/migrations-drift-parse.test.ts` (exit codes, both-at-once) and `tests/ci-migration-gate-message.test.ts`. The second executes the gate step's own shell from `ci.yml` against a stub script, and failed on exit 3 with the old "This branch carries…" line.
