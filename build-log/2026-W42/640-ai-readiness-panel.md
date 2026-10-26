# F100.11 · #640: the AI readiness panel (the PM's call C)

For beta the live flip stays Don's own checklist with the numbers shown to him (B); before production, software refuses the flip until a passing harness run is recorded and the two-week shadow read is marked (A, not built here).

- `moderation_eval_runs` records each harness run (`npm run moderation:eval -- --record`): recall, severity-1 recall and case count, false-alarm rate, whether it met the targets.
- `readiness()` (pure) puts the last run and the days of shadow reads against the ruled targets: recall at least 95%, severity-1 exactly 100%, false alarms under 10%, 14 days. Green at the target, amber near it, red short. A set with no severity-1 cases is amber with a note, since severity-1 content never reaches the model and a pass there proves nothing (#640 item 2). One "ready to go live" light.
- `/admin/reports` (staff, `reports.review`) shows the panel above the queue; `/admin/metrics` (staff, `metrics.view`) shows the one light. Shadow days = days since the AI first read a report.

Not here: the software refusal (A); a bigger labelled set with severity-1 cases (#10); the socialus-plan status dashboard reading this (cross-repo).
