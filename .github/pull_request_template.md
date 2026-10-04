<!--
  Keep exactly ONE of the two blocks below. Delete the other. It goes first,
  before anything else — Don reads the top of the PR and nothing more.

  Which one? He looks when the change:
    · alters anything a person sees or does — screen, control, copy, image, empty state
    · adds a capability for the first time, rather than extending one that exists
    · touches privacy, money, or public visibility
    · has an acceptance criterion with a judgment word — clear, easy, minimal fumbling
    · came back with a deviation, or a judgment call you had to make for him

  He does not look at: invisible migrations, tests, refactors, docs,
  infrastructure, dependency bumps.

  The block you keep also decides the merge. "Don doesn't need to look"
  means merge it yourself once the checks are green — don't park finished
  work waiting on a review he cannot give. "Don, please look" means hold:
  he previews it and merges himself, or tells you to merge.

  Full rule: ops-pattern/PIPELINE.md § Who checks what.
-->

## Don doesn't need to look.

<!-- One line saying why not. e.g. "Test-only — no behaviour changes." -->

<!-- ─────────────── OR ─────────────── delete the block above and use this one,
     and add the `needs-don` label.

## Don, please look

**Preview:** <paste the Vercel preview link from the comment below>

1.
2.
3.

**What you should see:**

**What I'm unsure about:** <the judgment call, or delete this line>

     Three steps, written for someone holding a phone who has not read the
     ticket. "Open the link, tap Create, choose Business" — not "navigate to
     the composer route." No file paths, no function names, no ticket
     numbers, no jargon.

     Can't describe it that way? Say so here and keep the label. That's a
     signal it needs his eyes more, not less.
──────────────────────────────────────────────────────────────────────────── -->

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
