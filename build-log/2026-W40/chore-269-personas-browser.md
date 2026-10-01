### chore #269 — personas, the browser suite in CI, and a screenshot matrix

Don approved option B on 2026-10-01. It clears the accepted risk "the browser test suite never runs" (due 2026-10-16).

- **Personas:** `evals/personas.ts` defines signed out, a stranger, a follower, a confirmed member, an unconfirmed member, someone party to an RSVP, the operator, and an owner for each of the six Page kinds. Each Page has followers (except the private one), members, a timed and an untimed announcement, and a gathering with RSVPs. The business Page also has a product and a service.
  - `scripts/seed-personas.ts` generates `supabase/seeds/personas.sql` from that file, and applies it only to a local host.
  - `tests/personas-seed.test.ts` fails when the two drift.
- **CI:** the "Browser" job in `ci.yml` uses a throwaway stack, the persona seed, a production build, then:
  - the must-fail spec, and the job stops if it passes
  - the feature evals
  - the screenshot matrix, uploaded as an artifact
- **Feature evals:** 238 pass locally, stable across two runs. 46 that fail against today's rulings (public profiles, rosters, seller names and so on) are excluded by exact title in `evals/quarantine.ts`. `tests/eval-quarantine.test.ts` fails on an entry whose title no longer exists.
- **Matrix:** 44 screens × 13 personas × 6 widths.
- **First finding:** signed-in Explore nested an `<li>` in an `<li>` and failed to hydrate, fixed in #271. #266 had the same pattern and is fixed on its branch.
- **Join approval:** not built, so the confirmed and unconfirmed members differ only in `confirmed_at`.

No migration.
