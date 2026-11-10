// F126 / T1020 (#1223) — the scheduled check for conditions in the knowledge
// store. Run by .github/workflows/knowledge-conditions.yml: on a schedule, and
// from the Actions tab when the PM marks a condition met or withdrawn.
//
// What one run does:
//   1. Marks a condition by hand, when the run was asked to (the PM, from his
//      phone: Actions → Knowledge conditions → Run workflow).
//   2. Runs every check: a query (a number crossing a line, or true/false) or
//      a named test file. Queries run on a READ-ONLY connection with a
//      timeout; only an operator can have written them (the store refuses
//      anyone else). A check that errors changes nothing and is reported.
//   3. Records each change of status through knowledge.set_condition, with
//      the number and the line as evidence, so history holds it.
//   4. For each condition or part whose status (computed, for a parent) is
//      now met and was not last announced as met: opens ONE Issue listing
//      what it starts, what it ends, and what still waits and on which part.
//      Then records the announcement, so nothing is sent twice.
//
// Writes only through the store's functions, as its own login, holding a key
// minted for this run and revoked at its end, as the import does (#1218).
//
// Run: tsx scripts/knowledge/conditions.ts [--commit] [--mark ID --status S --reason R]
// with DATABASE_URL set; GITHUB_TOKEN and GITHUB_REPOSITORY to open Issues.
// Without --commit it does all the work, opens nothing, and rolls back.

import { Client, type ClientBase } from 'pg'
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'

export const PERSON = 'the PM'

export type Status = 'not started' | 'partial' | 'met' | 'withdrawn'
export const STATUSES: Status[] = ['not started', 'partial', 'met', 'withdrawn']

export interface Check {
  query?: string
  at_least?: number
  line?: string
  test?: string
}

export interface ConditionRow {
  id: string
  answer: string
  status: Status
  own_status: Status
  checked_by: Check | null
  parts: string[]
  part_of: string[]
  announced: Status | null
}

export interface Waiter {
  id: string
  kind: string
  answer: string
  link: 'starts_when' | 'ends_when'
  condition: string
  parked: boolean
}

export interface Mark {
  id: string
  status: Status
  reason: string
}

export interface RunOptions {
  mark?: Mark
  /** Runs a check's query; returns the first column of the first row. */
  runQuery(sql: string): Promise<unknown>
  /** Runs a named test file; true when it passes. */
  runTest(file: string): Promise<boolean>
  /** Opens one Issue; returns its URL. */
  openIssue(title: string, body: string): Promise<string>
}

export interface Checked {
  id: string
  value: unknown
  met: boolean
  error?: string
}

export interface RunSummary {
  marked?: { id: string; status: Status }
  checked: Checked[]
  changed: { id: string; from: Status; to: Status }[]
  issues: { id: string; title: string; url: string }[]
}

// ---------------------------------------------------------------------------
// Pure parts.

/** Whether a check's value meets it: at or above the line, or plainly true. */
export function verdict(check: Check, value: unknown): boolean {
  if (check.at_least !== undefined) {
    if (value === null || value === undefined || value === '') return false
    const n = Number(value)
    return Number.isFinite(n) && n >= check.at_least
  }
  return value === true || value === 't' || value === 'true'
}

/** The bottom parts of a condition that are neither met nor withdrawn. */
export function unmetLeaves(id: string, byId: Map<string, ConditionRow>, seen = new Set<string>()): string[] {
  const c = byId.get(id)
  if (!c || seen.has(id) || c.status === 'met' || c.status === 'withdrawn') return []
  seen.add(id)
  if (c.parts.length === 0) return [id]
  return c.parts.flatMap((p) => unmetLeaves(p, byId, seen)).sort()
}

function describe(id: string, byId: Map<string, ConditionRow>): string {
  return `${id} "${byId.get(id)?.answer ?? id}"`
}

