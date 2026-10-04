### F072 · T179 (#262) — an optional end time, shown as 7–9pm

Don approved an end time, 2026-09-30, from the "compare and fill" pass. F072 criterion 3 covers an announcement's time and nothing in it forbids an end. It needs a dated line in ops-pattern.

- **Schema:** `page_posts.ends_at`, with `page_posts_ends_after_start` (only beside a start, and after it). `browse_feed` is dropped and recreated with `ends_at`, keeping #252's signed-out rules and #259's no-pin rule.
- **Write:** `group.post` create and edit accept `endsAt`; create refuses an end with no start or at or before it.
- **Composer:** "until" on the same day as the start. The Page's composer says why it refuses one ("The end time is before it starts.").
- **Show:**
  - the card: `Thu Sep 10 · 7–9pm`, or both days when it runs past midnight
  - the Page's announcements: "Thursday, September 10 at 7:00–9:00pm"
  - a gathering's page: the same, carried onto a series' next occurrence
  - the `.ics` from #260 carries `DTEND`
- **Gathering times:** the composer now sends start and end as instants in the metro's zone. It sent a bare local time, which the database read as UTC, seven hours off. The gathering page showed only the date, which hid this. **Gatherings already saved keep the old offset until corrected; that is a data question for Don.**

Tests: `tests/announcement-end-time-db.test.ts`, 3 against Postgres 17.6.1.166 built from every migration; all seen failing before this migration. The handler, formatter, composer, card and gathering-label unit tests were each seen failing first.

**Migration: `20260930240000_announcement_end_time.sql`.** Apply after #258 and #261 merge.
