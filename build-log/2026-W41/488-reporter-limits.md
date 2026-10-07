### F102 (#488) slice 1 — the reporter's record, coordinated flag, 911 line

- **Cap and cool-down (criteria 6–7) and F078's three strikes (criterion 10):** from the reporter's dismissed reports (the operator approved the content): one dismissed in 30 days drops their open hiding reports from 5 to 1; two in 30 days start a 14-day cool-down; three ever means nothing they file hides. The report is always stored and queued. Counters only; no score on the person.
- **Open question for Don (marker in `report.create`):** F102 says a cool-down hides nothing; F078 criterion 8 says sensitive content and threat of harm hide whatever the bar. Built to the cautious reading: those two still hide and still text the operator.
- **Counters (criterion 5):** filed, upheld, dismissed, open on each report in the operator's detail. Operator-only; nothing else reads them.
- **Coordinated reporting (criterion 8):** three or more reports on one poster's content in 24 hours, two from accounts under 7 days old, flags the row "Possible coordinated reporting" and ranks it first within its severity. A flag only.
- **911 (criterion 10):** picking Threat of harm shows a kind line to call 911 first if someone is in danger now. Placeholder copy.
- No migration.

### F102 (#488) slice 2 — the poster answers first

- **A hide leaves one notice; the poster gives one answer** (`report_answers`, unique per notice):
  - **Fix it** (posts only): the poster edits the post and it shows again at once, once. Its reports stay on the row. Never after a person removed it, and a second hide offers no second repost (`page_posts.repost_used`). The edit records the answer as "fix and repost".
  - **Say it's a mistake:** Mistaken, Malicious or Misusing reports, plus a note of at most 280 characters. The content stays hidden until a person decides. The operator's row shows what the poster said.
- **No answer is no work:** an unanswered hide closes itself after 14 days; the notice says so and takes no answer. (Nothing is scheduled: closed is read from the notice's age.)
- A Page photo has only the mistake answer: a replaced photo does not yet clear its hide (existing behaviour, not changed here).
- Migration `20261007230000_report_answers.sql`. The AI reading the poster's rebuttal (F100 criterion 1) waits on #495.
