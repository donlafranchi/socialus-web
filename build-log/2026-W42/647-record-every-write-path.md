# #647 — F102 criterion 13: every write path records its origin

A standing guard (`src/lib/reports/f102-criteria.test.tsx`, F102.13) names the only places a member's file reaches storage and a member's post is created, and fails if a caller does not record the address and time. Seen failing twice: dropping the post recorder, and dropping the photo recorder.

Today there is one member upload path (the photo picker) and one member post path; both record. The unclaimed import is staff, not a member.

Left for the PM: the one-year purge workflow waits for the repository variable `CONTENT_ORIGINS_PURGE_ENABLED`, not set. Nothing is old enough to purge yet.
