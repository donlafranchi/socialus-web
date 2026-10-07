# bug #439 — archived and deleted Pages, every read path

- **Leaks found by the new matrix rows:** a Page's members and RSVP parties still read an archived or deleted Page's items (`items` policies never looked at the Page's state); `venue_hosted_items` and `page_listed_member_counts` (security definer) answered anyone; `discoverable_items` (no RLS) kept an archived Page's items. All four now follow `groups_hidden_owner_only`; the view refreshes when a Page changes state.
- **Operator access, decided well-worn:** operators read an archived or deleted Page on the operator page (over the pool), as Facebook and Google moderators do in their own tools; the public Page stays hidden from the operator's own account. `tests/archived-page-paths-db.test.ts` holds it.
- **Reusable:** a matrix resource can carry `setup` SQL (run as the owner, rolled back per viewer), so a state like "archived" is a row, not a new test.
