# chore — agents merge by default; Don holds only what he must judge

**Kind:** chore. **Scenario:** none.
**Prompted by:** #116, where finished, green, docs-and-lib work sat waiting on a
review Don had no way to give.

## What was wrong

`CLAUDE.md` § Commits said:

> Branch per ticket. Ask before merge to main — a merge to main deploys to
> production via Vercel.

Read literally, every PR waits for Don. He is not proficient in code, so for
most PRs the wait buys nothing and costs the thing it is spending: his
attention. It also contradicted this repo's own § Who checks what, which already
says he does not read code and looks at the running app instead — and
`ops-pattern/PIPELINE.md` § When he merges without looking, which already says
"Nothing blocks it, and nothing should."

## The rule, as Don confirmed it

Work lands on a branch; the branch gets a Vercel preview; he previews it there.
If he wants to review it he merges himself in GitHub, or says to merge. If it
needs no review from him, it merges automatically once green. Agents default to
merging and hold only for what he must judge: product wording, a UI he needs to
see, a scope or role-model decision, anything with a real trade-off. When
holding, say so and name what to look at on the preview.

## What changed

- `CLAUDE.md` § Commits — rewritten to the above. The Vercel deploy warning is
  kept: it is still true, and is now stated as a reason to check that CI is
  green before merging rather than a reason to ask.
- `CLAUDE.md` § Who checks what — one line tying the two PR-opening blocks to
  the merge. "Don doesn't need to look" means merge it yourself once green;
  `needs-don` means hold.
- `.github/pull_request_template.md` — the same tie-in, in the guidance comment
  an agent reads while opening the PR.

Nothing else in this repo stated the old rule; `INFRASTRUCTURE.md`, `README.md`,
`BUILD-LOG.md` and `TEST-CHECKLIST.md` are silent on merge permission.

## Still contradictory, in the other repo

`ops-pattern/CLAUDE.md` § Commits says code in `socialus-web` "asks before merge
to main (it deploys)". That is the same stale rule and needs the same edit.
Not touched in this pass — `ops-pattern` is Don's to change, and cross-committing
is forbidden. `PIPELINE.md` § Who checks what and `DECISIONS.md` (2026-09-12)
already match the confirmed rule and need nothing.

## Verification

Docs only. No code, no tests, no behaviour. Lint and the unit suite are
unaffected by markdown.
