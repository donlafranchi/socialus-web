#!/usr/bin/env bash
# Refuses to apply migrations ahead of their code (#264).
#
# On 2026-09-30 three stacked migration PRs (#254, #255, #258) were applied to
# production before any of their code merged. The live code read what the new
# migrations withheld, and every signed-out Page 404'd until it merged. Two
# refusals, both before anything is applied:
#
#   1. The branch's open pull request must target main. A PR stacked on
#      another branch means the PR below it has not merged, so its code is not
#      live. A branch with no open PR is refused too: there is nothing to say
#      what it is. Main itself needs no PR.
#   2. At most one migration pending, unless allow_multiple is set. One PR, one
#      migration, applied alone and verified before the next.
#
# Env: BRANCH (required); PENDING, newline-separated versions this ref would
# apply (or PENDING_FILE naming a file of them); PR_BASES, newline-separated
# base branches of the open PRs whose head is BRANCH (looked up with gh when
# unset); ALLOW_MULTIPLE ('true' to override 2 only).
#
# Exit 0 = allowed, 4 = stacked or no PR, 5 = more than one pending, 2 = could
# not tell.
set -uo pipefail

: "${BRANCH:?BRANCH is required}"

if [ -z "${PENDING+x}" ] && [ -n "${PENDING_FILE:-}" ]; then
  PENDING="$(cat "$PENDING_FILE" 2>/dev/null || true)"
fi
pending="$(printf '%s\n' "${PENDING:-}" | grep -E '^[0-9]+$' || true)"
count="$(printf '%s' "$pending" | grep -c . || true)"

if [ "$BRANCH" != "main" ]; then
  if [ -z "${PR_BASES+x}" ]; then
    if ! PR_BASES="$(gh pr list --head "$BRANCH" --state open --json baseRefName -q '.[].baseRefName' 2>&1)"; then
      echo "::error::Could not look up the pull request for $BRANCH. Not proceeding: refusing to guess."
      echo "  gh said: $PR_BASES"
      exit 2
    fi
  fi
  bases="$(printf '%s\n' "$PR_BASES" | grep . || true)"
  if [ -z "$bases" ]; then
    echo "::error::$BRANCH has no open pull request. Apply from main, or from the branch of an open PR that targets main."
    exit 4
  fi
  stacked="$(printf '%s\n' "$bases" | grep -vx main || true)"
  if [ -n "$stacked" ]; then
    echo "::error::$BRANCH is stacked: its pull request targets $(echo "$stacked" | paste -sd, -), not main."
    echo "The pull request below it has not merged, so its code is not live, and these migrations would run ahead of it."
    echo "Merge the PR below first, retarget this one to main, then apply."
    exit 4
  fi
fi

if [ "$count" -gt 1 ] && [ "${ALLOW_MULTIPLE:-false}" != "true" ]; then
  echo "::error::$count migrations are pending on $BRANCH. One at a time: apply, verify in production, merge, then the next."
  printf '%s\n' "$pending" | sed 's/^/  /'
  echo "If they really must go together, re-run with allow_multiple checked."
  exit 5
fi

echo "Guard passed: $BRANCH, $count pending."
exit 0
