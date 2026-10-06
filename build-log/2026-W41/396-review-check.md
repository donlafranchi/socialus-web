# chore #396 — a UI PR fails without a first pass or review-skipped

The PM, 2026-10-05: reviews check the important UX, and can't be skipped silently (#380 merged without a first pass while Docker was down). `scripts/check-review.cjs` (with fixtures it proves itself on) and `.github/workflows/review-check.yml` fail a PR that changes `src/app` or `src/components` unless its body has `Reviewed by:` with the eight-line UX checklist ticked (or n/a), or it is labelled `review-skipped` and says why. The PR template carries the checklist; CLAUDE.md says so.
