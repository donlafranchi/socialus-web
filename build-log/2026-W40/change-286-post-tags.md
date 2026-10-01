### change #286 — tags on posts

Don, 2026-10-01: tags go on posts as well as Pages, editable any time. Values tags are separate and not here (F097).

- **`post_tags`** (post → tag). Readable signed in only, and only with its post, so `page_posts`' own policies decide, builder isolation included.
- **`browse_feed`** is restated from #280's version. A post carries its own tags, or its Page's when it has none, and a tag lens matches either.
- **Handlers:** `group.post_create` takes optional tags. `group.post_edit` replaces the set when given one (`[]` clears the post's own), and leaves the tags alone when the edit doesn't mention them.
- **Composer:** "Tags (optional)" with the shared tag input, on new posts and on edit, starting from the post's own tags.
- **`links.ts`:** "an Announcement carries a Tag", ruled 2026-10-01. The object keeps its `nouns.md` name until that file changes it.

Tests: `tests/post-tags-db.test.ts` (2 seen failing before the feed change, 5 pass after); handler and composer tests seen failing first. **Migration: `20261001130000_post_tags.sql`.** Apply after #284.
