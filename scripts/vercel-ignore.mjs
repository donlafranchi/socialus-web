// #394 — Vercel's Ignored Build Step. Exit 0 skips the build, exit 1 builds.
// Production (main) always builds. Everything else follows PREVIEWS_MODE in
// Vercel's environment:
//   off (the default) — no previews at all. Don, 2026-10-05: until the 10-23
//     feature freeze socialus.org is the review surface; nobody uses it yet.
//   labelled — previews only for a branch whose open PR is labelled
//     human-review (or needs-don), Don's earlier C; labelling later re-triggers a
//     build (.github/workflows/preview-on-label.yml). Reads labels with
//     GITHUB_READ_TOKEN (Pull requests: read); without it, #386's rule (skip
//     docs- and test-only pushes); if GitHub can't be asked, it builds.

import { execFileSync } from 'node:child_process'

export const REVIEW_LABELS = ['human-review', 'needs-don']
const QUIET = [/^docs\//, /^build-log\//, /^\.github\//, /^tests\//, /^evals\//, /\.md$/, /\.test\.tsx?$/]

/** Pure: 'build' or 'skip', and why. `labels` is null when GitHub wasn't asked or couldn't answer. */
export function decide({ env, changed, labels, asked }) {
  if (env.VERCEL_ENV === 'production') return ['build', 'production always builds']
  if ((env.PREVIEWS_MODE ?? 'off') !== 'labelled') return ['skip', 'PREVIEWS_MODE is off: no previews until it is set to labelled']
  if (changed && changed.length > 0 && changed.every((f) => QUIET.some((r) => r.test(f))))
    return ['skip', 'only docs, tests, build-log, .github or markdown changed']
  if (!asked) return ['build', 'no GITHUB_READ_TOKEN, so no label check (#386 rule only)']
  if (labels === null) return ['build', 'GitHub could not be asked; building rather than losing a preview']
  if (labels.some((l) => REVIEW_LABELS.includes(l))) return ['build', 'the open PR is labelled for review']
  return ['skip', 'no open PR labelled human-review or needs-don']
}

function changedFiles() {
  const base = process.env.VERCEL_GIT_PREVIOUS_SHA || 'HEAD^'
  try {
    return execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { encoding: 'utf8' }).split('\n').filter(Boolean)
  } catch {
    return null
  }
}

async function prLabels() {
  const { GITHUB_READ_TOKEN: token, VERCEL_GIT_REPO_OWNER: owner, VERCEL_GIT_REPO_SLUG: repo, VERCEL_GIT_COMMIT_REF: ref } = process.env
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(ref)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) return null
    const prs = await res.json()
    return prs.flatMap((p) => p.labels.map((l) => l.name))
  } catch {
    return null
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const asked = Boolean(process.env.GITHUB_READ_TOKEN)
  const env = process.env
  const changed = changedFiles()
  const labels = asked && env.VERCEL_ENV !== 'production' && env.PREVIEWS_MODE === 'labelled' ? await prLabels() : null
  const [verdict, why] = decide({ env, changed, labels, asked })
  console.log(`vercel-ignore: ${verdict} (${why})`)
  process.exit(verdict === 'skip' ? 0 : 1)
}
