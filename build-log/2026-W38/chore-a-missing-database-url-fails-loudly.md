# chore — a missing DATABASE_URL fails loudly

**Kind:** chore. **Scenario:** none.

## What happened

Don could not create a Page. The cause was not code: `DATABASE_URL` had never
been set in any Vercel environment, so the action layer's `pg` pool had no
connection string. **Every write in the app had been down since 2026-05-11**,
when `src/actions/_lib/db.ts` landed — four months. Signup, Page creation,
follows, posts, reports, waitlist joins: all 24 handlers go through
`withTransaction` → `getPool()`.

Reads were unaffected — they go through `@supabase/ssr` and PostgREST and never
touch that pool — so the app looked healthy.

**Nothing detected it, and nothing could have.** The unit suite runs against a
local stack. The build never connects. Lint and types do not know what an
environment variable is. Every check ran *before* the deploy, and the gap only
exists *in* the deploy.

## What now catches it

**1. The question is askable without a write.** `src/actions/_lib/db-config.ts`
resolves the connection string as a pure function. Previously the only thing
that ever asked was a member's write, already in flight, failing from four
frames down. It also now treats a blank value as unset — a variable
declared-but-empty in a dashboard used to satisfy `??` and hand `new Pool('')`
a string that failed later and worse.

**2. `/api/health/db`** answers three states, because the remediation differs:
`ok`, `unconfigured` (the four-month failure), `unreachable` (configured, but
the wrong pooler shard or the direct AAAA-only host). It reports no host, no
user, no connection string, and not even which variable won.

**3. `.github/workflows/deploy-health.yml`** asks the running deployment after
every push to main, daily at 13:00 UTC, and on demand. A 503 is a real answer,
so it fails immediately with the remediation rather than retrying; anything
else retries for ten minutes to let a Vercel build finish.

## What it would and would not catch

**Would:** the exact failure — a missing or blank connection string in a
deployed environment; a variable deleted or edited later (the daily run); a
pooler URL pointing at the wrong shard or at the direct host.

**Would not:** a variable set in Production but not Preview, unless the
workflow is pointed at a preview URL by hand (`vars.HEALTH_URL`, or the
`workflow_dispatch` input). Nor a *wrong-but-reachable* database — `select 1`
answers the same from any Postgres. Nor a write that fails on RLS or a
constraint: this proves connectivity, not correctness.

## Docs

`INFRASTRUCTURE.md` said `| DATABASE_URL | Local, or direct prod string |`,
which named no environment and could be read as endorsing the direct host. It
now names **Production and Preview**, carries the pooler-vs-direct reason (the
direct host publishes no A record; Vercel is IPv4-only), the percent-encoding
warning, and a pointer to `scripts/supabase-db-url.sh`. The `pg_dump`
"pooler-free" line at item 11 is now explicitly scoped to dumps, so the two
cannot be read as contradicting each other.

## Verification

- `db-config.test.ts` — 6 tests: precedence, fallback order, blank-as-unset,
  trimming, and the message naming all three variables.
- `route.test.ts` — 5 tests: the three states, the client released on failure,
  and an assertion that no password, ref or host reaches the response body.
- **End-to-end in a real runtime**: built the app, started it with no
  `DATABASE_URL`, and got `HTTP 503 {"ok":false,"status":"unconfigured",...}`.
  That is the outage, reproduced and detected without a person.
- `tsc` clean, lint 0 errors, build succeeds.

**Not verified:** the workflow itself has never run — it cannot, until it is on
main and a deploy exists to check. Its first run is the test.
