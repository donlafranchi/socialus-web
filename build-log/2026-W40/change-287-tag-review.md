### change #287 — tags are moderated after they appear: safe, unsafe, needs review

Don, 2026-10-01: tags are moderated after they appear, against a list that marks each tag safe, unsafe or needs review.

- **`tags.review`** (safe | unsafe | needs_review, default needs_review), plus who reviewed it and when. Those three columns are the operator's only: the `authenticated` grant is restated column by column without them.
- **`tag.review`** (operator only): unsafe also sets `status = 'hidden'`, the existing takedown. The tag stops matching search and showing anywhere, its rows stay, and a later "safe" restores it.
- **`/admin/tags`:** the tags waiting for review, oldest first, each with how many Pages and posts carry it, and Safe / Unsafe buttons.

Tests: handler and list tests seen failing against stubs first. Locally, a signed-in member still reads tag labels and is refused the review columns. **Migration: `20261001140000_tag_review.sql`.** Apply after #286.
