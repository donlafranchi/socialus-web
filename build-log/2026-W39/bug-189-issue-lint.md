# bug #189 — issue-lint could not read its own template, or write its own label

**Kind:** bug · **Scenario:** none · **Branch:** `bug-189-issue-lint`

## Two faults, one dead control

**It could not parse the template it enforces.** The check was
`/Kind:\s*(scenario|change|bug|chore)/i`. `.github/ISSUE_TEMPLATE/work.md`
emits `**Kind:** …`, so what follows `Kind:` is `**` — neither whitespace nor a
keyword, and `\s*` cannot cross it. Every issue opened from this repo's own
template was judged to be missing the two fields it had just filled in.
Verified in node before changing anything.

**It could not apply the label either.** No `permissions:` block, so the token
is read-only for issues and `addLabels` returned
`403 Resource not accessible by integration` — which killed the run before the
comment explaining the real problem. The red tick read as noise.

Together: `needs-fix`, which CLAUDE.md tells every agent to watch for, has
never once been applied. The gate has been decorative since it was written.

## The fix

`Kind:[*_\s]*(…)\b` and `Scenario:[*_\s]*(…)\b` — tolerant of the markdown the
template imposes, still strict about the answer. Plus `permissions: issues:
write, pull-requests: write`.

## The test

`tests/issue-lint-reads-its-template.test.ts` reads **both files off disk** —
the regex literals out of the workflow, the field lines out of the template —
and runs one against the other. A test with the regex copied into it would have
passed while the workflow stayed broken, because the bug was the two files
disagreeing, not either one alone.

It also asserts the untouched placeholder still **fails**: `**Scenario:** F### |
none` has literal hashes and is supposed to be caught, since an unfilled
template is the thing the lint is for. And it asserts the permissions block is
present, because a parse fix alone would have left the control just as dead.

Verified red against the old regex (2 of 6 failing), then green.
