# BUILD-LOG — movers-makers-shakers/web

Development agent's build progress tracker. Use JOURNAL.md for product/strategy notes.

## One file per ticket — never append to a shared file

**Write `build-log/YYYY-WNN/<ticket>-<slug>.md`. Do not edit an existing entry file, and do not create a combined weekly file.**

Naming follows `CLAUDE.md` § Naming: `t158-...`, `bug-67-...`, `chore-71-...`.

**Why, because the alternative looks tidier and is not** *(chore #76, 2026-09-14)*: every PR used to append to one weekly file, so **merging any PR conflicted every other open PR** — three stalls in a single day, always the same file, always two appended entries that both belonged. With N open PRs, one merge created N−1 conflicts, each needing a working tree and a hand resolve.

There was never a disagreement to resolve. Git saw two insertions at the same anchor and could not know they were independent. **One file per ticket removes the conflict by construction** rather than by policy — two branches cannot write the same path — and needs no `.gitattributes`, no local git config, and no knowledge of this note.

- **The week is a directory, not a file.** Its listing is the week.
- **Order is git, not the filename.** `git log --follow build-log/` is the timeline.
- **This index stays under 50 lines.** It points; it doesn't hold detail.

## Current

**Target:** b1 MVP — Producer Marketplace
**Bundle:** [planning/now/bundle-1.md](../planning/now/bundle-1.md)

**This week:** [2026-W37](build-log/2026-W37/) — one file per ticket.

## History

| Week | Notes |
|------|-------|
| 2026-W37 | [Week 37](build-log/2026-W37/) — first week of one-file-per-ticket (chore #76) |
| 2026-W36 | [Week 36](build-log/2026-W36.md) — T112–T119, T132, T138: nav refresh, browse filters, item cards, canonical URLs, founder role by kind, standing badge removed |
| 2026-W32 | [Week 32](build-log/2026-W32.md) — rotation policy introduced, no tickets |
| pre-rotation | [Full archive](build-log/archive-pre-rotation.md) — all entries through 2026-06-18 |
