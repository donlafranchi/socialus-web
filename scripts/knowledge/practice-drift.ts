// F128 (#1237): the weekly drift step for how we work: any live practice
// whose enforcing check or workflow no longer exists in its repo (F128.3).
//
// Reads only: it mints a key for the run as the import does, reads the live
// practices' `enforced_by` ("repo:path (what)" entries), rolls its
// transaction back, and looks for each path in the checkouts it was given.
// A path in a repo it was not given (socialus-legal, say) is listed as not
// checked, never as drift. When it finds drift it opens one Issue, unless one
// from an earlier week is still open.
//
// Run: tsx scripts/knowledge/practice-drift.ts --web . --plan <dir> --ops <dir> [--open-issue]
// with DATABASE_URL set.

import { Client, type ClientBase } from 'pg'
import { existsSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { enterStore, leaveStore } from './import'
import { enforcers } from './practices'

export interface Enforced {
  id: string
  answer: string
  enforced_by: string | null
}

export interface PracticeDrift {
  id: string
  answer: string
  repo: string
  path: string
}

export async function readEnforced(db: ClientBase): Promise<Enforced[]> {
  const { rows } = await db.query<Enforced>(
    `select id, answer, enforced_by from knowledge.records where kind = 'practice' and status = 'live' order by id`,
  )
  return rows
}

/** Practices whose enforcing paths are gone, and those naming a repo with no checkout here. */
export function findDrift(
  practices: Enforced[],
  repos: Record<string, string>,
): { drift: PracticeDrift[]; unchecked: PracticeDrift[]; unenforced: string[] } {
  const drift: PracticeDrift[] = []
  const unchecked: PracticeDrift[] = []
  const unenforced: string[] = []
  for (const p of practices) {
    const list = enforcers(p.enforced_by)
    if (!list.length) unenforced.push(p.id)
    for (const e of list) {
      const dir = repos[e.repo]
      const path = e.path.replace(/[#:].*$/, '')
      if (!dir) unchecked.push({ id: p.id, answer: p.answer, repo: e.repo, path })
      else if (!existsSync(join(dir, path))) drift.push({ id: p.id, answer: p.answer, repo: e.repo, path })
    }
  }
  return { drift, unchecked, unenforced }
}

export function driftReport(r: ReturnType<typeof findDrift>): string {
  return [
    '## Practice drift',
    '',
    '### Enforcing checks that no longer exist',
    ...(r.drift.length ? r.drift.map((d) => `- ${d.id}: ${d.repo} ${d.path} is gone. ${d.answer}`) : ['- none']),
    '',
    '### Not checked here (no checkout of that repo)',
    ...(r.unchecked.length ? r.unchecked.map((d) => `- ${d.id}: ${d.repo} ${d.path}`) : ['- none']),
    '',
    `Live practices with no enforcing check named: ${r.unenforced.length}`,
  ].join('\n')
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const TITLE = 'chore · practices whose enforcing check is gone'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const repos = {
    'socialus-web': resolve(arg('web') ?? '.'),
    'socialus-plan': resolve(arg('plan') ?? '../socialus-plan'),
    'socialus-ops': resolve(arg('ops') ?? '../socialus-ops'),
  }
  const agent = `practice-drift-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  const db = new Client({ connectionString: url })
  await db.connect()
  let practices: Enforced[]
  try {
    await db.query('begin')
    await enterStore(db, agent)
    practices = await readEnforced(db)
    await leaveStore(db, agent)
  } finally {
    await db.query('rollback').catch(() => {})
    await db.end()
  }
  const found = findDrift(practices, repos)
  const text = driftReport(found)
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  if (!process.argv.includes('--open-issue') || found.drift.length === 0) return

  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed to open an Issue.')
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
  const list = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&labels=area:ops&per_page=100`, { headers })
  if (!list.ok) throw new Error(`Listing Issues failed: ${list.status}`)
  const open = ((await list.json()) as { title: string; html_url: string }[]).find((i) => i.title === TITLE)
  if (open) {
    console.log(`Still open from an earlier week: ${open.html_url}`)
    return
  }
  const body = [
    '**Kind:** chore',
    '**Scenario:** F128',
    '',
    text,
    '',
    'Opened by the weekly practice drift check (knowledge-drift workflow). Each practice listed names a check or workflow that is gone: put the check back, point the practice at the one that replaced it, or retire the practice.',
  ].join('\n')
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: TITLE, body, labels: ['area:ops'] }),
  })
  if (!res.ok) throw new Error(`Opening the Issue failed: ${res.status} ${await res.text()}`)
  console.log(`Opened ${((await res.json()) as { html_url: string }).html_url}`)
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
