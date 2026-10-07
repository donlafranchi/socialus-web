# chore: required checks report on docs-only PRs

ci.yml skips docs-only PRs (paths-ignore), so the four required checks never reported and #485 stayed BLOCKED with everything green. Added `ci-docs-only.yml`, a twin on the inverse paths whose jobs carry the required names and succeed at once. Nothing but workflow config changes.
