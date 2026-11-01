# Cold-start brief: readable URLs (Don, 2026-11-01)

Work in `~/Projects/socialus-web` on your own new worktree. TDD, own PRs, merge when green, fix forward. Docker Desktop only, at most 2 builds. Don reviews by tapping live socialus.org links. Report context % in every message; end with the three-line report and SAFE TO CLOSE / NOT SAFE TO CLOSE.

## The ruling (Don, chat, 2026-11-01; newer than the 2026-10-06 ID-only ruling, which it replaces)
- Page: `socialus.org/<place>-<st>/<page-slug>`, e.g. `/sacramento-ca/plant-foundry`, `/granite-bay-ca/<page>`.
- Post: `socialus.org/<place>-<st>/<page-slug>/<post-slug>`; post slug from the headline, short suffix only when a headline repeats on that Page.
- Place segment: the home town **set once at creation, never derived from the current address, then frozen**; Page slug frozen with it. A move across town or cities changes nothing in the URL; the real address shows on the Page.
- **State suffix on every place**, always (`portland-or`, `portland-me`), so no address ever has to change. Two same-named places in one state: add the county (`lakeside-san-diego-ca`). Non-US (country code instead of state) is out of scope.
- Uniqueness is the pair (place, page slug). A same-name Page in the same place gets its neighborhood or `-2`.
- Place name order: (1) our own places list (Census places incl. census-designated places like Granite Bay, label dropped, common name), (2) the address's postal city, (3) the county. A small curated override table (place id to display name and slug) fixes awkward Census names; place slugs freeze once Pages exist under them.
- Reserved words (no Page or place may take them): at least explore, you, auth, onboarding, welcome, admin, api, create, open, terms, privacy, about, report, g, p, m, landing, join, plus every place slug.
- Old `/g/<code>`, `/g/<code>#announcement-<uuid>`, `/p/...` forms redirect 301 to the new address. `/rules` already 301s to `/terms`.
- Pretty is the point: no codes, no uuids in any shared URL. Share previews and canonical/og:url use the new address.

## First, before building
1. Read `socialus-plan/planning/research/URL-IDENTITY.md` and `url-plan-2026-10-06.md`; record this ruling as a dated entry there (replaces the ID-only amendment; ID still resolves internally). Update `verbs.md`'s "slug may not be renamed" line to "frozen at creation".
2. Read `socialus-web/src/lib/groups/resolve-page-address.ts`, `src/app/g/[handle]`, `src/lib/posts/resolve-shared-post.ts`, `src/app/p/`, the places/boundaries loader (`scripts/boundaries/`, `place_for_coords`), and `supabase/seeds/README.md` (the seeds are privileged: verify against a row made through the real handler, bug #175).
3. Label the PR "Path: new territory" (it reverses a ruling; Don approved in chat).

## Build, in order
1. **Migration** (goes to Don before merge; give the `apply.yml` command): `places` table gets `url_slug` (unique, state-suffixed); `groups` gets `place_url_slug` + `page_url_slug`, unique pair, immutable (trigger); posts get `url_slug` unique per Page. Backfill every existing Page (unclaimed too, e.g. Plant Foundry: `/sacramento-ca/plant-foundry`) and post.
2. **Slug generator** (pure, tested): name to slug, collision handling, reserved list, county rule, override table.
3. **Creation paths**: member-created Pages (handler) and the unclaimed seeder both assign the place and slugs at creation.
4. **Routing**: `[place]/[page]` and `[place]/[page]/[post]` at the site root, beating the reserved routes; unknown place or page is a 404. ID-based resolution stays as the internal fallback.
5. **Redirects**: old forms 301 to canonical (a client-side hop for `#announcement-<uuid>` fragments). Every in-app link, share button, sitemap, og:url and canonical switches to the new form.
6. **Tests**: unit for the generator and resolver; a handler-made Page (not a seed) gets a working URL; redirect tests; a journey that opens `/sacramento-ca/plant-foundry`.

## Done means
Each item names its check plus a live link: https://www.socialus.org/sacramento-ca/plant-foundry, a post under it, and the old https://www.socialus.org/g/81bjk0 redirecting.

## Open items Don knows about
Plant Foundry's phone, hours and links migration was applied by Don; its street address needs the unclaimed-pin workflow run. The F082 scenario in socialus-plan still describes the removed four-rule step.
