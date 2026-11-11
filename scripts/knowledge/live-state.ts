// F131 (#1249): GitHub's live state into the store, then the three answers as
// the phone page.
//
// Run by .github/workflows/knowledge-answers.yml: nightly after the live smoke
// and tap speed, on every push to main, and by hand. Reads GitHub with the
// workflow's token, writes one snapshot through knowledge.set_live_state (an
// operator's write), then renders `built`, `where` and `next` with the same
// functions the lookup tool calls (src/lib/knowledge/answers.ts) and writes
// them to --out, socialus-plan's ANSWERS.md.
//
// What counts as what is decided here, from what the alarms already file:
//   · broken: an open bug from main-build-alarm ("main fails to build on
//     Vercel") or the live smoke ("the overnight smoke found a problem"), the
//     latest Production deployment failing, or checks failing on main's head.
//   · slow: an open bug from tap-speed ("taps are slower than budget").
//   · blocker: an open Issue labelled launch-blocking, unless it is an alarm
//     above (they carry the label too, and are already broken or slow).
//   · waiting: an open Issue labelled needs-pm, or an open PR labelled
//     human-review or needs-don (socialus-plan scripts/waiting.py's rule, for
//     this repo).
//   · in_flight: every other open PR that is not a draft.
//   · bug: every other open Issue labelled bug.
//
// Usage: npx tsx scripts/knowledge/live-state.ts [--commit] [--out path]
// Without --commit the snapshot is rolled back (a dry run).

import { Client } from 'pg'
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { enterStore, leaveStore } from './import'
import { builtText, whereText, nextText, renderPage, pageBody } from '../../src/lib/knowledge/answers'

export interface GhIssue {
  number: number
  title: string
  html_url: string
  created_at: string
  labels: { name: string }[]
  pull_request?: unknown
}

export interface GhPull {
  number: number
  title: string
  html_url: string
  created_at: string
  draft: boolean
  labels: { name: string }[]
}

export interface GhSnapshot {
  issues: GhIssue[]
  pulls: GhPull[]
  /** The latest Production deployment's latest status, if any. */
  deploy: { state: string; url: string | null; at: string } | null
  /** Check runs on main's head that failed. */
  failingChecks: { name: string; url: string }[]
}

export interface LiveRowIn {
  kind: 'broken' | 'slow' | 'bug' | 'blocker' | 'waiting' | 'in_flight'
  key: string
  words: string
  url: string | null
  source: 'github' | 'vercel'
  since: string | null
}

export const MAIN_BUILD = /main fails to build on Vercel/i
export const LIVE_SMOKE = /the overnight smoke found a problem/i
export const TAP_SPEED = /taps are slower than budget/i
const WAITING_PR_LABELS = ['human-review', 'needs-don']
const FAILED = new Set(['failure', 'error'])

const has = (x: { labels: { name: string }[] }, l: string) => x.labels.some((y) => y.name === l)

/** What GitHub says, as live-state rows. Pure, so it is tested without GitHub. */
export function classify(s: GhSnapshot): LiveRowIn[] {
  const rows: LiveRowIn[] = []
  const issues = s.issues.filter((i) => !i.pull_request)
  let buildAlarm = false
  for (const i of issues) {
    const row = { key: `issue:${i.number}`, words: i.title, url: i.html_url, since: i.created_at }
    let alarm = false
    if (has(i, 'bug') && MAIN_BUILD.test(i.title)) {
      buildAlarm = alarm = true
      rows.push({ kind: 'broken', ...row, source: 'vercel' })
    } else if (has(i, 'bug') && LIVE_SMOKE.test(i.title)) {
      alarm = true
      rows.push({ kind: 'broken', ...row, source: 'github' })
    } else if (has(i, 'bug') && TAP_SPEED.test(i.title)) {
      alarm = true
      rows.push({ kind: 'slow', ...row, source: 'github' })
    } else if (has(i, 'bug')) {
      rows.push({ kind: 'bug', ...row, source: 'github' })
    }
    // The alarms file themselves launch-blocking too; one already said as
    // broken or slow is not said again as a blocker.
    if (has(i, 'launch-blocking') && !alarm) rows.push({ kind: 'blocker', ...row, source: 'github' })
    if (has(i, 'needs-pm')) rows.push({ kind: 'waiting', ...row, source: 'github' })
  }
  // A failed deploy the build alarm has already filed is one thing, not two.
  if (s.deploy && FAILED.has(s.deploy.state) && !buildAlarm) {
    rows.push({ kind: 'broken', key: 'deploy:production', words: 'the latest deploy to socialus.org failed', url: s.deploy.url, source: 'vercel', since: s.deploy.at })
  }
  if (s.failingChecks.length) {
    const names = [...new Set(s.failingChecks.map((c) => c.name))]
    rows.push({
      kind: 'broken',
      key: 'checks:main',
      words: `checks failing on main: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` and ${names.length - 3} more` : ''}`,
      url: s.failingChecks[0].url,
      source: 'github',
      since: null,
    })
  }
  for (const p of s.pulls) {
    const row = { key: `pr:${p.number}`, words: p.title, url: p.html_url, since: p.created_at, source: 'github' as const }
    if (WAITING_PR_LABELS.some((l) => has(p, l))) rows.push({ kind: 'waiting', ...row })
    else if (!p.draft) rows.push({ kind: 'in_flight', ...row })
  }
  return rows
}

