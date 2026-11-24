import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  readVersionSeed, seedProblems, versionProblems, comparable, loadVersions, type SeedVersion, type VersionSeed, type VersionSummary,
} from '../scripts/knowledge/versions'
import { runTool } from '@/lib/knowledge/tools'

// #1431: version plans come in from scripts/knowledge/versions-seed.json
// (scripts/knowledge/versions.ts), and the lookup tool's plan and plan_changes
// read them back. What a plan must hold is the store's own rule, tested in
// supabase/tests/knowledge_plans.sql; here is the seed's side of it.

const GOOD: SeedVersion = {
  id: 'VN-0900',
  answer: 'Test beta',
  why: 'The PM said so.',
  due_on: '2027-01-06',
  outcomes: ['The town opens'],
  appetite: 'Must-haves only',
  includes: ['F920-S1'],
  leaves_out: [{ slice: 'F921-S1', reason: 'Not needed to open.' }],
  ruled_by: ['D-0900'],
}

describe('the version seed', () => {
  it('the committed seed has no problems', () => {
    const seed = readVersionSeed()
    expect(seedProblems(seed)).toEqual([])
    expect(seed.versions.length).toBeGreaterThan(0)
  })

  it('a well-formed entry passes', () => {
    expect(versionProblems(GOOD)).toEqual([])
  })

  // The check is seen rejecting each kind of bad entry ([guard-proves-itself]).
  const bad: [string, Partial<SeedVersion> | Record<string, unknown>, string][] = [
    ['an id that is not VN-0000', { id: 'V1' }, 'V1: its id is VN- and four digits'],
    ['no name', { answer: ' ' }, 'VN-0900: it has no name (answer)'],
    ['no why', { why: '' }, 'VN-0900: it has no why'],
    ['a date that is not one', { due_on: 'January 6' }, 'VN-0900: due_on is a date, YYYY-MM-DD'],
    ['no outcome', { outcomes: [] }, 'VN-0900: it names at least one outcome, each in words'],
    ['no appetite', { appetite: '' }, 'VN-0900: it has no appetite: how much it is worth, in words'],
    ['a leave-out with no reason', { leaves_out: [{ slice: 'F921-S1', reason: '' }] }, 'VN-0900: leaving out F921-S1 needs a reason'],
    ['a slice both in and left out', { leaves_out: [{ slice: 'F920-S1', reason: 'r' }] }, 'VN-0900: a slice is named once, either in or left out: F920-S1'],
    ['a slice included twice', { includes: ['F920-S1', 'F920-S1'] }, 'VN-0900: a slice is named once, either in or left out: F920-S1'],
    ['no ruling behind it', { ruled_by: [] }, 'VN-0900: it names the rulings it rests on (ruled_by)'],
    ['a change with no why', { changed: { why: '', outcome: 'The town opens' } }, 'VN-0900: a change of plan gives its why'],
    ['a change naming an outcome the plan lacks', { changed: { why: 'w', outcome: 'Something else' } }, "VN-0900: the outcome that changed is one of the plan's outcomes"],
    ['a field nobody reads', { status: 'current' }, 'VN-0900: unknown field status'],
  ]
  for (const [name, change, problem] of bad) {
    it(`refuses ${name}`, () => {
      expect(versionProblems({ ...GOOD, ...change } as SeedVersion)).toContain(problem)
    })
  }

  it('refuses an id listed twice', () => {
    expect(seedProblems({ versions: [GOOD, GOOD] })).toContain('VN-0900: listed twice')
  })

  it('compares plans whatever the order, and ignores what the store stamps on', () => {
    const a = comparable({ outcomes: ['b', 'a'], appetite: ' x ', includes: ['S2', 'S1'], leaves_out: [{ slice: 'S3', reason: 'r' }] })
    const b = comparable({
      outcomes: ['a', 'b'], appetite: 'x', includes: ['S1', 'S2'],
      leaves_out: [{ slice: 'S3', reason: 'r ', condition: null, outcomes_then: ['a'] } as never],
    })
    expect(a).toEqual(b)
    expect(comparable({ ...a, includes: ['S1'] })).not.toEqual(a)
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a version plan comes into the store from the seed, a change of plan carries its why, and a bad entry is reported without ending the import',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('#1431: version plans in the store', () => {
  let pool: Pool
  let db: PoolClient
  let first: VersionSummary
  let second: VersionSummary
  const seed = (v: Partial<SeedVersion> = {}): VersionSeed => ({ versions: [{ ...GOOD, ...v }] })
  const tool = async (name: string, args: Record<string, unknown>) => (await runTool(db, name, args)).text

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'versions-test')
    for (const f of ['F920', 'F921']) {
      await db.query(`select knowledge.record($1::jsonb, 'test')`, [
        JSON.stringify({ id: f, kind: 'feature', answer: `${f} title`, status: 'approved', audience: 'members', departments: [] }),
      ])
      await db.query(`select knowledge.add_slice($1, $2, 'now', 1, 'test', '{}', 'planned', $3)`, [f, `${f} slice`, `${f}-S1`])
    }
    first = await loadVersions(db, seed(), 'abcdef1')
    second = await loadVersions(db, seed(), 'abcdef1')
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  it('records the version, and plan reads it back with what is in, what is left out and why', async () => {
    expect(first).toEqual({ recorded: 1, replanned: 0, unchanged: 0, problems: [] })
    const plan = await tool('plan', { version: 'VN-0900' })
    expect(plan).toContain('Test beta')
    expect(plan).toContain('For: The town opens.')
    expect(plan).toContain('F920-S1')
    expect(plan).toContain('Not needed to open.')
    const { rows } = await db.query<{ due: string; status: string }>(
      `select due_on::text as due, status from knowledge.records where id = 'VN-0900'`,
    )
    expect(rows[0]).toEqual({ due: '2027-01-06', status: 'planned' })
  })

  it('changes nothing when run again', () => {
    expect(second).toEqual({ recorded: 0, replanned: 0, unchanged: 1, problems: [] })
  })

  it('refuses a changed plan that gives no why, and leaves the store as it was', async () => {
    const moved = { includes: ['F920-S1', 'F921-S1'], leaves_out: [] }
    const r = await loadVersions(db, seed(moved), 'abcdef2')
    expect(r.replanned).toBe(0)
    expect(r.problems[0]).toContain("VN-0900: the seed's plan differs from the store's and says no why")
    expect(await tool('plan', { version: 'VN-0900' })).toContain('Not needed to open.')
  })

  it('changes the plan when the seed says why and names the outcome, and plan_changes shows it', async () => {
    const moved = { includes: ['F920-S1', 'F921-S1'], leaves_out: [], changed: { why: 'It turned out to be needed to open.', outcome: 'The town opens' } }
    const r = await loadVersions(db, seed(moved), 'abcdef3')
    expect(r).toEqual({ recorded: 0, replanned: 1, unchanged: 0, problems: [] })
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from knowledge.history where record_id = 'VN-0900'`)
    expect(rows[0].n).toBe(2)
    expect(await tool('plan', { version: 'VN-0900' })).toContain('It turned out to be needed to open. [outcome: The town opens]')
    // The same seed again is the plan as it stands: no second change.
    expect(await loadVersions(db, seed(moved), 'abcdef3')).toEqual({ recorded: 0, replanned: 0, unchanged: 1, problems: [] })
  })

  it('reports a slice or condition the store does not hold, and writes nothing for that version', async () => {
    const r = await loadVersions(db, seed({ id: 'VN-0901', includes: ['F999-S1'], leaves_out: [{ slice: 'F921-S1', reason: 'r', condition: 'CN-9999' }] }), 'abcdef4')
    expect(r.recorded).toBe(0)
    expect(r.problems).toEqual([
      'VN-0901: F999-S1 is not a slice in the store; not written',
      'VN-0901: CN-9999 is not a condition in the store; not written',
    ])
    const { rows } = await db.query(`select 1 from knowledge.records where id = 'VN-0901'`)
    expect(rows).toHaveLength(0)
  })

  it('writes nothing for an entry with a problem, and still writes the good one beside it', async () => {
    const r = await loadVersions(db, { versions: [{ ...GOOD, id: 'VN-0902', ruled_by: [] }, { ...GOOD, id: 'VN-0903' }] }, 'abcdef5')
    expect(r.recorded).toBe(1)
    expect(r.problems).toEqual(['VN-0902: it names the rulings it rests on (ruled_by)'])
    const { rows } = await db.query<{ id: string }>(`select id from knowledge.records where id in ('VN-0902', 'VN-0903')`)
    expect(rows.map((x) => x.id)).toEqual(['VN-0903'])
  })
})
