### F078 criterion 1 — a Post is reportable, and a report hides it

Needed by F101 (the Posts review page) and F102 (the poster answers first).

- **Report:** a visitor gets ⋯ → Report to the operator on each post (same sheet and reasons as a Page photo). The hide bar, caps, one-per-member and operator text apply as they do to a photo; sensitive content stays operator-only.
- **Hide = private.** A hidden post is `private` (managers only), the state every read path already honours, so browse, the Page, /p/<id> and the calendar file need no new predicate. `hidden_prior_discoverability` puts it back exactly; `hide_locked_body` makes a restore sticky for the words reviewed. Managers see "Hidden while we take a look."
- **Decide/reverse:** the same two buttons work for a post (restore, or remove and stamp `removed_at`).
- **Found by running the real handlers against the real schema** (the unit tests mock the database): `report.decide`'s report-row update failed with "inconsistent types deduced for parameter $2" (now cast), and `report.reverse` wrote `group.decision_reversed`, which the event-kind CHECK never listed (now added). Both would have failed on a real database.
- Migration `20261007220000_posts_reportable.sql`. The old queue (`/admin/reports`) still lists Page photos only; F101 replaces it with a per-subject page that includes Posts, so these two should merge together.

**F101 (#487), what this adds to the existing Posts page:** the page and its swipe/undo/keys/blur already existed (#304). Now a reported Post is its own row (with the words reported, not the reporter's), severity is the most serious tier among the open reports' reasons (sensitive content reads as tier 1), each row shows its reasons with counts ("Harassment ×2"), and says Post or Page photo. The detail shows a post's words instead of a photo.

**Still to do for F101, because the tables are in other open PRs:** the AI suggestion and confidence on the row (needs `report_assessments`, #495) and the poster's rebuttal and reporters' record (F102).
