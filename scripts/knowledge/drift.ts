// F130 (#1232): the weekly drift check: concepts whose built and ruled states
// disagree, and socialus-plan docs that still call a concept cut after it came
// back (by any name it ever had, refused names included).
//
// Reads only: it mints a key for the run as the import does, reads through the
// store's own functions (knowledge.concept_drift, knowledge.concepts_returned),
// and rolls its transaction back, so the key leaves nothing behind. When it
// finds something it opens one Issue, unless one from an earlier week is still
// open, in which case it leaves that one be and lists the findings in the run.
//
// Run: tsx scripts/knowledge/drift.ts --plan <socialus-plan checkout> [--open-issue]
// with DATABASE_URL set.

import { Client, type ClientBase } from 'pg'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep, resolve } from 'node:path'
import { enterStore, leaveStore } from './import'
import { splitLines } from './plan-source'

export interface Drift {
  id: string
  name: string
  status: string
  problem: string
}

export interface Returned {
  id: string
  name: string
  last_cut: string
  back_on: string
  names: string[]
}

export interface StaleDoc {
  concept: string
  name: string
  file: string
  line: number
  text: string
}

export async function readDrift(db: ClientBase): Promise<{ drift: Drift[]; returned: Returned[] }> {
  const { rows: drift } = await db.query<Drift>('select id, name, status, problem from knowledge.concept_drift()')
  const { rows: returned } = await db.query<Returned>(
    `select id, name, to_char(last_cut, 'YYYY-MM-DD') as last_cut, to_char(back_on, 'YYYY-MM-DD') as back_on, names
       from knowledge.concepts_returned()`,
  )
  return { drift, returned }
}

/** Dated briefs and archives record what was true then; they are history, not docs that should have moved on. */
const HISTORY = /(^|\/)(archive|archived|briefs)(\/|$)/

function markdownFiles(root: string): string[] {
  const walk = (dir: string): string[] =>
    existsSync(dir)
      ? readdirSync(dir).flatMap((n) => {
          if (n.startsWith('.') || n === 'node_modules') return []
          const p = join(dir, n)
          return statSync(p).isDirectory() ? walk(p) : n.endsWith('.md') ? [p] : []
        })
      : []
  return walk(root)
    .map((p) => relative(root, p).split(sep).join('/'))
    .filter((p) => !HISTORY.test(p))
    .sort()
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Lines in socialus-plan that name a concept that came back, by any of its names, and still call it cut. */
export function staleDocs(planDir: string, returned: Returned[]): StaleDoc[] {
  const out: StaleDoc[] = []
  const files = markdownFiles(planDir)
  for (const c of returned) {
    const patterns = c.names.map((n) => ({ n, re: new RegExp(`(^|[^A-Za-z0-9])${escapeRe(n)}([^A-Za-z0-9]|$)`, 'i') }))
    for (const file of files) {
      splitLines(readFileSync(join(planDir, file), 'utf8')).forEach((text, i) => {
        if (!/\bcut\b/i.test(text)) return
        const hit = patterns.find((p) => p.re.test(text))
        if (hit) out.push({ concept: c.id, name: hit.n, file, line: i + 1, text: text.trim().slice(0, 200) })
      })
    }
  }
  return out
}

export function report(drift: Drift[], returned: Returned[], stale: StaleDoc[]): string {
  return [
    '## Concept drift',
    '',
    '### Built and ruled disagree',
    ...(drift.length ? drift.map((d) => `- ${d.id} ${d.name} (${d.status}): ${d.problem}`) : ['- none']),
    '',
    '### Docs that still call something cut after it came back',
    ...(stale.length
      ? stale.map((s) => {
          const c = returned.find((r) => r.id === s.concept)!
          return `- socialus-plan ${s.file}:${s.line} calls "${s.name}" cut; ${c.id} (${c.name}) came back on ${c.back_on}: ${s.text}`
        })
      : ['- none']),
  ].join('\n')
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const TITLE = 'chore · concepts whose words or code drifted from their rulings'

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const planDir = resolve(arg('plan') ?? '../socialus-plan')
  const openIssue = process.argv.includes('--open-issue')
  const agent = `drift-${process.env.GITHUB_RUN_ID ?? Date.now()}`

  const db = new Client({ connectionString: url })
  await db.connect()
  let found: { drift: Drift[]; returned: Returned[] }
  try {
    await db.query('begin')
    await enterStore(db, agent)
    found = await readDrift(db)
    await leaveStore(db, agent)
  } finally {
    // Reads only: nothing to keep, the run's key included.
    await db.query('rollback').catch(() => {})
    await db.end()
  }
  const stale = staleDocs(planDir, found.returned)
  const text = report(found.drift, found.returned, stale)
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFileSync } = await import('node:fs')
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  }
  if (!openIssue || (found.drift.length === 0 && stale.length === 0)) return

  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed to open an Issue.')
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
  const list = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&per_page=100`, { headers })
  if (!list.ok) throw new Error(`Listing Issues failed: ${list.status}`)
  const open = ((await list.json()) as { title: string; html_url: string }[]).find((i) => i.title === TITLE)
  if (open) {
    console.log(`Still open from an earlier week: ${open.html_url}`)
    return
  }
  const body = [
    '**Kind:** chore',
    '**Scenario:** F130',
    '',
    text,
    '',
    'Opened by the weekly concept drift check (knowledge-drift workflow). A concept in drift needs its status ruled again or its code changed; a doc listed here needs its words brought up to date in socialus-plan.',
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
