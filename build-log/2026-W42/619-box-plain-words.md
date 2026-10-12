# F092.2, F092.4 · #619 #621: the sheet writes plain words into the box, and the box reads them back

The PM, 2026-10-11: plain words as Google writes them, no hashtags, built so natural-language search can grow in. `src/lib/browse/box-text.ts` is the one grammar in both directions: `<free words> <tags as plain words> <this week | this weekend>`. `writeBox` is what Apply writes; `readBox` takes the schedule phrases and the tags present in the results out of the box and leaves the rest as the free search, so an unknown word is never an error.

- The box is the state. `BrowseSurface` no longer holds a second filter state: the filters are read from the box text, the URL carries `?q=` only, and an old `?category=`/`?schedule=` link is written into the box on the way in.
- Apply opens the box on what it wrote; Clear all takes the sheet's words out and keeps the free ones; clearing the box clears the narrowing.
- The sheet offers tags as plain words (`live music`, no `#`). A tag with exactly a schedule phrase is the box's own word and is not offered.
- Round trip (F092.4): every selection over 3 schedules × 2^8 tags, including nested and hyphenated tags, reads back as itself.

Not here: F092.5 (text not understood opens the sheet) and the natural-language layer.
