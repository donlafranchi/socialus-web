# #577 — F058 criterion 4: a removed photo stays off the map

The map hook read only `photo_hidden_at`; removal clears the hide and sets `photo_removed_at`, so a removed photo kept serving on pins. The hook now selects and passes `photo_removed_at`. Two checks in `useMapPages.test.ts` (red before, red against a mutant that drops the projection). Marked `F058.4 partial`: the map; the Page, share cards and Browse already read the same projection.
