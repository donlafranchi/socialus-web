#!/usr/bin/env bash
# #386 — Vercel's Ignored Build Step. Exit 0 skips the build, exit 1 builds.
# Previews are skipped when a push touches only docs, tests, build-log/,
# .github/ or *.md (Don, 2026-10-05: the Hobby plan's 100 deploys a day ran out).
# Production always builds; anything this can't decide builds.

[ "$VERCEL_ENV" = "production" ] && exit 1

base="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
changed="$(git diff --name-only "$base" HEAD 2>/dev/null)" || exit 1
[ -z "$changed" ] && exit 1

while IFS= read -r f; do
  case "$f" in
    docs/* | build-log/* | .github/* | tests/* | evals/* | *.md | *.test.ts | *.test.tsx) ;;
    *) exit 1 ;;
  esac
done <<< "$changed"

echo "Only docs, tests, build-log, .github or markdown changed: skipping this preview."
exit 0
