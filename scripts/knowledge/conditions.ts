// F126 / T1020 (#1223) — the scheduled check for conditions in the knowledge
// store. Run by .github/workflows/knowledge-conditions.yml: on a schedule, and
// from the Actions tab when the PM marks a condition met or withdrawn.
//
// What one run does:
//   1. Marks a condition by hand, when the run was asked to (the PM, from his
//      phone: Actions → Knowledge conditions → Run workflow).
//   2. Runs every check: a query (a number crossing a line, or true/false) or
//      a named test file. A query runs as ONE statement (the extended
//      protocol refuses a second, so a check cannot `commit;` its way out),
//      in a read-only transaction with a timeout, on its own connection; only
//      an operator can have written it (the store refuses anyone else). It
//      must return one number or true/false. A check that errors changes
//      nothing, and only its error code reaches the public run summary.
//   3. Records each change of status through knowledge.set_condition, with
//      the number and the line as evidence, so history holds it, and records
//      "met" as announced for each condition or part that became met.
//      That commits before any Issue is opened.
//   4. Then, one transaction per Issue: opens ONE Issue for each condition
//      announced met with no Issue yet, and records the Issue's address. When
//      a part's becoming met also makes its parent met, the parent's Issue
//      carries both. The Issue lists what starts, what ends, and what still
//      waits and on which part, naming only PUBLIC records in words (this
//      repository is public); any other record is named by its id alone.
//
// Writes only through the store's functions, as its own login, holding a key
// minted for this run and revoked at its end, with the import's own helpers (#1218).
//
// Run: tsx scripts/knowledge/conditions.ts [--commit] [--mark ID --status S --reason R]
// with DATABASE_URL set; GITHUB_TOKEN and GITHUB_REPOSITORY to open Issues.
// Without --commit it does all the work, opens nothing, and rolls back.

import { Client, type ClientBase } from 'pg'
import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { enterStore, leaveStore, PERSON } from './import'

export { PERSON }

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
  audience: string
  status: Status
  own_status: Status
  checked_by: Check | null
  parts: string[]
  part_of: string[]
  announced: Status | null
  announced_issue: string | null
}

