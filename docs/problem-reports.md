# Member bug reports (#443)

A member's report becomes a fixed bug with the PM seeing only what needs a human. Research and the PM's ruling: socialus-ops `process/research/2026-10-06-bug-triage-and-mutation-testing.md` § 2.

## Built
1. **Report a problem** (`/report`): signed-in members; linked from the footer, You → Settings, and the error and not-found pages. One box. A hidden field turns bots away. 5 reports per member per hour and 60 per hour overall.
2. **Private table** `problem_reports`: the whole report, member id included, readable by no client; written through `problem.report`.
3. **Scrubbed public Issue** (`src/lib/problem-reports/public-issue.ts`, tested): route without its query string, role (not who), a 7-character build, the browser family, the report id, and a 400-character excerpt with emails, phones and zip-like numbers cut out. Carries the Kind, Scenario and Path lines `issue-lint` needs. Labels `bug`, `member-report`, `needs-triage`. **The excerpt is member free text and a scrub cannot catch a name:** if the PM prefers no text in the public Issue, drop the excerpt in `publicIssue`.
4. **Filing and triage** (`.github/workflows/problem-reports.yml`, every 30 minutes, `scripts/problem-reports.ts file`): files up to 10 reports a run. With `ANTHROPIC_API_KEY` set, Haiku 4.5 adds `area:*`, the milestone, `launch-blocking` (only for an error screen or another member's data) and a "possible duplicate of #N" comment; it can only choose from a whitelist.
5. **Heartbeat** (`problem-reports-heartbeat.yml`, daily): opens one `pipeline-stalled`, launch-blocking Issue when the filing job has had no successful run in 26 hours.

## Turning it on (a person, once)
1. Apply the migration (done by the lane under Dispatch's standing rule while there are no real members).
2. Set the repository variable `PROBLEM_REPORTS_ENABLED=true`.
3. Optional triage: add the Actions secret `ANTHROPIC_API_KEY` for a key in its own Anthropic workspace **with a hard monthly spend limit set in the console** (suggest a few dollars). Without the key, reports are filed untriaged.

## Spend
The only paid piece is the model call: Haiku 4.5, 300 output tokens, a trimmed prompt, at most 10 a run, none without the key. The hard cap belongs on the Anthropic workspace; nothing here is uncapped.

## Not built (and why)
- **Reproduce with a failing Playwright test, and draft a fix PR** (steps 5–6): they wait on the model bake-off (10 seeded reports, Haiku vs Sonnet) and on the PM's key.
- Scrubbed **console errors** in the Issue: needs a small client-side collector.
- **Signed-out reports**: an anonymous write path is its own rule-laden thing; a signed-out visitor is asked to sign in.
- The Sentry feedback widget alternative is the PM's choice (see `docs/error-tracking.md`).
