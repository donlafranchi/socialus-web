# chore #386 — skip previews for docs- and test-only pushes

Don chose A (2026-10-05): Vercel Hobby's 100 deployments a day ran out. `vercel.json` sets `ignoreCommand` to `scripts/vercel-ignore.sh`, which skips a preview when a push changes only docs/, build-log/, .github/, tests/, evals/, *.md or *.test.ts(x). Production always builds; anything it cannot decide builds. Tested against a throwaway repo per case (`tests/vercel-ignore.test.ts`).