export interface Waiter {
  id: string
  kind: string
  answer: string
  audience: string
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

/** A record's words go into the public Issue only when the record is public. */
function words(r: { id: string; answer: string; audience: string } | undefined, id: string): string {
  return r && r.audience === 'public' ? `${id} "${r.answer}"` : `${id} (not public)`
}

function describe(id: string, byId: Map<string, ConditionRow>): string {
  return words(byId.get(id), id)
}

/** The one Issue for a condition that became met. */
export function composeIssue(
  cond: ConditionRow,
  byId: Map<string, ConditionRow>,
  waiters: Waiter[],
  alsoMet: string[] = [],
): { title: string; body: string } {
  const item = (w: Waiter) =>
    w.audience === 'public' ? `- ${w.id} · ${w.kind} · ${w.answer}` : `- ${w.id} · ${w.kind} (not public)`
  const group = new Set([cond.id, ...alsoMet])
  const here = waiters.filter((w) => group.has(w.condition))
  const starts = here.filter((w) => w.link === 'starts_when' && !w.parked)
  const ends = here.filter((w) => w.link === 'ends_when')
  const waiting = waiters.filter((w) => w.link === 'starts_when' && w.parked)
  const name = cond.audience === 'public' ? cond.answer : `${cond.id} (not public)`
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
    `**${name}** (${cond.id}) is met.` +
      (alsoMet.length ? ` So are its parts ${alsoMet.map((p) => describe(p, byId)).join(', ')}.` : '') +
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
  return { title: `chore · met: ${name}`, body: lines.join('\n') }
}

// ---------------------------------------------------------------------------
// The store.

// Entering and leaving the store's login: the import's (#1218), shared.
export { enterStore, leaveStore }

async function readConditions(db: ClientBase): Promise<Map<string, ConditionRow>> {
  const { rows } = await db.query<ConditionRow>(
    `select id, answer, audience, status, own_status, checked_by, parts, part_of, announced, announced_issue
       from knowledge.conditions order by id`,
  )
  return new Map(rows.map((r) => [r.id, r]))
}

async function readWaiters(db: ClientBase): Promise<Waiter[]> {
  const { rows } = await db.query<Waiter>(
    `select r.id, r.kind, r.answer, r.audience, l.type as link, l.to_id as condition, knowledge.is_parked(r.id) as parked
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

/** A check's value: one number or true/false, nothing else (no text reaches the run's summary). */
export function coerceValue(value: unknown): number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  throw new Error('a check returns one number or true/false')
}

/** An error, reduced to what may be shown in public: its code, never its text. */
export function redact(e: unknown): string {
  const code = (e as { code?: unknown })?.code
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)
    ? `the check failed to run (SQLSTATE ${code})`
    : 'the check failed to run'
}

/** Runs one check query on its own connection: one statement, read-only, with a timeout. */
export async function readOnlyQuery(reader: ClientBase, sql: string): Promise<unknown> {
  await reader.query('begin transaction read only')
  try {
    await reader.query(`set local statement_timeout = '20s'`)
    // The extended protocol takes exactly one statement: `commit; …` is refused.
    const { rows } = await reader.query({ text: sql, queryMode: 'extended' } as unknown as string)
    return rows[0] ? Object.values(rows[0])[0] : null
  } finally {
    await reader.query('rollback')
  }
}

/** Steps 1 to 3: inside the caller's transaction, already in the store (enterStore). */
export async function recordChanges(db: ClientBase, opts: RunOptions): Promise<RunSummary> {
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
        value = coerceValue(await opts.runQuery(check.query!))
        met = verdict(check, value)
      }
    } catch (e) {
      summary.checked.push({ id: c.id, value: null, met: false, error: redact(e) })
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

  // Record every change of status, however it came about; "met" with no
  // Issue yet is what openPending picks up.
  for (const c of (await readConditions(db)).values()) {
    if (c.status !== (c.announced ?? 'not started')) {
      await db.query('select knowledge.announce($1, $2, null)', [c.id, c.status])
    }
  }
  return summary
}

/**
 * Step 4: opens Issues for conditions announced met with no Issue yet, at most
 * `limit` of them, recording each Issue's address. A part met together with
 * its parent goes in the parent's Issue. Returns what it opened.
 */
export async function openPending(
  db: ClientBase,
  openIssue: RunOptions['openIssue'],
  limit = Infinity,
): Promise<RunSummary['issues']> {
  const byId = await readConditions(db)
  const pending = new Set(
    [...byId.values()].filter((c) => c.announced === 'met' && !c.announced_issue && c.status === 'met').map((c) => c.id),
  )
  const tops = [...pending].filter((id) => !ancestors(id, byId).some((a) => pending.has(a)))
  const waiters = await readWaiters(db)
  const opened: RunSummary['issues'] = []
  for (const top of tops.slice(0, limit)) {
    const group = [...pending].filter((id) => id !== top && ancestors(id, byId).includes(top)).sort()
    const inGroup = new Set([top, ...group])
    const above = new Set(ancestors(top, byId))
    const relevant = waiters.filter(
      (w) => inGroup.has(w.condition) || (above.has(w.condition) && w.link === 'starts_when' && w.parked),
    )
    const issue = composeIssue(byId.get(top)!, byId, relevant, group)
    const url = await openIssue(issue.title, issue.body)
    for (const id of inGroup) await db.query(`select knowledge.announce($1, 'met', $2)`, [id, url])
    opened.push({ id: top, title: issue.title, url })
  }
  return opened
}

/** One whole run in the caller's transaction (the tests; the CLI splits it). */
export async function runConditions(db: ClientBase, opts: RunOptions): Promise<RunSummary> {
  const summary = await recordChanges(db, opts)
  summary.issues = await openPending(db, opts.openIssue)
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
  const by = process.env.GITHUB_ACTOR ? ` (marked by ${process.env.GITHUB_ACTOR} from an Actions run)` : ''
  const mark: Mark | undefined = markId
    ? {
        id: markId,
        status: (arg('--status') ?? 'met') as Status,
        reason: (arg('--reason')?.trim() || 'marked by hand') + by,
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
  const runQuery = (sql: string) => readOnlyQuery(reader, sql)
  // A named test runs without the database's address or the GitHub token.
  const { DATABASE_URL: _db, GITHUB_TOKEN: _gh, ...childEnv } = process.env
  void _db
  void _gh
  const runTest = async (file: string): Promise<boolean> =>
    spawnSync('npx', ['vitest', 'run', file], { stdio: 'inherit', shell: false, env: childEnv }).status === 0

  const db = new Client({ connectionString: url })
  await db.connect()
  const agent = `conditions-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  try {
    // Statuses and "met" announcements commit before any Issue is opened.
    await db.query('begin')
    await enterStore(db, agent)
    const summary = await recordChanges(db, { mark, runQuery, runTest, openIssue })
    if (!commit) summary.issues = await openPending(db, openIssue)
    await leaveStore(db, agent)
    await db.query(commit ? 'commit' : 'rollback')
    // Then one transaction per Issue, recording its address straight after.
    for (let n = 1; commit; n++) {
      await db.query('begin')
      await enterStore(db, `${agent}-issue-${n}`)
      const opened = await openPending(db, openIssue, 1)
      await leaveStore(db, `${agent}-issue-${n}`)
      await db.query('commit')
      if (opened.length === 0) break
      summary.issues.push(...opened)
    }
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
