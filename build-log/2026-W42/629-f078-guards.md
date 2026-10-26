# #629 — F078 guards: never email the poster, and what adds to the staff queue

`src/lib/reports/f078-guards.test.ts`. Seen failing: a second email sender in `src`, the operator alert pointed at another address list, a second place that inserts reports, and the answer handler also touching the reports table.

Both are marked partial. Criterion 4's "only an answer creates work" is superseded by #626 (a second report queues for staff), so the guard claims the part that still holds: only a report adds to the queue.
