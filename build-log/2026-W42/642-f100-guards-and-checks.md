# F100 · #642 #643: standing guards and whole-criterion checks (tests only)

- `src/lib/moderation/guards.test.ts` (#643): criterion 4 (`AssessInput` has no member field; a member seeded with a name, handle and email never reaches the request body), 6 (in shadow an assessment leaves the queue's order and severities alone; nothing in `src/lib/moderation` imports the hide, notify or text actions; the restore step is imported by two files only), 12 (`api.anthropic.com` is named by three files; `assessContent` has three callers).
- `src/lib/moderation/criteria.test.ts` and `tests/report-assessments-db.test.ts` (#642): one check each claiming the whole of criteria 1, 2, 5 and 8, marked `[guards F100.N]`.

Each was seen failing against a mutant: report door removed from `create.ts` (1), wrong first model, severity range widened, reason not cut (2), an extra policy on `report_assessments` (5), the mode read as live for anything but shadow, live ignored (8), the AI raising severity in shadow, a member field on `AssessInput`, a second Anthropic address (4, 6, 12).

The key check (#756) is the one other file that reaches Anthropic; the guard names it and asserts it only asks for the models list.
