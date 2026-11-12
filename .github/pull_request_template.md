<!-- Don reads the top of the PR and nothing more. Keep ONE of the two openings
     (socialus-ops/process/PIPELINE.md § Who checks what), then the three lines
     below it. The diff is the record of what changed; don't restate it. -->

## Don doesn't need to look.
<!-- One line saying why not, e.g. "Test-only; no behaviour changes." Merge yourself on green. -->

## Review
<!-- Only for: Path: new territory · new or changed member-facing copy · a deviation
     from the scenario · a judgement-word criterion. Add the `human-review` label.
     Written for someone holding a phone who has not read the ticket: no paths,
     no function names, no ticket numbers. -->
**Open on socialus.org after merge:** <page> · 1. … 2. … 3. … · **You should see:** …

Path: well-worn | new territory
<!-- Keep one, with 2–3 precedent links. issue-lint fails a PR without this line. -->

Verified: live DB | local Postgres | unit tests only | not verified
<!-- Unverified work opens as a draft naming the missing check. -->

Reviewed by: <a second session that did not write the code, posting its findings as a GitHub review; required for a UI PR (src/app, src/components) and for anything touching src/actions or supabase/. Rules: REVIEW.md. Otherwise "none: why".>

Closes #
