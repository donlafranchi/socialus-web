# chore #213 · Six subprocess suites run against a 5s timeout

Seven timeouts across four branches on 2026-09-23. Always a timeout, never an
assertion, always green alone.

## The config already had the answer

`probe` carries a 60s budget because "each test spawns `npx eslint` or `tsx`
and waits for it". That reasoning is about **the spawn**. PROBE_SUITES'
membership rule is about **shared on-disk state under src/** — a different
thing, and still correct. Six files spawn and share nothing, so they matched
neither rule and ran in `unit` at 5s.

`ci-enforcement-rule-5` is the tell: rules 1, 2 and 4 are in PROBE_SUITES and
5 is not.

## Fixed

A third project, `subprocess` — 60s, node environment, parallelism left on
because these share no state. Not folded into `probe`: that would cost the
suite parallelism and blur a membership rule that is written down and right.

My own `migrations-drift-parse.test.ts` per-test 30s annotations are removed;
the project handles it now and two mechanisms for one rule is how they drift.

## The guard

`tests/vitest-project-membership.test.ts` reads PROBE_SUITES and
SUBPROCESS_SUITES **out of the config** rather than restating them, and fails
when any subprocess-spawning suite is in neither. Also fails on an entry naming
a file that does not exist, and on a file in both.

Checked it catches a stray rather than assuming: removing
`tests/ontology-registry.test.ts` from the list turns it red and names that
file. Restored, green.

## Verified

Two consecutive full runs, **2489 passed, zero failures** both times. That is
the first all-green full run of the day.

## Why this mattered more than a flaky test usually does

Three times today it cost a clean verification. Once it masked a check that
mattered — `manifest.test.ts` timed out on a branch that changed migrations,
which is exactly where a stale manifest is a real defect, so it had to be run
by hand to find out.

And it was getting worse: this morning, missing 5000ms by a few hundred
milliseconds; this afternoon, missing 60000ms.

A guard people learn to re-run is a guard that stops being believed — the same
failure as #188's gate passing without asking, #209's parser reporting clean,
and a mocked count agreeing with itself. This one was one layer further out:
the suite that would have caught those.
