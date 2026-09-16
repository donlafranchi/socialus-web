# chore — the merge rule folds into § Who checks what

**Kind:** chore. **Scenario:** none.
**Follows:** #117, which corrected the rule but left a second copy of it.

## What was wrong

#117 fixed the stale "Ask before merge to main" line by writing the corrected
rule into § Commits. Correct, and a second description of a concept that
§ Who checks what already owns — which is the condition that produced the
original drift. Both `CLAUDE.md` files had their own copy of the merge rule and
both went stale independently while `ops-pattern/PIPELINE.md` stayed right.

## What changed

- § Who checks what absorbs the rule. The paragraph tying the two PR-opening
  blocks to the merge now carries the whole thing: why Don is not the reviewer,
  what "merge it yourself" means, what holding means, and what to hold for.
- § Commits drops to branch/commit hygiene plus the one fact that is local to
  this repo — a merge to main deploys to production via Vercel — and points at
  § Who checks what for the rest.

The pointer is internal, to the section above, not a second signpost at
`ops-pattern/PIPELINE.md`. § Who checks what already ends with that pointer, so
an agent following it lands there in one hop either way, and agents without
`ops-pattern` checked out still have the operative rule in front of them.

## Verification

Docs only. One file. No code, no behaviour, no tests affected.
