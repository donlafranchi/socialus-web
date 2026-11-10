import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import {
  composeIssue,
  enterStore,
  leaveStore,
  openPending,
  readOnlyQuery,
  recordChanges,
  redact,
  runConditions,
  unmetLeaves,
  verdict,
  type ConditionRow,
} from '../scripts/knowledge/conditions'

// F126 — the scheduled check (scripts/knowledge/conditions.ts): it runs every
// condition's check, records what changed, and opens one Issue for each
// condition or part that became met. The store's own rules are tested in SQL:
// supabase/tests/knowledge_conditions.sql.

const require = createRequire(import.meta.url)
const { checkPath } = require('../scripts/check-path-line.cjs') as { checkPath: (b: string) => string | null }

const row = (id: string, over: Partial<ConditionRow> = {}): ConditionRow => ({
  id,
  answer: id,
  audience: 'public',
  status: 'not started',
  own_status: 'not started',
  checked_by: null,
  parts: [],
  part_of: [],
  announced: null,
  announced_issue: null,
  ...over,
})

describe('a threshold is a number crossing a line', () => {
  it('meets at or above the line, and not below it', () => {
    expect(verdict({ query: 'q', at_least: 500 }, 500)).toBe(true)
    expect(verdict({ query: 'q', at_least: 500 }, '501')).toBe(true)
    expect(verdict({ query: 'q', at_least: 500 }, 499)).toBe(false)
    expect(verdict({ query: 'q', at_least: 500 }, null)).toBe(false)
    expect(verdict({ query: 'q' }, true)).toBe(true)
    expect(verdict({ query: 'q' }, false)).toBe(false)
    expect(verdict({ query: 'q' }, 1)).toBe(false)
  })
})

describe('the parts still unmet, all the way down', () => {
  it('names the bottom parts that are not met or withdrawn', () => {
    const byId = new Map(
      [
        row('pay', { status: 'partial', parts: ['card', 'payout'] }),
        row('card', { status: 'met' }),
        row('payout', { status: 'not started', parts: ['bank', 'instant'] }),
        row('bank', { status: 'not started' }),
        row('instant', { status: 'withdrawn' }),
      ].map((r) => [r.id, r]),
    )
    expect(unmetLeaves('pay', byId)).toEqual(['bank'])
    expect(unmetLeaves('card', byId)).toEqual([])
  })
})

