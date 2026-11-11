import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  readPlannedScenarios, parseDepends, parseHorizon, sliceStatus, loadPlans, type PlanSummary,
} from '../scripts/knowledge/plans'
import { runTool } from '@/lib/knowledge/tools'

// F127 (#1238): today's plan comes in from the scenarios' frontmatter
// (scripts/knowledge/plans.ts), and the lookup tool's plan, plan_changes and
// roadmap verbs read it back. The store's own rules are tested in SQL:
// supabase/tests/knowledge_plans.sql.
//
// The plan side is a fixture written here, in the frontmatter shape the
// scenarios carry, so the test does not move when socialus-plan does.

const scenario = (id: string, fm: string) => `---\nid: ${id}\ntitle: ${id} title\n${fm}---\n\n# ${id}\n`

function writePlan(dir: string, files: Record<string, string>) {
  mkdirSync(join(dir, 'planning'), { recursive: true })
  for (const [id, fm] of Object.entries(files)) writeFileSync(join(dir, 'planning', `scenario-${id}.md`), scenario(id, fm))
}

const TODAY = {
  F910: 'status: approved\nhorizon: now\nrank: 2\ndepends: F911\n',
  F911: 'status: building\nhorizon: now\nrank: 1\n',
  F912: 'status: approved\nhorizon: next\nrank: 1\ndepends: [F910, F911]\n',
  F913: 'status: approved\nhorizon: later\n',
  F914: 'status: draft\n',
}

const MOVED = { ...TODAY, F913: 'status: approved\nhorizon: next\nrank: 2\n', F911: 'status: shipped\nhorizon: now\nrank: 1\n' }

describe('reading the frontmatter', () => {
  it('reads status, horizon, rank and depends, in both list shapes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'f127-'))
    writePlan(dir, TODAY)
    const s = readPlannedScenarios(dir)
    expect(s.map((x) => `${x.id} ${x.horizon} ${x.rank}`)).toEqual([
      'F910 now 2', 'F911 now 1', 'F912 next 1', 'F913 later null', 'F914 null null',
    ])
    expect(s.find((x) => x.id === 'F912')!.depends).toEqual(['F910', 'F911'])
    expect(parseDepends('none')).toEqual([])
    expect(parseHorizon('Next')).toBe('next')
    expect(parseHorizon('soon')).toBeNull()
    expect(sliceStatus('shipped')).toBe('shipped')
    expect(sliceStatus('cut')).toBe('withdrawn')
    expect(sliceStatus('approved')).toBe('planned')
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "each scenario comes into the store as a feature with one slice, Now / Next / Later reads from it, and the plan verbs answer",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F127: plans in the store', () => {
  let pool: Pool
  let db: PoolClient
  const dir = mkdtempSync(join(tmpdir(), 'f127-db-'))
  let first: PlanSummary
  let second: PlanSummary
  let moved: PlanSummary

  const tool = async (name: string, args: Record<string, unknown>) => (await runTool(db, name, args)).text

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'plans-test')
    writePlan(dir, TODAY)
    first = await loadPlans(db, readPlannedScenarios(dir), 'abcdef1')
    second = await loadPlans(db, readPlannedScenarios(dir), 'abcdef1')
    writePlan(dir, MOVED)
    moved = await loadPlans(db, readPlannedScenarios(dir), 'abcdef2')
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F127.7]
  it("brings each scenario in as a feature with one slice carrying its horizon and rank, and Now / Next / Later reads from the store", async () => {
    expect(first).toMatchObject({ features: 5, slices: 4, moved: 0 })
    expect(first.skipped).toEqual(['F914: no horizon in its frontmatter, so no place on Now / Next / Later'])
    expect(first.depends).toBe(3)
    // Re-running changes nothing.
    expect(second).toMatchObject({ features: 0, slices: 0, moved: 0, statusChanged: 0, depends: 0 })
    // A move in the frontmatter is a move of the slice, and a shipped scenario leaves the lanes.
    expect(moved).toMatchObject({ features: 0, slices: 0, moved: 1, statusChanged: 1 })
    const { rows } = await db.query<{ horizon: string; slice: string }>('select horizon, slice from knowledge.roadmap()')
    expect(rows.map((r) => `${r.horizon}:${r.slice}`)).toEqual(['now:F910-S1', 'next:F912-S1', 'next:F913-S1'])
    const { rows: hist } = await db.query('select count(*)::int as n from knowledge.history where record_id = $1', ['F913-S1'])
    expect(hist[0].n).toBe(2)
    const { rows: links } = await db.query(
      `select to_id from knowledge.links where from_id = 'F912' and type = 'depends_on' order by to_id`,
    )
    expect(links.map((l) => l.to_id)).toEqual(['F910', 'F911'])
    // A horizon taken away is reported, never guessed.
    writePlan(dir, { ...MOVED, F910: 'status: approved\n' })
    const gone = await loadPlans(db, readPlannedScenarios(dir), 'abcdef3')
    expect(gone.problems).toEqual([
      'F910: its frontmatter no longer has a horizon, but its slice F910-S1 is still on now; give it a horizon again, or withdraw the slice',
    ])
    expect(await tool('roadmap', {})).toBe('Now (1):\n- 2 F910-S1 F910 title\nNext (2):\n- 1 F912-S1 F912 title\n- 2 F913-S1 F913 title\nLater (0):')
  })

  // [guards F127.5 partial: the store's one call each is supabase/tests/knowledge_plans.sql; this is the lookup tool's]
  it('answers what a version held on a date and what changed, with the whys, through the lookup tool', async () => {
    await db.query(`select knowledge.add_slice('F912', 'Pre-orders by card', 'later', 1, 'test')`)
    const { rows } = await db.query(
      `select knowledge.plan_version($1::jsonb, 'test', null, '2026-11-01') as id`,
      [JSON.stringify({ answer: 'Beta for sellers', why: 'Sellers first.', outcomes: ['More Pages'], appetite: 'Six weeks',
                        includes: ['F910-S1'], leaves_out: [{ slice: 'F912-S2', reason: 'Card payments are not ready.' }] })],
    )
    const id = rows[0].id
    await db.query(`select knowledge.replan($1, $2::jsonb, 'Getting sellers paid.', 'First sales', null, '2026-11-10')`, [
      id,
      JSON.stringify({ outcomes: ['First sales'], appetite: 'Six weeks', includes: ['F910-S1', 'F912-S2'] }),
    ])
    const before = await tool('plan', { version: 'beta for sellers', on: '2026-11-05' })
    expect(before).toContain('For: More Pages.')
    expect(before).toContain('Card payments are not ready.')
    const now = await tool('plan', { version: id })
    expect(now).toContain('For: First sales.')
    expect(now).toContain('Getting sellers paid. [outcome: First sales]')
    const changes = await tool('plan_changes', { from: '2026-11-05', to: '2026-11-10' })
    expect(changes).toContain('Getting sellers paid. [outcome: First sales]')
    expect(changes).toContain('outcomes More Pages -> First sales; in: F912-S2; no longer left out: F912-S2')
    expect(await tool('plan_changes', { from: '2026-11-10' })).toBe('No change of plan after 2026-11-10.')
    expect((await runTool(db, 'plan', { version: 'nope' })).isError).toBe(true)
  })
})
