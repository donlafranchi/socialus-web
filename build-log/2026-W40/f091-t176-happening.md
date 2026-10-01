### F091 · T176 (#257) — What's happening, today and this week

F091 (approved 2026-09-19): under "What's happening…", rows complete the sentence: *today*, *this week*, *this weekend*. Upcoming first, which Don asked for in the "compare and fill" pass.

- **Windows:** `happeningWindows` uses the metro's zone, bound to the hour. Every row starts now; today ends at the metro's midnight; the week and weekend end at the metro's next Monday 00:00 (ISO weeks, as `metro-week.ts`). Daylight saving keeps local midnight.
- **Read:** `loadBrowse` makes one `browse_feed` call per row (posts only, `p_starts_from` / `p_starts_before`, `p_sort => 'soonest'`, 20 each), for signed-in readers. A failed row read costs the rows, never the surface.
- **Rows:** `HappeningRows` uses horizontal rows like the following row. An empty row is absent, and the stem is absent when every row is.
- **Copy:** `COPY.happeningStem` and the three row words.

**Not built:**
- signed-out rows. Post rows reach no signed-out reader (F093), and the withheld read has no start-time window. That's the open question on #257.
- criterion 6's series de-duplication, because F074 series aren't built and there is nothing to de-duplicate. It lands with F074.

Tests (each seen failing first):
- `happening.test.ts` (`[guards F091.2]`)
- `HappeningRows.test.tsx` (`[guards F091.3]`, `[guards F091.4]`)
- loader tests (`[guards F091.1 partial]`)

No migration.

**2026-10-01 — signed out, the today row** (Don, answering this Issue): one "Sign up to see what's happening" card for each Page that posted something today, the same card as the signed-out front door. "Posted today" runs midnight to midnight in the metro and uses when it was posted, never when it happens, through the same withheld read. The week and weekend rows stay empty signed out. Loader test seen failing first.
