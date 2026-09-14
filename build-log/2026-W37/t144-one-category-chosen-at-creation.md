### T144 — One category, chosen at creation

A new Category step (native radio inputs — arrow-key nav and one tab stop for free, no custom widget) lands between Anchor Location and About in the Sell walkthrough, now six steps. Twelve fixed terms (`PAGE_CATEGORIES`, `src/lib/groups/page-categories.ts`) plus "Something else," which reveals a free-text input. **Deliberately not persisted via `group.update_draft`** — held in composer state until the final "Create my shop" tap, which sends it straight to `groupActivate` (new `category: {term} | {otherText}` on its Zod schema), writing `groups.category` or a `group_category_suggestions` row in the same transaction as the lifecycle-state promotion. Renders on the public Shop page as a plain chip (fixed term) or unframed text (free text, same treatment as a self-declaration — no platform chrome).

**Two real gaps fixed forward, not just flagged:**
1. A genuine bug caught mid-build (not a separate review pass): the first cut inferred "Something else is selected" from whether the free-text field was non-empty — clearing the text silently deselected the radio. Fixed by widening the state type to `PageCategory | 'other' | null`, an explicit selection state.
2. T141's RLS policy on `group_category_suggestions` scoped SELECT to the author or founder — T144 needs the free text shown publicly. Fixed via a pg-pool read (`resolvePageCategoryOtherText`), the same fix-forward shape T143 used for the placement resolver, rather than a migration this ticket's scope rules out.

**One real cost named, not hidden:** category doesn't survive an abandoned-draft resume (nothing to restore it from) — the literal reading of "same transaction as publish" requires this, to avoid leaving abandoned `group_category_suggestions` rows from a changed mind mid-draft.

**One scope gap confirmed in code:** "renders on the Page's card wherever cards render Pages" has no target — no Page/Shop card component exists anywhere in this codebase yet (same shape as T142's Gathering-composer finding).

Tests: 13 new (vocabulary constant, `group.activate`'s five category paths, the composer's four category-step behaviors, `resolveShop`'s two category pass-through cases, `ShopPublicPage`'s three render cases, the new `resolvePageCategoryOtherText` helper) plus extensive updates to `SellWalkthrough.test.tsx`'s existing suite for the new six-step shape (step-count assertion, every `advanceTo*` helper, both resume tests' step index, the final `activate` call-shape assertion). Full suite: same pre-existing flaky subprocess-spawning test files as before (ci-enforcement-rule-*, eval-bootstrap — verified directly: `npx tsx scripts/check-action-layer-conformance.ts --json` returns clean; the test-harness subprocess spawn is what's flaky, not the underlying tool) plus the known signup red — no new regressions. tsc/eslint/action-layer clean.

**Deploy is not complete at merge.** No migration this ticket — nothing new to apply to production.
