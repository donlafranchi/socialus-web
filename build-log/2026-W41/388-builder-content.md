### change #388 — builder content: one switch, and delete it all

Don, 2026-10-05: a way to clear out what the builder agents make; then, as one person with a day job, global actions first.

- **The switch** (`builder_content.visible`, on by default): `builder_visible()` now also answers true while it's on, so every policy and function that already filtered builders follows it. A builder's follows, joins and RSVPs keep #280's rule through `builder_relation_visible()`, so seed content never inflates a real Page's numbers.
- **Delete all** (`delete_builder_content()`): Pages and everything under them, items, follows, memberships, responses, a builder's own reports, and locations nothing else points at. Tags stay (a member's Page may use one); a member's report about a builder Page stays. Builder accounts stay.
- **Where:** `/admin/builders` (operator, phone-first: one tap with Undo for the switch, one extra confirm for delete) and the "Builder content" workflow (status, hide, show, delete with DELETE typed), which also removes photo files through the Storage API. The app can't hold the service key, so in-app delete leaves the files for the workflow; nothing references them by then.
- **Deferred** (noted on #388): per-run and per-account scope, and Archive.

Tests: `tests/builder-content-db.test.ts` (member content survives; rolled back, since the delete is global), `tests/builder-isolation-db.test.ts` (switch off as #280, switch on shows content and relations still don't count; the switch is set per transaction), `src/actions/builder/content.test.ts`.
