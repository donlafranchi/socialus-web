### bug #164 — The pinned CLI, and a guard that notices a schema the code cannot use

**#164 stopped being a tidy-up ticket today.** `supabase/setup-cli` ran with `version: latest`, which calls the GitHub releases API on every run. On 2026-09-21 that API rate-limited and the step failed with *"Failed to resolve latest Supabase CLI release"* — so the `migrations (check)` job went red for a reason unrelated to any migration, on the day a migration merged unapplied and took every Page URL down for an hour. The one job watching the schema was dark. Pinned to `2.117.0` in all five places; a pinned version needs no API call and cannot be rate-limited.

**But pinning it would not have stopped the outage,** and that is worth saying plainly. The drift check deliberately passes on a PR carrying an unapplied migration — a PR is supposed to have one. `Production behind main?` ran on push and **reported and passed**, on the reasoning that you have just merged and of course it is pending. Only the daily schedule would have failed, by which time Don had found the 404s himself. **Nothing compared the schema the deployed code needs against the schema the database has.** `/api/health/db` was green throughout, because it asks whether a database answers, not whether it is the right one.

**`/api/health/schema` asks the second question.** The deployment compares the migration versions compiled into its own bundle against `supabase_migrations.schema_migrations` in the database it is actually pointed at. It lives in the deployment rather than in CI because only the running app knows which database Vercel handed it — a CI job checks whatever database CI has credentials for, which is an assumption about the environment rather than an observation of it, and a wrong `DATABASE_URL` in Vercel is exactly the class of failure `/api/health/db` exists for.

**It cannot fail open.** Unconfigured, unreachable, an unreadable history, an empty history, a missing manifest, and a 404 from a deployment older than the endpoint are all 503 or a failed job. A health check that answers "fine" when it could not do its job is the same shape as the bug it watches for.

**The manifest is the one that could have gone quietly wrong.** It is a committed generated file — `supabase/migrations/` is not in the Vercel bundle, so a runtime readdir there finds nothing, and *nothing compares equal to every database*. That is lesson 28's trap with a different surface: an empty list passes against everything. So the generator refuses to write an empty manifest, the endpoint refuses to serve on one, and a test compares the committed file against the directory. Same arrangement as `src/ontology/registry.json`, for the same reason.

**`Production behind main?` fails on push now.** The window between merge and apply is exactly the window the outage lived in, and a green tick across it was the thing that made it invisible.

**Verified by reproducing the outage rather than by reasoning about it.** Deleted `20260921200710` from `schema_migrations` on a live local database and asked the running endpoint: `503 {"status":"behind","missing":["20260921200710"]}`, naming the workflow that fixes it. Restored the row: `200 {"ok":true,"migrations":53}`.

**What this is not.** Detection, not prevention. It turns an hour of silent 404s into a red main build in about forty seconds that names the missing migration. It cannot block the merge. Blocking would need a required PR check that refuses until production already has the migration, inverting apply-and-merge — a change to how Don works, so it is his call and not in this PR.

Tests: 14 new (the endpoint's ok/behind/ahead paths and all six fail-closed cases; the manifest's directory match, non-emptiness, version shape, and the `--check` staleness guard as CI runs it). Full suite 2389 passed. `tsc`, `eslint`, `check:action-layer` and `next build` clean.

**No migration.**
