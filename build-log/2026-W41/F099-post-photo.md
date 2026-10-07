### F099 · #460 (1 of 2) — a post may carry one photo of its own

`page_posts` gains `photo_url` plus the Page photo's hide/remove columns (migration `20261007200000_post_photos`). `group.post_create`/`post_edit` take one `photoUrl` (a single URL, never a list), which must be an object in the media bucket under the acting member's own folder (`isOwnMediaUrl`); an edit that omits it leaves it, `null` removes it and records `photo: 'removed'` on the `group.post_edited` event. A different photo clears hidden/removed state; the same URL keeps it. Nothing touches `groups`. The composer and edit form reuse `PagePhotoPicker` (so the F080 ask, WebP re-encode and 5 MB limit are the existing ones). `resolvePagePosts` resolves hidden/removed on the server before props. Every post card on its Page shows one image: its photo (alt = the post's first line), else the kind placeholder (alt = Page name).

Part 2: the Page picture, the SQL fallback in browse/Explore, per-image reports, signed-out.
