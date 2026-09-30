### F072 · T175 (#256) — an announcement's card leads with when, says where, and keeps its posted date

Don's "compare and fill" pass, 2026-09-30, against three reference event cards. These are the gaps F072 criterion 3 covers.

- **When:** a timed announcement's Explore card leads with its start in large type, in the metro's time: `Thu Sep 10 · 7pm` (`formatCardWhen`). There's no end time, because `page_posts` has none.
- **Posted:** an undated one says `Posted Sep 2` (`formatPostedDate`) from `browse_feed.posted_at`, the post's `created_at`, instead of a bare "Posted".
- **Where:** with no address of its own, its card label is its Page's location, as criterion 3 says. The map pin stays its own point. Post rows reach signed-in callers only (#252), so this never reaches a signed-out one.

Tests: `tests/announcement-card-db.test.ts`, 4 against Postgres 17.6.1.166 built from every migration, all seen failing before this migration. The formatter and card unit tests were seen failing first.

**Migration: `20260930220000_announcement_card_place_and_posted.sql`** (drops and recreates `browse_feed` with one more column). Apply after #255 merges.

**Forward fix: `20260930230000_front_door_no_pins.sql`.** Production ran `20260930220000` with the earlier signed-out pin, a minute before the no-pin change reached this branch. That file is restored to exactly what was applied, and this migration replaces the function with no signed-out pin. Seen failing (a pin returned) before it, passing after.
