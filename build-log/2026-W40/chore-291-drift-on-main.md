### chore #291 — the migrations-applied check also runs on main

"Migrations applied to production" ran on pull requests only, so every push to main showed it skipped. It now runs on pushes to main too, so a merge that lands a migration production doesn't have turns main red. Checked by hand on 2026-10-01: production and main match, 69 of 69. `tests/ci-drift-on-main.test.ts` was seen failing against the old condition.
