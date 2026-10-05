# chore #394 — previews only for main and labelled PRs

Don ruled C (2026-10-05). `scripts/vercel-ignore.mjs` (replacing #386's shell script) builds production always, skips docs- and test-only pushes, and otherwise builds a preview only when the branch's open PR is labelled human-review or needs-don, asked of GitHub with `GITHUB_READ_TOKEN` from Vercel's environment. With no token it keeps #386's rule; if GitHub can't be asked it builds. `.github/workflows/preview-on-label.yml` pushes an empty commit when a PR is labelled, so labelling later builds a preview.
