### #220 (F078) — the metro hide bar, and the poster is told

Ruled 2026-10-07, option A: build what does not touch the NCMEC question.

- **Hide bar:** `metro_polygons.hide_bar`, data not code, starting at 0 so every report hides as it does today. There is no classifier yet, so no report carries a score: above 0 a report is below the bar and only queues. Sensitive content and threat of harm hide at any bar (criterion 8). Content whose metro can't be resolved uses 0; overlapping metros use the lower bar.
- **Poster notice:** when a report hides a Page photo, the Page's founder gets an in-app notice (`member_notices`, shown under Notices on /you) with the reporter's chosen reason. Never the reporter's words or identity; never email.
- **Child reports stay operator-only:** a sensitive-content report notifies nobody, until the NCMEC plan in `socialus-legal` is settled.
- **Not here:** the poster's one explanation and fix-and-repost (F102), the classifier (F100).
- Migration `20261007200000_hide_bar_and_member_notices.sql`. Copy is a placeholder in `src/lib/reports/notices.ts`.
