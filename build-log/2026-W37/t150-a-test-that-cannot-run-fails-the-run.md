### T150 (#31) — A test that cannot run fails the run

`requireRunnable` (`tests/support/runnable.ts`): when an environment-gated suite finds its environment, it runs as before; when it does not, the suite **fails**, naming in one sentence what nothing verified and what would make it runnable. `ALLOW_UNVERIFIED=1` downgrades that to a warning and prints the claim. The decision is a pure function of `(requirement, env)`, so it is tested without an environment.

**Two gated suites, re-derived by grep rather than trusted from the ticket** — the storage-API suite and the RLS-coverage suite. The ticket also guessed at "the migration suites"; those read SQL files off disk and have no environment gate. Nothing else in `tests/`, `src/` or `scripts/` carries a `skipIf` or a hand-rolled runnable constant.

**The failure path is proven, not asserted.** A fixture suite that is unrunnable by construction is spawned under both settings: without the hatch the run exits non-zero, with it the run passes and prints the UNVERIFIED block. Two implementation facts were established against this repo's Vitest rather than assumed — a `process.on('exit')` hook prints nothing because each file's worker is gone by then, and Vitest swallows `console.warn` while passing `process.stderr` straight through. The warning is a raw stderr write during collection for both reasons.

**The gate found what it was built to find, on its first real run.** A local Supabase is up, so the storage suite executed for the first time since it was written — and two of its five assertions failed. Not a product defect: **the suite itself was wrong.** It builds two anon clients with the same URL and key under jsdom, so both share one `localStorage` under one default auth-storage key; B's sign-in silently overwrote A's session and both clients acted as B. The two cross-member checks were comparing B against B. Fixed with `persistSession: false` on both, plus an explicit assertion that each client sees the member it signed in as — so if the sessions ever cross again the suite says that, instead of quietly turning a cross-member test into a same-member one.

**With that fixed, all five storage assertions pass against local Supabase.** T120's storage boundary is verified for the first time: the `media` bucket rejects JPEG, SVG, and >5MB, rejects a write under another member's prefix, and accepts a WebP under the uploader's own. The `storage.objects` policies are correct as written.

Verified: `local Postgres` — both suites run green against `supabase start` (storage 5/5, RLS 1/1), and both go red with the environment removed. Tests: 8 new, plus 2 converted suites. Full suite otherwise unchanged. tsc/eslint at baseline.

**Deploy is not complete at merge.** No migration this ticket.
