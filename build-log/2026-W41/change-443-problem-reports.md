### change #443 — the member bug-report pipeline, first slice

Built: the in-app Report a problem (`/report`, footer, You, error and not-found pages), the private `problem_reports` table (migration), the `problem.report` handler with rate limits, the scrubbed public Issue (tested), the filing script and workflow, a Haiku triage step (whitelisted, capped, off without a key) and a daily heartbeat. Not built: reproduce-with-Playwright and the draft fix PR (they wait on the bake-off and the PM's key), scrubbed console errors, signed-out reports. Turn-on steps and spend: `docs/problem-reports.md`.
