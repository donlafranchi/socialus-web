### change #285 — tags on a live Page can be edited any time

Don, 2026-10-01: tags are editable at any time, forever.

- `group.update` takes the Page's whole tag set and replaces it in the same transaction: upsert into the vocabulary, drop what's gone, attach what's new. Two spellings of one tag count as one. A Page is never left with none, because search matches tags.
- Page edit shows a tag input (`TagInput`, written to match the create flow's; the create walkthrough itself is untouched — it is being redesigned). Changing a tag counts as unsaved. Saving with none says why and sends nothing.
- A tag that has been taken down isn't offered back on the edit form.
- `links.ts`: the Page→Tag link is now written by `group.update` too, ruled 2026-10-01. Registry regenerated.

Tests: the handler and edit-form tests were seen failing first. The create flow's tests pass unchanged on the shared input. **No migration.**
