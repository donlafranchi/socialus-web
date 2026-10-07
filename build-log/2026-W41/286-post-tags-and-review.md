### change #286 + #287 — tags on posts, and the operator reviews tags after they appear

Rebuilt on main from the draft PRs #289 and #290 (Don, 2026-10-01).

- **Posts take their own tags** (`post_tags`), set when posting and editable any time. A post with none carries its Page's, so a tag lens still finds the Page's posts. Signed in only, like a Page's tags. `browse_feed` is the main definition plus only the post-tag lines.
- **Tag review:** a tag shows the moment it is made and starts as *needs review*. The operator marks it safe or unsafe on `/admin/tags`; unsafe sets the existing `hidden` status, so nothing is deleted and either call can be reversed. Review columns stay unreadable to members.
- **Migrations:** `20261007180000_post_tags.sql`, `20261007190000_tag_review.sql`. Re-dated 2026-10-07 after the latest applied. The old tag-review column grant is dropped: main already narrows the readable tag columns (#469), and the new columns are not granted.
- Tests: handler (guard seen failing with the write disabled), Posts composer and edit, DB test for the lens and the signed-out case, review handler and list.
