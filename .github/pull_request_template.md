<!--
  Keep exactly ONE of the two blocks below. Delete the other. It goes first,
  before anything else — Don reads the top of the PR and nothing more.

  Which one? (Don's decision rule, 2026-10-04.) He looks at:
    · Path: new territory — no well-worn path, conflicting precedents, or it
      touches a ruling, legal or privacy exposure, money, or member trust
      (it reached him as A/B/C before building)
    · new or changed user-facing copy, for tone
    · a deviation, or an acceptance criterion with a judgment word
  Path: well-worn work that passed the reviewer's first pass: he doesn't look.

  He does not look at: invisible migrations, tests, refactors, docs,
  infrastructure, dependency bumps.

  The block you keep also decides the merge. "Don doesn't need to look"
  means merge it yourself once the checks are green — don't park finished
  work waiting on a review he cannot give. "Review" means hold:
  he previews it and merges himself, or tells you to merge. "Review" means
  the `human-review` label (it was `needs-don`).

  Full rule: ops-pattern/process/PIPELINE.md § Who checks what.
-->

## Don doesn't need to look.

<!-- One line saying why not. e.g. "Test-only — no behaviour changes." -->

<!-- ─────────────── OR ─────────────── delete the block above and use this one,
     and add the `human-review` label.

## Review

**Preview:** <paste the Vercel preview link from the comment below>
**Branch:** `<branch>`

- Item: short description of one thing Don checks
- Item: …

```
gh workflow run apply.yml --ref <branch> -f confirm=apply
```
<!-- Keep the code block only when a migration applies before this merges. -->

1.
2.
3.

**What you should see:**

     Three steps, written for someone holding a phone who has not read the
     ticket. "Open the link, tap Create, choose Business" — not "navigate to
     the composer route." No file paths, no function names, no ticket
     numbers, no jargon.

     Can't describe it that way? Say so here and keep the label. That's a
     signal it needs his eyes more, not less.
──────────────────────────────────────────────────────────────────────────── -->

Path: well-worn | new territory
<!-- Keep one. List 2–3 precedents with links: what established platforms do for this exact case. issue-lint fails a PR without this line. -->

---

## What this changes

<!-- For whoever reviews the code. Don is not the audience for this part. -->

## Migration

<!-- "None", or the migration file and the command Don runs to apply it
     BEFORE this merges (one ready at a time):
     gh workflow run apply.yml --ref <this-branch> -f confirm=apply -->

## How it was verified

<!-- One of: live DB · local Postgres · unit tests only · not verified.
     Unverified work opens as a draft with the missing check named. -->

Closes #
