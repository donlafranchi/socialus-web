// F128.7 (#1237), F135: the monthly upkeep Issue. Reads what the store says is
// due (practices not confirmed in 90 days, experiments past their verdict date,
// routines with no run in their interval, ideas open more than 90 days) and
// opens one Issue listing it, unless last month's is still open.
//
// Reads only: a key is minted for the run and the transaction is rolled back.
// Run: tsx scripts/knowledge/upkeep.ts [--open-issue] with DATABASE_URL set.

import { Client } from 'pg'
import { appendFileSync } from 'node:fs'
import { enterStore, leaveStore } from './import'
import { upkeep, type UpkeepRow } from '../../src/lib/knowledge/lookups'

export const UPKEEP_TITLE = 'chore · how we work: practices to confirm and experiments due'

const SECTIONS: { kind: string; heading: string }[] = [
  { kind: 'practice', heading: 'Practices not confirmed in 90 days' },
  { kind: 'experiment', heading: 'Experiments past their verdict date' },
]

export function upkeepText(rows: UpkeepRow[]): string {
  const known = new Set(SECTIONS.map((s) => s.kind))
  const kinds = [...new Set(rows.filter((r) => !known.has(r.kind)).map((r) => r.kind))].sort()
  const sections = [...SECTIONS, ...kinds.map((kind) => ({ kind, heading: `Other: ${kind}` }))]
  return [
    '## How we work: monthly upkeep',
    ...sections.flatMap(({ kind, heading }) => {
      const mine = rows.filter((r) => r.kind === kind)
      return ['', `### ${heading}`, ...(mine.length ? mine.map((r) => `- ${r.answer} (${r.id}), ${r.problem}`) : ['- none'])]
    }),
  ].join('\n')
}

async function openIssue(text: string): Promise<void> {
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed to open an Issue.')
  const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
  const list = await fetch(`https://api.github.com/repos/${repo}/issues?state=open&labels=area:ops&per_page=100`, { headers })
  if (!list.ok) throw new Error(`Listing Issues failed: ${list.status}`)
  const open = ((await list.json()) as { title: string; html_url: string }[]).find((i) => i.title === UPKEEP_TITLE)
  if (open) {
    console.log(`Still open from an earlier month: ${open.html_url}`)
    return
  }
  const body = [
    'Kind: chore',
    'Scenario: none',
    '',
    text,
    '',
    'Opened by the monthly upkeep run (knowledge-upkeep workflow). For each practice: confirm it still holds (the lookup tool, or knowledge.confirm), change it, or retire it. For each experiment: give its verdict, keep, fix or revert.',
  ].join('\n')
  const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ title: UPKEEP_TITLE, body, labels: ['area:ops'] }),
  })
  if (!res.ok) throw new Error(`Opening the Issue failed: ${res.status} ${await res.text()}`)
  console.log(`Opened ${((await res.json()) as { html_url: string }).html_url}`)
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const agent = `upkeep-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  const db = new Client({ connectionString: url })
  await db.connect()
  let due: UpkeepRow[]
  try {
    await db.query('begin')
    await enterStore(db, agent)
    due = await upkeep(db)
    await leaveStore(db, agent)
  } finally {
    await db.query('rollback').catch(() => {})
    await db.end()
  }
  const text = upkeepText(due)
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  if (due.length && process.argv.includes('--open-issue')) await openIssue(text)
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
