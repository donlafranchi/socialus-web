# change #187 — a migration cannot reach main before it reaches production

**Kind:** change · **Scenario:** none · **Branch:** `change-187-merge-gate`

## Why

2026-09-21: two PRs merged carrying a migration nobody had applied. The deploy
went out against a database without it and every Page URL 404'd for an hour.

#164 pinned the CLI so the watching job stops going dark. #184 added
`/api/health/schema` so a deployment reports a schema its own code cannot use.
**Both of those notice. Neither prevents** — they fire after the merge, which is
after the outage has started.

## What this adds

`applied` — "Migrations applied to production" — in `ci.yml`, on every PR.
It runs `check-migration-drift.sh --strict` against the branch. The `pending`
job in `migrations.yml` asks that question of main; this asks it of the branch,
before the branch is main.

The ordering it enforces is: **apply from the branch, then merge.** The apply
workflow already supports that — its own input text says to check "Use workflow
from" — so nothing new was needed to make it possible, only something to make
it the order.

No `paths:` filter, deliberately. A required check that a path filter skips
reports nothing, GitHub reads nothing as "not yet", and every unrelated PR is
blocked forever — which is how a requirement gets switched off. Running always
is what makes it safe to require.

## It is not yet a control

Making a red check stop a merge needs branch protection or a ruleset. Both
return `403 Upgrade to GitHub Pro or make this repository public` on this
repo's plan — checked against the API with an admin token, twice, not assumed.

So today this is a red tick a person can merge past. That is discouragement,
which is explicitly not what was asked for. It goes in now so that making it
binding is one setting rather than new work. The decision about which route to
take is in #187 and is Don's.

## Can it fail open?

| State | Answer |
|---|---|
| Secrets missing | `supabase-db-url.sh` exits non-zero, job fails |
| Database unreachable | drift script exits 1, job fails |
| History unreadable | drift script exits 1, job fails |
| PR touches no migration | passes — every file is already applied |
| Job skipped by a path filter | cannot happen; there is no path filter |
| **Someone clicks Merge on the red tick** | **nothing stops them — the open hole, #187** |

The last row is the honest one. Every failure mode inside the job is closed;
the job's *authority* is what is missing, and no amount of YAML here supplies it.