/** The one Issue for a condition that became met. */
export function composeIssue(
  cond: ConditionRow,
  byId: Map<string, ConditionRow>,
  waiters: Waiter[],
): { title: string; body: string } {
  const item = (w: Waiter) => `- ${w.id} · ${w.kind} · ${w.answer}`
  const here = waiters.filter((w) => w.condition === cond.id)
  const starts = here.filter((w) => w.link === 'starts_when' && !w.parked)
  const ends = here.filter((w) => w.link === 'ends_when')
  const waiting = waiters.filter((w) => w.link === 'starts_when' && w.parked)
  const still = waiting.map((w) => {
    const on = unmetLeaves(w.condition, byId)
    const names = (on.length ? on : [w.condition]).map((x) => describe(x, byId)).join(', ')
    return `${item(w)}: waits on ${names}`
  })

  const lines = [
    '**Kind:** chore',
    '**Scenario:** F126',
    '**Path:** well-worn. Precedents: [Stripe account capabilities](https://docs.stripe.com/connect/account-capabilities), [LaunchDarkly prerequisite flags](https://docs.launchdarkly.com/home/flags/prerequisites).',
    '',
    `**${cond.answer}** (${cond.id}) is met.` +
      (cond.part_of.length ? ` It is part of ${cond.part_of.map((p) => describe(p, byId)).join(', ')}.` : ''),
    '',
    '## Starts now',
    ...(starts.length ? starts.map(item) : ['Nothing waits to start on it.']),
    '',
    '## Ends now',
    ...(ends.length ? ends.map(item) : ['Nothing ends with it.']),
  ]
  if (still.length) lines.push('', '## Still waiting', ...still)
  lines.push('', 'Opened by the scheduled conditions check (knowledge-conditions workflow).')
  return { title: `chore · met: ${cond.answer}`, body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// The store.

export async function enterStore(db: ClientBase, agent: string, person = PERSON): Promise<void> {
  const { rows } = await db.query<{ key: string }>(`select knowledge.add_agent($1, $2, '{}', true) as key`, [
    agent,
    person,
  ])
  await db.query('grant knowledge_store to current_user')
  await db.query('set local role knowledge_store')
  await db.query(`select set_config('knowledge.key', $1, true)`, [rows[0].key])
}

export async function leaveStore(db: ClientBase, agent: string): Promise<void> {
  await db.query(`select set_config('knowledge.key', '', true)`)
  await db.query('reset role')
  await db.query('revoke knowledge_store from current_user')
  await db.query('select knowledge.revoke_agent($1)', [agent])
}

async function readConditions(db: ClientBase): Promise<Map<string, ConditionRow>> {
  const { rows } = await db.query<ConditionRow>(
    `select id, answer, status, own_status, checked_by, parts, part_of, announced from knowledge.conditions order by id`,
  )
  return new Map(rows.map((r) => [r.id, r]))
}

async function readWaiters(db: ClientBase): Promise<Waiter[]> {
  const { rows } = await db.query<Waiter>(
    `select r.id, r.kind, r.answer, l.type as link, l.to_id as condition, knowledge.is_parked(r.id) as parked
       from knowledge.links l join knowledge.records r on r.id = l.from_id
      where l.type in ('starts_when', 'ends_when')
      order by r.id`,
  )
  return rows
}

/** Every condition above this one, through part_of. */
function ancestors(id: string, byId: Map<string, ConditionRow>, seen = new Set<string>()): string[] {
  for (const p of byId.get(id)?.part_of ?? []) {
    if (!seen.has(p)) {
      seen.add(p)
      ancestors(p, byId, seen)
    }
  }
  return [...seen]
}

function reasonFor(check: Check, value: unknown, met: boolean): string {
  if (check.test) return `the scheduled check: ${check.test} ${met ? 'passes' : 'does not pass'}`
  if (check.at_least !== undefined) return `the scheduled check: ${check.line ?? 'the count'}: ${Number(value)}, at least ${check.at_least}`
  return `the scheduled check: ${check.line ?? 'its query'} is ${met ? 'true' : 'not true'}`
}

/** One run, inside the caller's transaction, already in the store (enterStore). */
export async function runConditions(db: ClientBase, opts: RunOptions): Promise<RunSummary> {
  const summary: RunSummary = { checked: [], changed: [], issues: [] }

  if (opts.mark) {
    const { id, status, reason } = opts.mark
    await db.query('select knowledge.set_condition($1, $2, $3)', [id, status, reason])
    summary.marked = { id, status }
  }

  // Checks: only on conditions without parts (a parent is computed), not withdrawn.
  for (const c of (await readConditions(db)).values()) {
    const check = c.checked_by
    if (!check || c.parts.length > 0 || c.own_status === 'withdrawn') continue
    let value: unknown
    let met: boolean
    try {
      if (check.test) {
        met = await opts.runTest(check.test)
        value = met
      } else {
        value = await opts.runQuery(check.query!)
        if (typeof value === 'string' && check.at_least !== undefined) value = Number(value)
        met = verdict(check, value)
      }
    } catch (e) {
      summary.checked.push({ id: c.id, value: null, met: false, error: (e as Error).message })
      continue
    }
    summary.checked.push({ id: c.id, value, met })

    // Met when the check passes; back to not started when a met one stops
    // passing. A part someone marked partial by hand stays as it is.
    const to: Status | null = met ? 'met' : c.own_status === 'met' ? 'not started' : null
    if (to && to !== c.own_status) {
      const evidence = { check: check.test ? 'test' : 'query', value, ...(check.at_least !== undefined && { at_least: check.at_least }), ...(check.test && { test: check.test }) }
      await db.query('select knowledge.set_condition($1, $2, $3, $4)', [c.id, to, reasonFor(check, value, met), evidence])
      summary.changed.push({ id: c.id, from: c.own_status, to })
    }
  }

  // Announce: one Issue per condition or part newly met, however it got there.
  const byId = await readConditions(db)
  const waiters = await readWaiters(db)
  for (const c of byId.values()) {
    const last = c.announced ?? 'not started'
    if (c.status === last) continue
    let url: string | null = null
    if (c.status === 'met') {
      const above = new Set(ancestors(c.id, byId))
      const relevant = waiters.filter(
        (w) => w.condition === c.id || (above.has(w.condition) && w.link === 'starts_when' && w.parked),
      )
      const issue = composeIssue(c, byId, relevant)
      url = await opts.openIssue(issue.title, issue.body)
      summary.issues.push({ id: c.id, title: issue.title, url })
    }
    await db.query('select knowledge.announce($1, $2, $3)', [c.id, c.status, url])
  }
  return summary
}

// ---------------------------------------------------------------------------
// The command line, as the workflow runs it.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const commit = process.argv.includes('--commit')
  const markId = arg('--mark')?.trim()
  const mark: Mark | undefined = markId
    ? {
        id: markId,
        status: (arg('--status') ?? 'met') as Status,
        reason: arg('--reason')?.trim() || 'marked by the PM from an Actions run',
      }
    : undefined
  if (mark && !STATUSES.includes(mark.status)) throw new Error(`Not a status: ${mark.status}`)

  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN
  const openIssue = async (title: string, body: string): Promise<string> => {
    if (!commit) {
      console.log(`Would open: ${title}\n${body}\n`)
      return '(dry run)'
    }
    if (!repo || !token) throw new Error('GITHUB_REPOSITORY and GITHUB_TOKEN are needed to open an Issue.')
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' },
      body: JSON.stringify({ title, body, labels: ['area:ops'] }),
    })
    if (!res.ok) throw new Error(`Opening the Issue failed: ${res.status} ${await res.text()}`)
    return ((await res.json()) as { html_url: string }).html_url
  }

  // Checks read on their own connection, read-only, one transaction each.
  const reader = new Client({ connectionString: url })
  await reader.connect()
  const runQuery = async (sql: string): Promise<unknown> => {
    await reader.query('begin transaction read only')
    try {
      await reader.query(`set local statement_timeout = '20s'`)
      const { rows } = await reader.query(sql)
      return rows[0] ? Object.values(rows[0])[0] : null
    } finally {
      await reader.query('rollback')
    }
  }
  const runTest = async (file: string): Promise<boolean> =>
    spawnSync('npx', ['vitest', 'run', file], { stdio: 'inherit', shell: false }).status === 0

  const db = new Client({ connectionString: url })
  await db.connect()
  const agent = `conditions-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  try {
    await db.query('begin')
    await enterStore(db, agent)
    const summary = await runConditions(db, { mark, runQuery, runTest, openIssue })
    await leaveStore(db, agent)
    await db.query(commit ? 'commit' : 'rollback')
    report(summary, commit)
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    await db.end()
    await reader.end()
  }
}

function report(s: RunSummary, commit: boolean): void {
  const lines = [
    `## Conditions check${commit ? '' : ' (dry run: nothing written, no Issue opened)'}`,
    s.marked ? `- Marked ${s.marked.id} ${s.marked.status}.` : '- Nothing marked by hand.',
    `- Checks run: ${s.checked.length}; changed: ${s.changed.map((c) => `${c.id} ${c.from} → ${c.to}`).join(', ') || 'none'}.`,
    ...s.checked.filter((c) => c.error).map((c) => `- ${c.id}: the check failed to run: ${c.error}`),
    `- Issues opened: ${s.issues.map((i) => `${i.title} (${i.url})`).join(', ') || 'none'}.`,
  ]
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
  }
  if (s.checked.some((c) => c.error)) process.exitCode = 1
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
