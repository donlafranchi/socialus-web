# chore: only main creates a Vercel deployment

The ignore step (`scripts/vercel-ignore.mjs`) runs after Vercel has already created the deployment, and a deployment cancelled by it still counts toward the 100/day cap. About 100 in a day, three quarters from feature-branch pushes, hit the cap and rejected real production deploys.

`vercel.json` now sets `git.deploymentEnabled` to `main: true, "*": false`: non-main pushes create no deployment at all. The ignore step stays as the fallback.

When previews return (`PREVIEWS_MODE=labelled`, 10-23 freeze), drop the `"*": false` line.
Preview failures that say "Deployment rate limited" are the cap, not the change.
