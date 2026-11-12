import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  readMapSeed, readRollup, readWalkthroughs, rollupStatus, walkthroughJourney, inferPlace, loadMaps,
  type Walkthrough, type MapSummary, type RollupFeature,
} from '../scripts/knowledge/maps'
import { runTool } from '@/lib/knowledge/tools'
import { phone, plain, PHONE_LINES } from '@/lib/knowledge/maps'

// F132 (#1256): today's story maps come in (scripts/knowledge/maps.ts), and
// the lookup tool's story_map, fits, place_on_map and propose_map_change verbs
// read them back. The store's own rules are tested in SQL:
// supabase/tests/knowledge_maps.sql.
//
// The walk-throughs are a fixture here, in uat-journeys.json's shape, so the
// test does not move when socialus-plan does; the seed and the roll-up are
// this repo's own.

const WALKS: Walkthrough[] = [
  {
    id: 'J90', title: 'Report a post and watch it hide', role: 'a member', minutes: 3,
    look: ['Report is on the menu of a post', 'After Send the sheet closes with a thank-you', 'Open the Page signed out: it is already hidden'],
    criteria: ['F078.9', 'F078.1', 'F058.1'],
  },
  {
    id: 'J91', title: 'Sign up from a Sacramento zip', role: 'signed out (private tab)', minutes: 3,
    look: ['Sign up asks for a zip', 'A Sacramento zip lands you in the market'],
    criteria: ['F081.1', 'F103.2'],
  },
]

const seed = readMapSeed()
const rollup = readRollup()

describe('reading the sources', () => {
  it('turns a walk-through into a journey: one activity, its look lines as tasks in order', () => {
    const j = walkthroughJourney(WALKS[0])
    expect(j.id).toBe('JY-J90')
    expect(j.activities).toHaveLength(1)
    expect(j.activities[0].tasks.map((t) => t.answer)).toEqual(WALKS[0].look)
  })

  it('reads a built feature\'s state from the roll-up', () => {
    const f = (n: number, shipped: number, retired = false) =>
      ({ feature: 'F1', title: 't', retired, n, totals: { shipped: { yes: shipped } }, criteria: [] }) as RollupFeature
    expect(rollupStatus(f(5, 5))).toBe('shipped')
    expect(rollupStatus(f(5, 2))).toBe('building')
    expect(rollupStatus(f(5, 0))).toBe('approved')
    expect(rollupStatus(f(5, 5, true))).toBe('dropped')
  })

  it('places a walk-through feature on the line that shares most words with its criteria', () => {
    const f = { feature: 'F058', title: 'a member reports something', retired: false, n: 1, totals: { shipped: { yes: 1 } },
                criteria: [{ id: '1', text: 'Report is on the menu of every post' }] } as RollupFeature
    expect(inferPlace(f, 'F058', WALKS)).toBe('JY-J90.A1.T1')
    expect(inferPlace(undefined, 'F999', WALKS)).toBeNull()
  })

  // [guards F132.6 partial: the seed's coverage; that each lands in the store is the database test below]
  it('the seed places every built feature in the roll-up that no walk-through names, and every IMAGINE idea', () => {
    const ids = Object.keys(seed.ideas)
    expect(ids).toEqual(Array.from({ length: 41 }, (_, i) => `CO-${String(i + 3).padStart(4, '0')}`))
    for (const [id, idea] of Object.entries(seed.ideas)) expect(idea.name, id).toBeTruthy()
    for (const f of ['F063', 'F064', 'F104', 'F105', 'F114', 'F119']) expect(f in seed.features, f).toBe(true)
  })
})

