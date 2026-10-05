### chore #375 — the Browser job in minutes, not fifty

The Browser job took ~50 minutes a push, ~45 of them the screenshot matrix: 45 routes × 13 personas × 6 widths, 3,510 page loads. PRs and merges now run its smoke slice (`SCREENS_SCOPE=smoke`, `evals/screens/routes.ts` `SMOKE`): every route signed out at 390 and 1280px, and the 26 routes that differ by viewer as a member and as a business owner at 390px — 142 loads. The whole matrix runs nightly (10:00 UTC) and from Actions → CI → Run workflow. The guard and every feature eval still run on every push.

- **Stack:** `supabase start -x` skips realtime, imgproxy, mailpit, postgres-meta, studio, edge-runtime, logflare, vector and supavisor; nothing the suites reach uses them. `db reset` after `start` is gone: a fresh `start` already applies every migration and the seed. In the Browser job it starts in the background while npm ci and the browser install run.
- **Caches:** the Playwright browser (headless shell only) and `.next/cache`.
- **Check names unchanged:** `Lint, types, build`, `Unit tests`, `Browser`, `Migrations applied to production`.
