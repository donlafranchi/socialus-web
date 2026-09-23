import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'
import path from 'path'

// DB-bound suites (currently only tests/rls-coverage.test.ts) read
// process.env.DATABASE_URL, which Vitest does not populate from .env files on
// its own. Load .env.test.local if the developer has created one.
//
// Opt-in by design: without the file, `npm test` behaves exactly as before and
// the DB-bound suite skips. With it, the suite runs against whatever database
// the file names. dotenv does not override already-set variables, so an
// explicitly exported DATABASE_URL (CI, or a one-off remote check) still wins.
//
// The suite is read-only — a single SELECT on pg_tables — so pointing it at a
// remote project is safe. See .env.local.example for the recipe.
dotenv.config({ path: '.env.test.local', quiet: true })

// TZ IS PINNED, AND IT IS A CORRECTNESS FIX, NOT A PREFERENCE — bug #211.
//
// `METRO_TIME_ZONE` is 'America/Los_Angeles', and so is this laptop. So a
// surface that formats in the READER'S DEVICE timezone and a surface that
// formats in the METRO's produce identical strings here and differ everywhere
// else. Exactly that bug shipped: an Explore card read "THU, SEP 24, 2:12 AM"
// while the Page read "Wednesday, September 23 at 7:12pm", and no test could
// see it, because on the only machines anyone ran tests on the two zones are
// the same one.
//
// UTC because CI runs UTC. Pinning it to the metro zone would have made the
// suite agree with this laptop and disagree with CI, which is the wrong way
// round: a test that passes locally and fails in CI is at least visible.
process.env.TZ = 'UTC'

// Issue #38 — the probe suites cannot run in parallel with each other.
//
// Each of these writes probe files into a fixed path under src/ and shells out
// to eslint / check-action-layer-conformance.ts. Two of them share
// src/__sql_probe__ outright, so they clobber each other's files and each
// other's cleanup. Worse, their "passes on the current tree" assertions scan
// ALL of src/, so they fail whenever any sibling has a probe on disk at that
// instant — which is why the failing set changed between runs.
//
// Unique probe directories alone would NOT fix it: a whole-tree scan sees any
// probe anywhere. The ordering constraint is the real one, so they get their
// own project with fileParallelism off. Everything else stays parallel —
// running the whole suite serially costs ~245s against ~65s.
// Membership rule: any suite that writes a file under src/ or runs a
// whole-tree check belongs here. actions-t043 was not in the original list —
// it writes src/lib/_conformance_probe.ts and runs the same conformance
// script, and it stayed hidden because it only lost the race occasionally.
const PROBE_SUITES = [
  'tests/ci-enforcement-rule-1.test.ts',
  'tests/ci-enforcement-rule-2.test.ts',
  'tests/ci-enforcement-rule-4.test.ts',
  'tests/ci-conformance-json.test.ts',
  'tests/eval-bootstrap.test.ts',
  'tests/actions-t043.test.ts',
]

// `.claude/**` is load-bearing here, not housekeeping. A git worktree created
// inside the repo carries a full copy of tests/, and Vitest will happily run
// both copies — so a stale branch's tests get scored against this branch's
// code. That produced "new row violates row-level security" failures on
// 2026-09-12 against a storage suite that passes cleanly on its own.
// Worktrees now live outside the repo (ops-pattern CLAUDE.md § Sessions), so
// this should never fire — it stays because the failure it prevents looks
// like a real bug in your own code, and costs an hour before you suspect it.
const EXCLUDE = ['evals/**', 'node_modules/**', '.stryker-tmp/**', 'reports/**', '.claude/**']

const shared = {
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
}

export default defineConfig({
  test: {
    projects: [
      {
        ...shared,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: [],
          exclude: [...EXCLUDE, ...PROBE_SUITES],
        },
      },
      {
        ...shared,
        test: {
          name: 'probe',
          environment: 'node',
          setupFiles: [],
          include: PROBE_SUITES,
          exclude: EXCLUDE,
          // Load-bearing: these suites share on-disk state under src/.
          fileParallelism: false,
          // Each test spawns `npx eslint` or `tsx` and waits for it. Vitest's
          // 5s default is unrealistic for that — a cold eslint run alone is
          // several seconds, more when the unit project is using the cores.
          // This was the second half of issue #38: the shared-probe race and
          // a too-tight timeout looked like one flaky symptom.
          testTimeout: 60_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
