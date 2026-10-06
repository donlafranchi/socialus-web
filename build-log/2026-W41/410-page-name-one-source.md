# bug #410 — a renamed Page kept its old name on the Page

- Cause: a business Page stored its name and description on `groups` (Explore, feed) and on `group_businesses` (the Page). Editing a published Page wrote only `groups`.
- Fix: `groups` is the source of truth and the Page reads it. Migration `20261004140000_page_name_one_source` reconciles existing rows once (the `groups` value wins unless empty or the draft placeholder), then triggers keep the two rows equal whichever is written.
- Guards: `tests/page-name-one-source-db.test.ts` (both writers), `resolve-shop.test.ts` § #410.
- Retimed to 20261004140000 so it applies before the pending 10-05 migrations (353, 331, 388); it touches only its own functions and triggers.
