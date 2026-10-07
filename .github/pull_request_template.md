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
  work waiting on a review he cannot give. "Review" means the `human-review`
  label (it was `needs-don`). While PREVIEWS_MODE is off (until the 10-23
  freeze, Don 2026-10-05) a Review PR also merges on green plus the reviewer's
  first pass, and Don reviews it live on socialus.org. Migrations still go to
  him first, in order.

  Full rule: ops-pattern/process/PIPELINE.md § Who checks what.
-->

## Don doesn't need to look.

<!-- One line saying why not. e.g. "Test-only — no behaviour changes." -->

<!-- ─────────────── OR ─────────────── delete the block above and use this one,
     and add the `human-review` label.

## Review

**Review on socialus.org after merge:** <the page to open, e.g. socialus.org/explore>
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

## Reviewer's first pass

<!-- UI PRs (src/app, src/components): the `review` check fails without this
     section, unless the PR is labelled review-skipped and says why here
     ("Review skipped: <why>"). socialus-ops PIPELINE.md § A reviewer's first pass. -->

Reviewed by: <agent>
Personas and widths: <e.g. owner, signed out · 390, 1280>

- [ ] WCAG 2.1 AA: contrast via tokens, visible focus in a logical order, labels and alt text, 44px tap targets
- [ ] Every state present: empty, loading, error, offline or slow, signed out
- [ ] One primary action per screen
- [ ] Thumb reach on a phone
- [ ] No horizontal scroll at 390
- [ ] Copy follows the voice rules (socialus-plan product/foundation/voice-and-tone.md)
- [ ] Nielsen pass: status visible, undo or a way back, consistent, errors prevented
- [ ] Images optimised (no new raw img warnings, sizes set)
- [ ] Tidy and contained: related information sits in its own card or section with a clear header; one edit or action affordance per card, in the header; consistent spacing; long or rarely used content collapsed; nothing floats loose
- [ ] Tidiness verdict at 390 and 1280: "Is the information on this screen neat, tidy and organized? What is the one thing that looks most cluttered?" (one line; fix rule-level clutter first)

Fixed: <one line each>
Judgement calls for Don: <one line each, or none>

## Journey check

<!-- A builder persona did the real flow end to end (CI browser job, evals/builders).
     List the journeys run and any new friction, or write "n/a: no flow changed".
     socialus-ops PIPELINE-build.md step 9. -->

## Visibility review

<!-- PRs touching src/app, src/actions or supabase/: who sees what, as signed out,
     member, owner, operator and builder. The `review` check fails without
     `Reviewed by:` and a `Verdict:` line (or the review-skipped label and a reason).
     socialus-ops PIPELINE-build.md step 10. -->

Reviewed by: <agent>
Personas checked: <e.g. signedOut, member, ownerBusiness, operator>
Matrix rows touched: <e.g. pages.select as signedOut, or none>
Verdict: <one line: nothing leaks, or what does>

## How it was verified

<!-- One of: live DB · local Postgres · unit tests only · not verified.
     Unverified work opens as a draft with the missing check named. -->

Closes #
