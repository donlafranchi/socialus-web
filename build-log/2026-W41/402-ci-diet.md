### chore #402 — the CI diet

Actions minutes ran out on 2026-10-05: 11,269 job-minutes since 2026-10-04 (rounded up per job, as billed) against 2,000 free a month; jobs now fail to start on the spending limit.

- Draft PRs run no CI; marking one ready runs it all.
- A PR touching only markdown, `docs/`, `build-log/`, `tests/` or `*.test.ts(x)` runs nothing; main runs everything after the merge.
- Browser runs on a ready PR labelled `human-review` (or `needs-don`), when that label is added, on every push to main, and nightly (smoke); the whole screenshot matrix moves from nightly to Sundays and on demand.
- Lint/types/build and Unit tests skip the nightly schedule (main's push already ran them) and label events, which get their own concurrency lane so a label never cancels a push's checks.
