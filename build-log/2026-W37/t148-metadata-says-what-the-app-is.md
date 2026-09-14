### T148 (#29) — Metadata says what the app is

The root description shipped as *"Follow the makers you meet at your local farmers market. Every dollar you spend here stays here."* — a farmers-market marketplace, plus an unratified absolute about money, in the one string a search result and every shared link render. Replaced with the PM's wording verbatim (147 chars), and the root gained an `openGraph` block with title, description and `type` — **no image**, that waits on the photo work. Before this the root defined no `openGraph` at all, so a shared link to the home page fell back to the bare title.

**The real fix is the scope, not the string.** The promise sweep of 2026-09-07 read page copy and stopped at the component boundary, which is how metadata survived it. The new tests scan the whole of `src/app` rather than one file: every metadata-exporting file is found, every `title:` must be `{thing} — SocialUs` or the bare product name, and no `description:` may contain promise, absolute or money-claim language. A count assertion fails if the scan finds fewer surfaces than exist, so the sweep cannot pass by finding nothing.

**All four guards are proven to fail**, not just to pass — reintroducing the money claim, adding an OG image, dropping a title suffix, and planting `No fees, ever.` in a per-page description each redden the run.

**Metadata exports read — nine, the full list:** `layout.tsx` (rewritten); `m/[handle]/page.tsx`, `m/[handle]/p/[slug]`, `m/[handle]/s/[slug]`, `m/[handle]/e/[slug]`, `p/[...slug]`, `you/following` (all already `{thing} — SocialUs`, unchanged); `vendors/[slug]` and `business/[slug]` (retired surfaces, left alone per the ticket — though **T149 is blocked on T125/T126, so they will linger longer than the ticket assumed**, and both reference an `og-default.png` that does not exist in `public/`).

**The `src/`-wide grep for money and absolute language found two live instances beyond the one fixed:** `RecruitmentGrid.tsx:153` and `:167` both claim *"Listing costs nothing"* — a fee claim about the platform, in shipped page copy, not metadata. Not fixed here: `RecruitmentGrid` is gated reference material for T125, which replaces its content wholesale. **Flagged for that ticket.** Everything else the grep surfaced is a producer's own price label ("Free" on an item), a hedged time estimate ("about 90 seconds"), or a factual statement about a validation rule ("we never guess one") — none are platform claims.

**`design:ux-copy` ran and recommends no change.** Two observations for the PM, both out of a copy editor's remit: "the people near you" and "your neighbors" name the same group twice in one sentence, and *volunteer* as a verb translates unevenly. The string stays as ratified.

Verified: `unit tests only`, plus the rendered `<head>` of `/` against `next start` — title, description, `og:title`, `og:description`, `og:type`, and no `og:image`. Tests: 10 new. Full suite: same pre-existing reds as main (#38's subprocess flake and the known signup red) — no new regressions. tsc/eslint unchanged from baseline.

**Deploy is not complete at merge.** No migration this ticket.
