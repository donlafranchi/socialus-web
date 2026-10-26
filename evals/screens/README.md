# The screenshot matrix (#269)

*As of 2026-10-12 (content last changed that day). Review notes: `docs/DOC-INVENTORY.md`.*

Every routed screen in the 2026-10-01 screen inventory (`routes.ts`), as each
persona (`../personas.ts`), at 390, 744, 1024, 1280, 1440 and 1920px.

**Where the pictures are:** `screenshots/<width>/<persona>/<route>.png` at the
repo root (gitignored), and the `screenshots` artifact on the nightly CI run's
"Browser" job.

**Run it locally** against a throwaway local stack, never production:

    npx supabase@2.117.0 start
    npx tsx scripts/seed-personas.ts --apply      # refuses a non-local DATABASE_URL
    npx playwright test --project=screens

Narrow it with `SCREENS_PERSONAS=member,ownerBusiness SCREENS_ROUTES=explore,page
SCREENS_WIDTHS=390,1280`. If another local Supabase stack already holds ports
54321/54322, run this one from a copy of `supabase/` with other ports and point
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `DATABASE_URL` and `PLAYWRIGHT_PORT` at it.

**What CI runs:** a PR or a merge runs the smoke slice (`SCREENS_SCOPE=smoke`,
`SMOKE` in `routes.ts`): every route signed out, and every route not marked
`same` as a member and a business owner, at 390px. It gates on errors and saves
no pictures; the `screenshots` artifact comes from the nightly run. The whole
matrix runs nightly and from Actions → CI → Run workflow (#375).

**The app storyboard:** `npm run storyboard:app` turns `screenshots/390/**` into
`screenshots/storyboard.html`: every screen by area, one strip per persona. Add
`--base <sha>` for only the routes that diff changes (a copy PR's storyboard), or
`--dir review-bundle` for a review bundle. CI adds it to the `screenshots` artifact.

A run fails on a server error or an uncaught page error, never on looks: the
review happens on the pictures.