// ---------------------------------------------------------------------------
// GitHub.

async function getAll<T>(url: string, h: Record<string, string>): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`, { headers: h })
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${url}`)
    const rows = (await res.json()) as T[]
    out.push(...rows)
    if (rows.length < 100) break
  }
  return out
}

async function getOne<T>(url: string, h: Record<string, string>): Promise<T> {
  const res = await fetch(url, { headers: h })
  if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${url}`)
  return (await res.json()) as T
}

export async function readGitHub(repo: string, token: string): Promise<GhSnapshot> {
  const h = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
  const api = `https://api.github.com/repos/${repo}`
  const [issues, pulls] = await Promise.all([
    getAll<GhIssue>(`${api}/issues?state=open`, h),
    getAll<GhPull>(`${api}/pulls?state=open`, h),
  ])

  let deploy: GhSnapshot['deploy'] = null
  const deployments = await getOne<{ id: number }[]>(`${api}/deployments?environment=Production&per_page=1`, h)
  if (deployments[0]) {
    const statuses = await getOne<{ state: string; target_url: string | null; created_at: string }[]>(
      `${api}/deployments/${deployments[0].id}/statuses?per_page=1`, h,
    )
    if (statuses[0]) deploy = { state: statuses[0].state, url: statuses[0].target_url, at: statuses[0].created_at }
  }

  const checks = await getOne<{ check_runs: { name: string; conclusion: string | null; html_url: string }[] }>(
    `${api}/commits/main/check-runs?per_page=100`, h,
  )
  const failingChecks = checks.check_runs
    .filter((c) => c.conclusion === 'failure' || c.conclusion === 'timed_out')
    .map((c) => ({ name: c.name, url: c.html_url }))
  return { issues, pulls, deploy, failingChecks }
}

// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed to read GitHub.')
  const commit = process.argv.includes('--commit')
  const out = arg('--out')

  const rows = classify(await readGitHub(repo, token))
  const db = new Client({ connectionString: url })
  await db.connect()
  const agent = `answers-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  const now = new Date()
  try {
    await db.query('begin')
    await enterStore(db, agent)
    const { rows: r } = await db.query<{ r: { counts: Record<string, number> } }>(
      'select knowledge.set_live_state($1::jsonb, $2::timestamptz) as r', [JSON.stringify(rows), now.toISOString()],
    )
    const answers = { built: await builtText(db), where: await whereText(db), next: await nextText(db) }
    await leaveStore(db, agent)
    await db.query(commit ? 'commit' : 'rollback')

    const page = renderPage(answers, now)
    let changed = true
    if (out) {
      const before = existsSync(out) ? readFileSync(out, 'utf8') : ''
      writeFileSync(out, page)
      changed = pageBody(before) !== pageBody(page)
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `page_changed=${changed}\n`)
    }
    const report = [
      `## Three answers${commit ? '' : ' (dry run, rolled back)'}`,
      `- Live state: ${Object.entries(r[0].r.counts).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing open'}.`,
      `- Page: ${out ? (changed ? 'changed' : 'unchanged') : 'not written'}.`,
      '',
      page,
    ].join('\n')
    console.log(report)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    await db.end()
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