describe('the Issue for a met condition', () => {
  const byId = new Map(
    [
      row('CN-0001', { answer: 'Payments work', status: 'partial', parts: ['CN-0002', 'CN-0003'] }),
      row('CN-0002', { answer: 'Take a one-off card payment', status: 'met', part_of: ['CN-0001'] }),
      row('CN-0003', { answer: 'Pay out to a seller', part_of: ['CN-0001'] }),
    ].map((r) => [r.id, r]),
  )
  const issue = composeIssue(byId.get('CN-0002')!, byId, [
    { id: 'F991', kind: 'feature', answer: 'Card pre-orders', audience: 'public', link: 'starts_when', condition: 'CN-0002', parked: false },
    { id: 'D-0012', kind: 'decision', answer: 'Trades are cash in person, for now.', audience: 'public', link: 'ends_when', condition: 'CN-0002', parked: false },
    { id: 'F992', kind: 'feature', answer: 'Sellers paid on the app', audience: 'public', link: 'starts_when', condition: 'CN-0001', parked: true },
    { id: 'D-0013', kind: 'decision', answer: 'Hold seller funds 7 days pending the bank review', audience: 'department', link: 'starts_when', condition: 'CN-0002', parked: false },
  ])

  it('lists what it starts, what it ends, and what still waits, naming the part', () => {
    expect(issue.title).toBe('chore · met: Take a one-off card payment')
    expect(issue.body).toMatch(/## Starts now\n- F991 · feature · Card pre-orders/)
    expect(issue.body).toMatch(/## Ends now\n- D-0012 · decision · Trades are cash in person, for now\./)
    expect(issue.body).toMatch(/## Still waiting\n- F992 · feature · Sellers paid on the app: waits on CN-0003 "Pay out to a seller"/)
  })

  it('names only public records in words, because the repository is public', () => {
    expect(issue.body).toContain('- D-0013 · decision (not public)')
    expect(issue.body).not.toContain('Hold seller funds')
    const secret = composeIssue(row('CN-0009', { answer: 'Bank review passes', audience: 'operators', status: 'met' }), byId, [])
    expect(secret.title).toBe('chore · met: CN-0009 (not public)')
    expect(secret.body).not.toContain('Bank review passes')
  })

  it('shows a failed check only by its error code', () => {
    expect(redact(Object.assign(new Error('invalid input syntax: "alice@example.com"'), { code: '22P02' })))
      .toBe('the check failed to run (SQLSTATE 22P02)')
    expect(redact(new Error('alice@example.com'))).toBe('the check failed to run')
  })

  it('passes the repo\'s own Issue checks', () => {
    expect(checkPath(issue.body)).toBeNull()
    expect(issue.body).toMatch(/Kind:[*_\s]*chore\b/)
    expect(issue.body).toMatch(/Scenario:[*_\s]*F126\b/)
    expect(issue.body).not.toMatch(/- \[[ x]\]/i)
  })
})

describe('the scheduled workflow', () => {
  // [guards F126.8 partial: marking through the lookup tool is #1219's]
  it('runs on a schedule, and from the Actions tab with a condition and a status to mark', () => {
    const yml = readFileSync(resolve(__dirname, '..', '.github', 'workflows', 'knowledge-conditions.yml'), 'utf8')
    expect(yml).toMatch(/schedule:\n\s+- cron: '[^']+'/)
    expect(yml).toMatch(/workflow_dispatch:/)
    expect(yml).toMatch(/condition:/)
    expect(yml).toMatch(/options:\s*\[met, withdrawn, partial, not started\]/)
    expect(yml).toMatch(/issues: write/)
    expect(yml).toMatch(/npx tsx scripts\/knowledge\/conditions\.ts/)
    // Only the PM marks by hand; anyone else's run only runs the checks.
    expect(yml).toMatch(/github\.actor != 'donlafranchi'/)
  })
})

// ---------------------------------------------------------------------------
// Against the store itself.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the scheduled check decides thresholds, records what changed, and opens one Issue per condition that became met',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F126 — the scheduled check, against the store', () => {
  let pool: Pool
  let db: PoolClient
  const agent = `t-conditions-${process.pid}`

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
  })
  afterAll(async () => {
    db?.release()
    await pool?.end()
  })

  // Check queries run as the admin connection, as the job runs them on its
  // read-only one; here, inside the test's transaction, rolled back after each.
  const runQuery = async (sql: string) => {
    await db.query('savepoint check_query')
    try {
      await db.query('reset role')
      const { rows } = await db.query(sql)
      return rows[0] ? Object.values(rows[0])[0] : null
    } finally {
      await db.query('rollback to savepoint check_query')
    }
  }

  const record = async (p: Record<string, unknown>) =>
    (await db.query<{ id: string }>(`select knowledge.record($1, 'F126 test') as id`, [p])).rows[0].id
  const link = (from: string, to: string, type: string) =>
    db.query('select knowledge.link($1, $2, $3)', [from, to, type])

  it('decides a threshold and a named test, records it, and opens one Issue per newly met condition or part', async () => {
    await db.query('begin')
    try {
      await db.query('create temp table t_members (id int)')
      await db.query('insert into t_members select generate_series(1, 3)')
      await enterStore(db, agent)

      const cond = (answer: string, extra: Record<string, unknown> = {}) =>
        record({ kind: 'condition', concern: 'payments', answer, why: 'test', owner: 'the PM', audience: 'public', ...extra })
      const pay = await cond('Payments work')
      const card = await cond('Take a one-off card payment', {
        checked_by: { query: 'select count(*) from pg_temp.t_members', at_least: 3, line: 'card payments taken' },
      })
      const payout = await cond('Pay out to a seller')
      const metro = await cond('Members in the first metro reach 5', {
        checked_by: { query: 'select count(*) from pg_temp.t_members', at_least: 5, line: 'members' },
      })
      const tested = await cond('The receipts test passes', { checked_by: { test: 'tests/receipts.test.ts' } })
      await link(card, pay, 'part_of')
      await link(payout, pay, 'part_of')
      const preorders = await record({ kind: 'feature', id: 'F981', answer: 'Card pre-orders', audience: 'public' })
      const cashonly = await record({
        kind: 'decision', concern: 'payments', answer: 'Trades are cash in person, for now.', why: 'No payments yet.',
        holds: 'for now', until: 'card payments', audience: 'public',
      })
      const sellerpay = await record({ kind: 'feature', id: 'F982', answer: 'Sellers paid on the app', audience: 'public' })
      await link(preorders, card, 'starts_when')
      await link(cashonly, card, 'ends_when')
      await link(sellerpay, pay, 'starts_when')

      const opened: { title: string; body: string }[] = []
      const testsRun: string[] = []
      const opts = {
        runQuery,
        runTest: async (file: string) => (testsRun.push(file), true),
        openIssue: async (title: string, body: string) => {
          opened.push({ title, body })
          return `https://example.test/issues/${opened.length}`
        },
      }

      // [guards F126.3]
      const first = await runConditions(db, opts)
      const status = async (id: string) =>
        (await db.query<{ s: string }>('select knowledge.condition_status($1) as s', [id])).rows[0].s
      expect(await status(card)).toBe('met')
      expect(await status(metro)).toBe('not started')
      expect(first.checked.find((c) => c.id === metro)).toMatchObject({ value: 3, met: false })
      const h = await db.query(
        `select reason, evidence from knowledge.history where record_id = $1 order by version desc limit 1`, [card])
      expect(h.rows[0].evidence).toMatchObject({ value: 3, at_least: 3 })
      expect(h.rows[0].reason).toMatch(/card payments taken: 3, at least 3/)
      expect(testsRun).toEqual(['tests/receipts.test.ts'])
      expect(await status(tested)).toBe('met')

      // [guards F126.6]
      const forCard = opened.filter((i) => i.title === 'chore · met: Take a one-off card payment')
      expect(forCard).toHaveLength(1)
      expect(forCard[0].body).toContain(`- ${preorders} · feature · Card pre-orders`)
      expect(forCard[0].body).toContain(`- ${cashonly} · decision · Trades are cash in person, for now.`)
      expect(forCard[0].body).toContain(`- ${sellerpay} · feature · Sellers paid on the app: waits on ${payout} "Pay out to a seller"`)
      expect(opened.map((i) => i.title).sort()).toEqual(
        ['chore · met: Take a one-off card payment', 'chore · met: The receipts test passes'])

      // Nothing is announced twice.
      await runConditions(db, opts)
      expect(opened).toHaveLength(2)

      // [guards F126.8 partial: marking through the lookup tool is #1219's]
      const marked = await runConditions(db, { ...opts, mark: { id: payout, status: 'met', reason: 'payouts live, from the phone' } })
      expect(marked.marked).toMatchObject({ id: payout, status: 'met' })
      expect(await status(pay)).toBe('met')
      // The part and the parent it completes go out as one Issue.
      expect(opened.slice(2).map((i) => i.title)).toEqual(['chore · met: Payments work'])
      expect(opened[2].body).toContain(`- ${sellerpay} · feature · Sellers paid on the app`)
      expect(opened[2].body).toContain(`So are its parts ${payout} "Pay out to a seller"`)

      await leaveStore(db, agent)
    } finally {
      await db.query('rollback')
    }
  })

  // [guards F126.6 partial: the one-Issue rule when opening fails part way; the batch itself is the test above]
  it('never opens an Issue twice when a run fails part way', async () => {
    await db.query('begin')
    try {
      await enterStore(db, `${agent}-twice`)
      const a = await record({ kind: 'condition', answer: 'Part A', why: 't', owner: 'the PM', audience: 'public' })
      const b = await record({ kind: 'condition', answer: 'Part B', why: 't', owner: 'the PM', audience: 'public' })
      await db.query(`select knowledge.set_condition($1, 'met', 't'), knowledge.set_condition($2, 'met', 't')`, [a, b])
      const titles: string[] = []
      const opts = {
        runQuery,
        runTest: async () => true,
        openIssue: async (t: string) => (titles.push(t), `u/${titles.length}`),
      }
      await recordChanges(db, opts)
      let calls = 0
      await expect(
        openPending(db, async (t) => {
          if (++calls === 2) throw new Error('502 from GitHub')
          titles.push(t)
          return 'u/first'
        }),
      ).rejects.toThrow('502')
      await openPending(db, opts.openIssue)
      expect(titles.filter((t) => t === 'chore · met: Part A')).toHaveLength(1)
      expect(titles.filter((t) => t === 'chore · met: Part B')).toHaveLength(1)
      await leaveStore(db, `${agent}-twice`)
    } finally {
      await db.query('rollback')
    }
  })

  it('runs a check query as one read-only statement that cannot commit its way out', async () => {
    const reader = await pool.connect()
    try {
      await expect(
        readOnlyQuery(reader, "commit; select current_setting('transaction_read_only')"),
      ).rejects.toThrow(/multiple commands/)
      expect(await readOnlyQuery(reader, "select current_setting('transaction_read_only')")).toBe('on')
      await expect(readOnlyQuery(reader, 'create temp table t_nope (x int)')).rejects.toThrow(/read-only/)
    } finally {
      reader.release()
    }
  })
})
