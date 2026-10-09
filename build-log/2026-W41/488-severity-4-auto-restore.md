# F102/#488: severity-4 auto-restore, off until the harness clears it

Criterion 12 (ruled B). After a poster's answer is read, `runAssessment` hands the reads to `autoRestoreAfterAssessment` (`src/actions/report/ai-restore.ts`), which evaluates `restoreVerdict` (`src/lib/moderation/restore-gate.ts`): poster answered, Haiku and Sonnet both approve at >= 0.95, severity 4 everywhere, no coordinated flag, `ai_mode = 'live'`, and `moderation_settings.severity4_restore_cleared`. Sonnet is forced on every candidate (`secondOpinionIf`).

Ships off. Shadow, or live before clearance, changes nothing and logs `would_restore` in `report_ai_restore_checks`. Nothing in code sets `severity4_restore_cleared`; an operator runs `update public.moderation_settings set severity4_restore_cleared = true;` after reading the harness run.

The restore is a `report_decisions` row with `decided_by_ai` (member null, enforced by a check); the review page shows it as Restored by AI with Confirm (a person's restore) and Undo (`report.reverse`). No `group_events` row: that table's actor is a member.

Local DB test run against Docker Desktop Postgres with the migration applied locally only.
