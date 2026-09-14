### T159 (#64) — The composer's category step becomes a tag step

Ruled 2026-09-13: **one vocabulary, tags only.** The twelve-term category picker is gone; step 3 of the walkthrough is now a tag input, in the same position, and the walkthrough stays six steps.

**Creators create their own tags.** A plain text input, not a picker over a fixed list — nothing seeds the vocabulary, and the first creator who types *sourdough* is the reason that tag exists. Suggestions from existing tags are a progressive enhancement and deliberately absent: gating the step on a seeded list is exactly what the ruling removed.

**Two tables, because a tag is shared and a Page's use of one is not.** `tags` is the vocabulary, `page_tags` is what a Page carries. One text column per Page would make "which tags exist" a distinct-scan and a rename impossible.

**Normalization is the whole reason `tags.normalized` exists.** Creators type freely, so *"Sour Dough"*, *"sour dough"* and *" SOUR  DOUGH "* must be one tag rather than three — and the failure is silent: search still works, it just finds a third of what it should. Punctuation is deliberately kept; stripping it would mangle *wood-fired* into *woodfired* and merge distinct trade names.

**Comma commits a tag.** People type lists that way unprompted, and a creator typing *"bread, pastry"* and getting one tag called *"bread, pastry"* is a silent wrong answer. Enter does the same and does not submit the step.

**Greyed examples, not help text** *(Don, 2026-09-13)*: *"a creator knows what they offer. this isn't their first rodeo and they likely already market on other apps."* The placeholder reads `sourdough, honey, eggs, soap` — farmers market register, because that is the seed audience. The line explaining what a tag is was removed. A test asserts the examples are a placeholder and never a default: the input is empty, and Continue is still blocked.

**A word typed but not added still counts at publish.** Someone who types a tag and taps Create rather than Add has not changed their mind.

**The attach is `on conflict do nothing` plus a select, not `returning`.** A tag another creator already made returns no row from the insert and must still be attached — `returning` alone would silently drop it.

**Removed:** `page-categories.ts`, `resolve-page-category.ts` and both their tests; the Zod enum; the `PageCategory` type; the `group_category_suggestions` write; and the category chip on the public Page. **`groups.category` and the suggestions table are left in place** — dropping them is a separate, reversible cleanup, and nothing reads them now.

**Tags are NOT displayed publicly yet**, deliberately. A public tag is member-contributed content other members see, which rule 1 bars from production without report-and-takedown. `tags.status` is the hook that work will use.

Verified: `unit tests only`. The migration applies against local Postgres, and the suite is green — but **the tag step has not been exercised in a browser**: reaching it needs auth plus a draft Page, and the dev composer route renders a generic demo rather than this walkthrough. **Named as the missing check; the PR is a draft for that reason.** Tests: 30 new. Full suite: **130 files, 1562 tests, all passing, nothing skipped.** tsc/eslint at baseline.

**Deploy is not complete at merge**, and this one must not reach production at all until #13 ships — see the PR.
