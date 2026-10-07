### F078 criterion 1 — a Post is reportable, and a report hides it

Needed by F101 (the Posts review page) and F102 (the poster answers first).

- **Report:** a visitor gets ⋯ → Report to the operator on each post (same sheet and reasons as a Page photo). The hide bar, caps, one-per-member and operator text apply as they do to a photo; sensitive content stays operator-only.
- **Hide = private.** A hidden post is `private` (managers only), the state every read path already honours, so browse, the Page, /p/<id> and the calendar file need no new predicate. `hidden_prior_discoverability` puts it back exactly; `hide_locked_body` makes a restore sticky for the words reviewed. Managers see "Hidden while we take a look."
- **Decide/reverse:** the same two buttons work for a post (restore, or remove and stamp `removed_at`).
- **Found by running the real handlers against the real schema** (the unit tests mock the database): `report.decide`'s report-row update failed with "inconsistent types deduced for parameter $2" (now cast), and `report.reverse` wrote `group.decision_reversed`, which the event-kind CHECK never listed (now added). Both would have failed on a real database.
- Migration `20261007220000_posts_reportable.sql`. The old queue (`/admin/reports`) still lists Page photos only; F101 replaces it with a per-subject page that includes Posts, so these two should merge together.
