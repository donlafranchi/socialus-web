### chore #76 — One log file per ticket, so merges stop conflicting

Every PR appended to `build-log/2026-W37.md`, so **merging any PR conflicted every other open PR** — three stalls in one day (#71, #68, #70), always that file, always two appended entries that both belonged. With N open PRs, one merge created N−1 conflicts. `gh pr update-branch` refused outright on a content conflict, so each needed a working tree and a hand resolve.

**There was never a disagreement to resolve.** Git saw two insertions at the same anchor and could not know they were independent. That is the signature of a file that should not be merged textually.

**Option A from the issue, and it was not close.** The week becomes a directory; each ticket writes `build-log/YYYY-WNN/<ticket>-<slug>.md`. **Two branches cannot write the same path**, so the conflict class is gone by construction rather than by policy — no `.gitattributes`, no local git config, and no need for anyone to know this happened.

**Not B (a union merge driver):** it makes the symptom quiet without making the layout right, and its failure mode — silently interleaved entries, or a silent wrong merge if two branches ever edit the same entry — is worse than the loud conflict it replaces. **Not C (generate the log from git history):** the better long-term answer and what `CLAUDE.md`'s no-hand-maintained-indexes rule points at, but it is an argument about whether the log earns its place at all, and that should not be settled inside a plumbing chore.

Sixteen existing entries split out verbatim — checked line by line, 127 non-blank lines in, 127 accounted for, nothing reworded. The weekly file is deleted rather than left as a stub that would invite appending again.

**Three writers updated, because the fix does not hold if any of them still says append:** `BUILD-LOG.md`'s rotation policy, `CLAUDE.md` § Naming, and the `build` skill's workflow — that last one lives in `~/Projects/skills` and is a separate PR (`PIPELINE.md` § Process).

**This lands as the last conflict of its kind.** It touches the file every open PR touches, so it conflicts with each of them exactly once.

Verified: `unit tests only` — content-preservation checked programmatically; no source changed.
