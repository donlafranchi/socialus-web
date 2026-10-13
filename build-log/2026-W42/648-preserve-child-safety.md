# #648 part 1 — apparent child-safety content is preserved

A Sensitive content report (the severity 1 tier) now writes a **legal hold** in the same transaction: a snapshot of the words and photo address, the poster, the Page, and the address and time it came from (read from `content_origins`), kept a year. Operator-only (RLS, no policy). Two things stop the evidence being destroyed: `report.purge` refuses a held photo, and the daily `purge_content_origins` skips a held item's address.

Seen failing: the unit tests (red before), the real-database test against an origin purge that ignores holds, and against a table a signed-in member can read. The F102.13 guard now allows the report handler to name `content_origins`.

Left for part 2: a field on the row to record NCMEC's report number (which restarts the one-year clock), and the reminder to register with the CyberTipline at entity setup and public launch. The runbook link is #667 (#782).
