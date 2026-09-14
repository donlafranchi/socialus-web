### T141 — One migration for category, photo column, and the new event types

Substrate. `040_page_identity.sql`: `groups.category` (nullable text, no CHECK/enum — the vocabulary is a code constant for T144), `groups.photo_url` (nullable text), `group_category_suggestions` (captured free-text, no status/promoted column — promotion is a human editing the constant), and the `group_events_event_kind_check` constraint extended with `group.photo_set`, `group.photo_removed`, `group.updated` (the last one is F056's, landed here so its migration doesn't need its own hand-push). 10 tests GREEN, tsc/eslint/action-layer clean.

**Two builder's-judgment additions the ticket didn't specify**, both flagged in `development/DEVIATIONS.md` as flag-for-spec-revision Type A: RLS policies on `group_category_suggestions` (required by Rule 3, not named in the ticket — author-only insert, author-or-founder read), and a 280-char cap on `raw_text` (borrowed from F056's unrelated `values_statement` field, not a ratified number for this column).

**Deploy is not complete at merge.** Migration `040` must be applied to production by hand — `scripts/migration-conformance.sh` will flag it until then.
