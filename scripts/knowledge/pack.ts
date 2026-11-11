// F128 (#1237): the pack writer. Writes the pack of how we work, and the
// review-a-method steps beside it, into a socialus-ops checkout, ready to add
// to a Claude Project. Run by .github/workflows/knowledge-pack.yml after every
// Knowledge import and once a month.
//
// Rewritten when a practice, its ring or its strength changes, and once a
// month regardless (F128 ruling, 2026-11-10): it compares the new pack with
// the one in the checkout, date line aside, and writes only when they differ,
// unless --monthly. Fails, writing nothing, when the pack reaches 10,000
// tokens (a real tokenizer counts them).
//
// Monthly, it also lists for the PM what the upkeep must look at: practices
// not confirmed in 90 days, experiments past their verdict date (F128.7),
// in one Issue, unless last month's is still open.
//
// Reads only from the store: a key is minted for the run and the
// transaction rolled back. It writes files; the workflow commits them.
//
// Run: tsx scripts/knowledge/pack.ts --ops <socialus-ops checkout> [--monthly] [--open-issue]
// with DATABASE_URL set.

import { Client } from 'pg'
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getEncoding } from 'js-tiktoken'
import { enterStore, leaveStore } from './import'
import { packRows, upkeep, type UpkeepRow } from '../../src/lib/knowledge/lookups'
import { renderPack, renderSteps, packBody, PACK_TOKEN_LIMIT } from '../../src/lib/knowledge/pack'

/** Where in socialus-ops the pack goes. */
export const PACK_DIR = 'packs'
export const PACK_FILE = 'how-we-work.md'
export const STEPS_FILE = 'review-a-method.md'

let encoder: ReturnType<typeof getEncoding> | null = null
/** A real tokenizer, loaded once. */
export const countTokens = (text: string) => (encoder ??= getEncoding('o200k_base')).encode(text).length

export interface PackPlan {
  write: boolean
  reason: string
  files: { path: string; text: string }[]
  tokens: number
}

/** Decide what to write, given what the store says and what the checkout already holds. */
export function planPack(
  rows: Awaited<ReturnType<typeof packRows>>,
  opsDir: string,
  today: string,
  monthly: boolean,
): PackPlan {
  const pack = renderPack(rows.practices, rows.philosophies, today, countTokens)
  if (pack.tokens >= PACK_TOKEN_LIMIT) {
    throw new Error(`The pack is ${pack.tokens} tokens, at or over ${PACK_TOKEN_LIMIT}: shorten practices before it is written.`)
  }
  const files = [{ path: join(PACK_DIR, PACK_FILE), text: pack.text }]
  if (rows.steps) files.push({ path: join(PACK_DIR, STEPS_FILE), text: renderSteps(rows.steps, today) })
  const before = (p: string) => (existsSync(join(opsDir, p)) ? readFileSync(join(opsDir, p), 'utf8') : null)
  const changed = files.some((f) => {
    const old = before(f.path)
    return old === null || packBody(old) !== packBody(f.text)
  })
  const reason = changed ? 'a practice, its ring or its strength changed' : monthly ? 'the monthly rewrite' : 'nothing changed'
  return { write: changed || monthly, reason, files, tokens: pack.tokens }
}

export function upkeepText(rows: UpkeepRow[]): string {
  return [
    '## How we work: monthly upkeep',
    '',
    '### Practices not confirmed in 90 days',
    ...(rows.filter((r) => r.kind === 'practice').map((r) => `- ${r.answer} (${r.id}), ${r.problem}`) as string[]),
    ...(rows.some((r) => r.kind === 'practice') ? [] : ['- none']),
    '',
    '### Experiments past their verdict date',
    ...rows.filter((r) => r.kind === 'experiment').map((r) => `- ${r.answer} (${r.id}), ${r.problem}`),
    ...(rows.some((r) => r.kind === 'experiment') ? [] : ['- none']),
  ].join('\n')
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const UPKEEP_TITLE = 'chore · how we work: practices to confirm and experiments due'

async function openUpkeepIssue(text: string): Promise<void> {
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
    '**Kind:** chore',
    '**Scenario:** F128',
    '',
    text,
    '',
    'Opened by the monthly pack run (knowledge-pack workflow). For each practice: confirm it still holds (the lookup tool, or knowledge.confirm), change it, or retire it. For each experiment: give its verdict, keep, fix or revert.',
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
  const opsDir = resolve(arg('ops') ?? '../socialus-ops')
  const monthly = process.argv.includes('--monthly')
  const today = new Date().toISOString().slice(0, 10)
  const agent = `pack-${process.env.GITHUB_RUN_ID ?? Date.now()}`

  const db = new Client({ connectionString: url })
  await db.connect()
  let rows: Awaited<ReturnType<typeof packRows>>
  let due: UpkeepRow[] = []
  try {
    await db.query('begin')
    await enterStore(db, agent)
    rows = await packRows(db)
    if (monthly) due = await upkeep(db)
    await leaveStore(db, agent)
  } finally {
    // Reads only: nothing to keep, the run's key included.
    await db.query('rollback').catch(() => {})
    await db.end()
  }

  const plan = planPack(rows, opsDir, today, monthly)
  const lines = [
    `## How-we-work pack`,
    '',
    `- ${rows.practices.length} live practices, ${plan.tokens.toLocaleString('en-US')} tokens (limit ${PACK_TOKEN_LIMIT.toLocaleString('en-US')})`,
    `- ${plan.write ? `Written: ${plan.reason}` : 'Not written: nothing changed since the last pack'}`,
    ...(rows.steps ? [] : ['- The review-a-method steps are not in the store yet: only the pack was written']),
  ]
  if (plan.write) {
    for (const f of plan.files) {
      mkdirSync(join(opsDir, PACK_DIR), { recursive: true })
      writeFileSync(join(opsDir, f.path), f.text)
    }
  }
  const report = [...lines, ...(monthly ? ['', upkeepText(due)] : [])].join('\n')
  console.log(report)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `written=${plan.write}\n`)
  if (monthly && due.length && process.argv.includes('--open-issue')) await openUpkeepIssue(upkeepText(due))
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
