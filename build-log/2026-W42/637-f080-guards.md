# #637 — F080 criteria 2 and 3: standing guards

`src/actions/group/f080-guards.test.ts`. Seen failing: a text filter on a topic word in a write path (2); the per-photo confirm removed, an env flag read in the picker, a handler that stops checking the photo is the member's own, and a second place that uploads (3). The guard lists the paths it scans, so a new image path fails it until it is added on purpose.

Also re-marked the existing per-photo confirm test as F080.1 (partial: the rule is affirmed, not detected).