describe('phone-sized answers', () => {
  // [guards F132.8]
  it('keeps an answer to one phone screen, in plain words, with no ticket numbers', () => {
    const long = Array.from({ length: 30 }, (_, i) => `Line ${i} about F078.9 and CO-0038 (#1256) and T142`)
    const out = phone(long)
    expect(out.split('\n')).toHaveLength(PHONE_LINES)
    expect(out).not.toMatch(/\bF\d{3}|CO-\d{4}|#\d+|\bT\d{3}/)
    expect(plain('Holiday specials (CO-0038) stand on F072.')).toBe('Holiday specials stand on.')
    expect(phone(['x'.repeat(400)]).length).toBeLessThanOrEqual(220)
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the story maps come into the store, every feature and idea is placed, and the map verbs answer on a phone screen',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})


// The real walk-throughs too, from socialus-plan (pinned in CI, the sibling
// repo locally), so a wrong path or a changed file shape goes red. Loaded in
// the same transaction as the fixture: one held transaction, not two, since
// every suite's role grant waits on it.
const PLAN = resolve(process.env.KNOWLEDGE_PLAN_DIR ?? '../socialus-plan')
const HAVE_WALKS = existsSync(resolve(PLAN, 'planning/uat-journeys.json'))
const walks = HAVE_WALKS ? readWalkthroughs(PLAN) : []

describe.skipIf(!RUNNABLE)('F132: story maps in the store', { timeout: 30_000 }, () => {
  let pool: Pool
  let db: PoolClient
  let first: MapSummary
  let second: MapSummary
  let real: MapSummary
  const tool = async (name: string, args: Record<string, unknown>) => (await runTool(db, name, args)).text

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'maps-test')
    // The ideas, as the concepts import records them: by name, in order.
    // Given ids, so no id is drawn from the shared counter while other suites run.
    for (const [n, idea] of Object.values(seed.ideas).entries()) {
      await db.query('select knowledge.record($1::jsonb, $2)', [
        JSON.stringify({ id: `CO-${9000 + n}`, kind: 'concept', answer: idea.name, status: 'idea', audience: 'department', departments: ['building'] }),
        'F132 test',
      ])
    }
    // A planned feature from today's scenarios, which no map holds yet.
    await db.query(`select knowledge.record('{"id":"F995","kind":"feature","answer":"Something planned","status":"approved","audience":"department","departments":["building"]}', 't')`)
    first = await loadMaps(db, { seed, walkthroughs: WALKS, rollup })
    second = await loadMaps(db, { seed, walkthroughs: WALKS, rollup })
    if (HAVE_WALKS) real = await loadMaps(db, { seed, walkthroughs: walks, rollup })
  }, 60_000)

  afterAll(async () => {
    await db?.query('rollback').catch(() => {})
    db?.release()
    await pool?.end()
  })

  // [guards F132.7]
  it('loads the first map: five activities, their tasks and details, and two slices named by outcome', async () => {
    const { rows } = await db.query<{ m: { activities: { answer: string; tasks: { answer: string; details: unknown[] }[] }[]; slices: { outcome: string; takes: string[] }[] } }>(
      `select knowledge.map_of('JY-WEEKEND') as m`,
    )
    const m = rows[0].m
    expect(m.activities.map((a) => a.answer)).toEqual(['Find out', 'Choose', 'Commit', 'Go', 'After'])
    expect(m.activities.map((a) => a.tasks[0].answer)).toEqual([
      'Open the app and see this weekend nearby', 'Open one and read what, when, where and who', 'Say "I\'m going"', 'Get there', 'Say how it went',
    ])
    expect(m.activities.map((a) => a.tasks[0].details.length)).toEqual([4, 4, 4, 3, 5])
    expect(m.slices.map((s) => s.outcome)).toEqual([
      'A neighbour finds one thing this weekend and turns up', 'They come back next weekend, and bring someone',
    ])
    // The walking skeleton takes the top detail under every task.
    expect(m.slices[0].takes).toEqual(['JY-WEEKEND.A1.T1.D1', 'JY-WEEKEND.A2.T1.D1', 'JY-WEEKEND.A3.T1.D1', 'JY-WEEKEND.A4.T1.D1', 'JY-WEEKEND.A5.T1.D1'])
  })

  it('brings today in: walk-throughs become journeys, every built feature and every idea is placed', async () => {
    expect(first.problems).toEqual([])
    expect(await loadMaps(db, { seed, walkthroughs: [], rollup })).toMatchObject({
      problems: ['no walk-throughs found (planning/uat-journeys.json): none became journeys'],
    })
    const { rows: walks } = await db.query<{ id: string; tasks: number }>(
      `select j.id, (select count(*) from knowledge.records t where t.parent = j.id || '.A1')::int as tasks
         from knowledge.records j where j.id in ('JY-J90', 'JY-J91') order by j.id`,
    )
    expect(walks).toEqual([{ id: 'JY-J90', tasks: 3 }, { id: 'JY-J91', tasks: 2 }])
    const { rows: unplaced } = await db.query<{ id: string }>(
      `select f from unnest($1::text[]) f where not exists (select 1 from knowledge.current_placements p where p.item_id = f)`,
      [rollup.map((f) => f.feature).filter((f) => f in seed.features || WALKS.some((w) => w.criteria.some((c) => c.startsWith(`${f}.`))))],
    )
    expect(unplaced).toEqual([])
    const { rows: ideas } = await db.query<{ n: number; none: number }>(
      `select count(*)::int as n, count(*) filter (where p.on_id is null)::int as none
         from knowledge.current_placements p join knowledge.records c on c.id = p.item_id where c.kind = 'concept'`,
    )
    expect(ideas[0].n).toBe(41)
    expect(ideas[0].none).toBeGreaterThan(0)
    // A planned feature no map holds is listed, not guessed.
    expect(first.unplaced).toContain('F995')
  })

  it('records nothing the second time', () => {
    expect(second.items + second.slices + second.features + second.placed).toBe(0)
  })

  // [guards F132.2]
  it('story_map answers up and down for any item, in one call', async () => {
    const t = await tool('story_map', { item: 'JY-WEEKEND.A1.T1' })
    expect(t).toMatch(/In: "A neighbour finds something happening this weekend and goes" › Find out/)
    expect(t).toMatch(/Around it: after, Open one and read what, when, where and who \(/)
    expect(t).toMatch(/Made of: List of events near me, soonest first \(/)
    expect(t).toMatch(/Features: .*What's happening, today and this week/)
    const j = await tool('story_map', { item: 'A neighbour finds something happening this weekend and goes' })
    expect(j.split('\n')[1]).toMatch(/^Find out: Open the app and see this weekend nearby \(/)
  })

  // [guards F132.3]
  it('every task shows which slices include it and whether it is built', async () => {
    const t = await tool('story_map', { item: 'JY-WEEKEND.A3.T1' })
    expect(t).toMatch(/Slices: "A neighbour finds one thing this weekend and turns up", next, planned, takes part of it; "They come back next weekend, and bring someone", later, planned, takes part of it/)
    expect(t).toMatch(/: a task, (built|part built|not built)\./)
  })

  // [guards F132.4]
  it('proposing a change answers with the journey, slices, features and what is built, before it is decided', async () => {
    const t = await tool('propose_map_change', { id: 'JY-WEEKEND.A1.T1.D1', changes: { answer: 'This weekend near me, soonest first' }, reason: 'Shorter' })
    expect(t).toMatch(/^Proposal \d+: answer to "This weekend near me, soonest first". Not decided yet./)
    expect(t).toMatch(/In: "A neighbour finds something happening this weekend and goes" › Find out › Open the app/)
    expect(t).toMatch(/Slices: "A neighbour finds one thing/)
    expect(t).toMatch(/Features: What's happening/)
    const { rows } = await db.query<{ answer: string }>(`select answer from knowledge.records where id = 'JY-WEEKEND.A1.T1.D1'`)
    expect(rows[0].answer).toBe('List of events near me, soonest first')
  })

  // [guards F132.5]
  it('holiday specials: where it fits, what it stands on, what comes first, and what it clashes with', async () => {
    const t = await tool('fits', { idea: 'holiday specials' })
    const lines = t.split('\n')
    expect(lines[0]).toBe('"Holiday specials up front" fits under "Find out" in the journey "A neighbour finds something happening this weekend and goes", next to "Open the app and see this weekend nearby".')
    expect(lines[1]).toMatch(/^Stands on: a Page owner announces something, with a time on it \(/)
    expect(lines[2]).toBe('Must be built first: A "special" kind of post')
    expect(lines[3]).toBe('Clashes with: nothing, as judged when it was placed')
    const none = await tool('fits', { idea: 'a chess ladder for retirees' })
    expect(none).toMatch(/^"a chess ladder for retirees": no journey yet/)
    // A new idea nobody placed: where it fits, what is built there, what is not, and the live rules it may clash with.
    await db.query(`select knowledge.record('{"id":"PH-9001","kind":"philosophy","answer":"A calendar belongs to the member: nothing is added to it without asking","why":"Trust.","status":"live","audience":"department","departments":["building"]}', 'F132 test')`)
    const guessed = (await tool('fits', { idea: 'add to calendar' })).split('\n')
    expect(guessed[0]).toBe('"add to calendar" fits under "Commit" in the journey "A neighbour finds something happening this weekend and goes", next to "Add to calendar".')
    expect(guessed[1]).toMatch(/^Stands on: /)
    expect(guessed[2]).toMatch(/^Must be built first: nothing named; not built there yet: /)
    expect(guessed[3]).toBe('Clashes with: not judged yet; may clash with: A calendar belongs to the member: nothing is added to it without asking')
  })

  // [guards F132.8]
  it('every answer fits a phone screen and names no ticket', async () => {
    for (const [name, args] of [
      ['story_map', {}], ['story_map', { item: 'JY-WEEKEND' }], ['story_map', { item: 'JY-WEEKEND.A5.T1' }],
      ['fits', { idea: 'holiday specials' }], ['fits', { idea: 'two-way ratings' }],
    ] as const) {
      const t = await tool(name, args)
      expect(t.split('\n').length, `${name} ${JSON.stringify(args)}`).toBeLessThanOrEqual(PHONE_LINES)
      expect(t, `${name} ${JSON.stringify(args)}`).not.toMatch(/\bF\d{3}\b|CO-\d{4}|#\d+/)
    }
  })

  // [guards F132.6]
  it('each walk-through is a journey, each built feature sits on a task or says no journey yet, each idea is placed', async () => {
    expect(HAVE_WALKS, `planning/uat-journeys.json in a socialus-plan checkout at ${PLAN} (set KNOWLEDGE_PLAN_DIR)`).toBe(true)
    expect(walks.length).toBeGreaterThan(0)
    expect(real.problems).toEqual([])
    const { rows } = await db.query<{ id: string; tasks: number }>(
      `select j.id, (select count(*) from knowledge.records t where t.parent = j.id || '.A1' and t.kind = 'task')::int as tasks
         from knowledge.records j where j.kind = 'journey' and j.id = any($1::text[]) order by j.id`,
      [walks.map((w) => `JY-${w.id}`)],
    )
    expect(rows).toEqual(walks.map((w) => ({ id: `JY-${w.id}`, tasks: w.look.length })).sort((a, b) => a.id.localeCompare(b.id)))
    const { rows: unplaced } = await db.query<{ f: string }>(
      `select f from unnest($1::text[]) f where not exists (select 1 from knowledge.current_placements p where p.item_id = f) order by f`,
      [rollup.map((f) => f.feature)],
    )
    expect(unplaced).toEqual([])
    const { rows: ideas } = await db.query<{ n: number }>(
      `select count(*)::int as n from knowledge.current_placements p join knowledge.records c on c.id = p.item_id where c.kind = 'concept'`,
    )
    expect(ideas[0].n).toBe(Object.keys(seed.ideas).length)
  }, 30_000)
})
