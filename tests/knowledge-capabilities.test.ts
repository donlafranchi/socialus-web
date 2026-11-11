import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  readWords, readRollup, decide, failingRoutes, routeNames, loadCapabilities, renderPack, packBody, sourceOf, tonightsFailures,
  type Rollup, type WordLine, type StoreFeature,
} from '../scripts/knowledge/capabilities'
import { renderAnswer, wordCount, type CapabilityLine } from '@/lib/knowledge/capabilities'
import { runTool } from '@/lib/knowledge/tools'

// F129 (#1239): what SocialUs can and can't do. The generator
// (scripts/knowledge/capabilities.ts), the hand-kept words
// (scripts/knowledge/capability-words.json), the lookup tool's can_do verb
// and the pack. The store's own rules are tested in SQL:
// supabase/tests/knowledge_capabilities.sql.
//
// A small roll-up is a fixture here, so the test does not move when the
// criteria reports do; the words file is the real one.

const crit = (id: string, shipped: string, checked: string, smoked: string) => ({ id, status: 'active', shipped, checked, smoked })
const ROLLUP: Rollup = {
  as_of: '2026-11-06',
  features: [
    { feature: 'F960', title: 'posting events', retired: false, criteria: [crit('1', 'yes', 'yes', 'yes'), crit('2', 'yes', 'yes', 'unknown')] },
    { feature: 'F961', title: 'repeating events', retired: false, criteria: [crit('1', 'yes', 'no', 'unknown'), crit('2', 'no', 'no', 'no')] },
    { feature: 'F962', title: 'old', retired: true, criteria: [crit('1', 'yes', 'yes', 'yes')] },
  ],
}
const line = (over: Partial<WordLine>): WordLine => ({ feature: 'F960', criteria: ['1', '2'], who: ['runner'], words: 'Post an event', routes: ['page'], ...over })
const none = new Set<string>()

describe('which lines are "can"', () => {
  // [guards F129.3]
  it('lists a line as can only when every criterion it names is shipped, checked and not unsmoked, and the live smoke passes', () => {
    const p: string[] = []
    expect(decide(line({}), ROLLUP, null, none, p).status).toBe('can')
    // Shipped but not checked: not possible yet.
    expect(decide(line({ feature: 'F961', criteria: ['1'] }), ROLLUP, null, none, p)).toEqual({
      status: 'cant_yet', why: 'Live, but not yet proven by its checks.', waitsOn: null,
    })
    // Not shipped.
    expect(decide(line({ feature: 'F961', criteria: ['2'] }), ROLLUP, null, none, p).why).toBe('Not built yet.')
    const builtNotLive: Rollup = { ...ROLLUP, features: [{ ...ROLLUP.features[1], criteria: [{ ...crit('2', 'no', 'no', 'no'), built: 'yes' }] }] }
    expect(decide(line({ feature: 'F961', criteria: ['2'] }), builtNotLive, null, none, p).why).toBe('Built, not live yet.')
    // A smoke marked "no" for a criterion keeps it off "can".
    const smokedNo: Rollup = { ...ROLLUP, features: [{ ...ROLLUP.features[0], criteria: [crit('1', 'yes', 'yes', 'no')] }] }
    expect(decide(line({ criteria: ['1'] }), smokedNo, null, none, p).status).toBe('cant_yet')
    // A retired feature proves nothing.
    expect(decide(line({ feature: 'F962', criteria: ['1'] }), ROLLUP, null, none, p).status).toBe('cant_yet')
    expect(p).toEqual(['F962 "Post an event": neither the roll-up nor the store holds this feature'])
    // A feature the roll-up does not hold is read from its F127 slices.
    const shipped: StoreFeature = { status: 'approved', slices: [{ id: 'F970-S1', status: 'shipped' }], waitsOn: null }
    expect(decide(line({ feature: 'F970', criteria: undefined }), ROLLUP, shipped, none, []).status).toBe('can')
    const planned: StoreFeature = { status: 'approved', slices: [{ id: 'F970-S1', status: 'planned' }], waitsOn: null }
    expect(decide(line({ feature: 'F970', criteria: undefined }), ROLLUP, planned, none, []).status).toBe('cant_yet')
  })

  // [guards F129.7]
  it('moves a can line to can\'t right now when tonight\'s live smoke names its route, and back when it passes', () => {
    const known = routeNames()
    const tonight = failingRoutes('```\nmember › page: page errored: 500\nsignedOut › nonsense-word: x\n```', known)
    expect([...tonight]).toEqual(['page'])
    const v = decide(line({}), ROLLUP, null, tonight, [])
    expect(v.status).toBe('cant_now')
    expect(v.why).toContain('the page screen')
    expect(decide(line({ routes: ['explore'] }), ROLLUP, null, tonight, []).status).toBe('can')
    expect(decide(line({}), ROLLUP, null, none, []).status).toBe('can')
  })

  it("reads tonight's failures from the smoke's own newest report, and a green run after it clears them", () => {
    const body = { at: '2026-11-09T10:50:00Z', body: 'The overnight live smoke failed:\n```\nmember › explore: x\n```' }
    const again = { at: '2026-11-10T10:50:00Z', body: 'Again: run\n```\nmember › page: y\n```' }
    expect(tonightsFailures([again, body], null)).toBe(again)
    expect(tonightsFailures([body], null)).toBe(body)
    // A pass after the newest report: nothing is failing tonight.
    expect(tonightsFailures([body, again], '2026-11-11T10:55:00Z')).toBeNull()
    // A pass before it changes nothing.
    expect(tonightsFailures([body, again], '2026-11-09T11:00:00Z')).toBe(again)
    expect(tonightsFailures([], null)).toBeNull()
  })

  // [guards F129.4 partial: the condition's own words in the answer are checked against the store below]
  it("says why a line can't be done yet: the condition it waits on, or not planned", () => {
    const parked: StoreFeature = { status: 'approved', slices: [{ id: 'F970-S1', status: 'planned' }], waitsOn: { id: 'CN-0009', answer: 'Card payments work' } }
    expect(decide(line({ feature: 'F970', criteria: undefined }), ROLLUP, parked, none, [])).toEqual({ status: 'cant_yet', why: null, waitsOn: 'CN-0009' })
    expect(decide(line({ notPlanned: true }), ROLLUP, null, none, []).status).toBe('not_planned')
    const dropped: StoreFeature = { status: 'dropped', slices: [], waitsOn: null }
    expect(decide(line({}), ROLLUP, dropped, none, []).status).toBe('not_planned')
  })
})

describe('the words', () => {
  const words = readWords()
  const rollup = readRollup()
  const known = routeNames()

  it('names only criteria the roll-up holds as active, and routes the smoke knows', () => {
    for (const l of words) {
      const f = rollup.features.find((x) => x.feature === l.feature && !x.retired)
      expect(f, `${l.feature} is in the roll-up`).toBeTruthy()
      for (const c of l.criteria ?? []) expect(f!.criteria.find((x) => x.id === c && x.status === 'active'), `${l.feature}.${c}`).toBeTruthy()
      for (const r of l.routes ?? []) expect(known.has(r), `route ${r}`).toBe(true)
    }
    expect(new Set(words.map(sourceOf)).size).toBe(words.length)
  })

  // [guards F129.2]
  it('is plain and brief: one line per thing, no ticket or scenario numbers, the whole answer under 1,500 words', () => {
    // Every line at its longest: can't yet with a long reason, for all three kinds of person.
    const worst: CapabilityLine[] = words.map((l, i) => ({
      id: `CA-${i}`, who: l.who, words: l.words, status: 'cant_yet', feature: l.feature,
      why: 'Live, but not yet proven by its checks.', waits_on: null, waits_on_words: null,
    }))
    const answer = renderAnswer(worst)
    expect(wordCount(answer)).toBeLessThan(1500)
    for (const l of words) {
      expect(l.words, l.words).not.toMatch(/\b[FT]\d{2,}\b|#\d+|`|\bCN-\d+/)
      expect(l.words.split(/\s+/).length, l.words).toBeLessThanOrEqual(20)
      expect(l.words, 'no em dashes').not.toMatch(/—/)
    }
    // The only ids in the answer are the bracketed feature links at the end of each line.
    for (const row of answer.split('\n').filter((x) => x.startsWith('- '))) {
      expect(row.replace(/ \[F\d+\]$/, '')).not.toMatch(/\bF\d{2,}\b/)
    }
  })
})

describe('the pack', () => {
  // [guards F129.6 partial: pushing it to socialus-plan is the workflow's, with the token secret]
  it('is the same answer as one Markdown file, and a change of date alone is not a change', () => {
    const lines: CapabilityLine[] = [
      { id: 'CA-1', who: ['runner'], words: 'Post an event', status: 'can', why: null, feature: 'F960', waits_on: null, waits_on_words: null },
    ]
    const a = renderPack(lines, '2026-11-11')
    const b = renderPack(lines, '2026-11-12')
    expect(a.startsWith("# What SocialUs can and can't do\n")).toBe(true)
    expect(a).toContain('- Post an event [F960]')
    expect(packBody(a)).toBe(packBody(b))
    const c = renderPack([{ ...lines[0], status: 'cant_now', why: 'The overnight check found a problem.' }], '2026-11-12')
    expect(packBody(c)).not.toBe(packBody(a))
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'what SocialUs can do is kept in the store nightly and read back as one short answer by who is asking',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F129: what SocialUs can do, in the store', () => {
  let pool: Pool
  let db: PoolClient
  const WORDS: WordLine[] = [
    { feature: 'F960', criteria: ['1', '2'], who: ['runner'], words: 'Post an event from your Page', routes: ['page'] },
    { feature: 'F960', criteria: ['1'], who: ['visitor', 'member'], words: 'See what is on near you', routes: ['explore'] },
    { feature: 'F961', criteria: ['1'], who: ['runner'], words: 'Make an event repeat every week', routes: ['page'] },
    { feature: 'F971', slice: 'F971-S1', who: ['runner'], words: 'Take card pre-orders' },
    { feature: 'F960', criteria: ['2'], who: ['member'], words: 'Barter', notPlanned: true },
  ]

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'capabilities-test')
    const { rows } = await db.query(
      `select knowledge.record('{"kind":"condition","concern":"payments","answer":"Card payments work","why":"Pre-orders need them.","owner":"the PM","audience":"public"}', 'test') as id`,
    )
    await db.query(`select knowledge.record('{"id":"F971","kind":"feature","answer":"Pre-orders","status":"approved","audience":"department","departments":["building"]}', 'test')`)
    await db.query(`select knowledge.add_slice('F971', 'Card pre-orders', 'later', 1, 'test', $1::text[], 'planned', 'F971-S1')`, [[rows[0].id]])
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F129.1]
  // [guards F129.5]
  it('answers in one call, by who is asking, with each line linked to its feature', async () => {
    const first = await loadCapabilities(db, { words: WORDS, rollup: ROLLUP, failing: new Set() })
    expect(first).toMatchObject({ lines: 5, featuresMade: 2, withdrawn: 0, problems: [] })
    expect(first.changed).toHaveLength(5)
    const again = await loadCapabilities(db, { words: WORDS, rollup: ROLLUP, failing: new Set() })
    expect(again.changed).toEqual([])

    const runner = (await runTool(db, 'can_do', { who: 'runner' })).text
    expect(runner).toContain('Someone who runs a Page or an event can:\n- Post an event from your Page [F960]')
    expect(runner).toContain("Can't yet:\n- Make an event repeat every week (Live, but not yet proven by its checks) [F961]")
    expect(runner).toContain('- Take card pre-orders (waiting on: Card payments work) [F971]')
    expect(runner).not.toContain('See what is on near you')
    const visitor = (await runTool(db, 'can_do', { who: 'visitor' })).text
    expect(visitor).toContain('Someone without an account can:\n- See what is on near you [F960]')
    const member = (await runTool(db, 'can_do', { who: 'member' })).text
    expect(member).toContain('- Barter (not planned) [F960]')
    const all = (await runTool(db, 'can_do', {})).text
    for (const head of ['Someone without an account can:', 'A member can:', 'Someone who runs a Page or an event can:']) expect(all).toContain(head)
    // Each kind of person sees only their own lines.
    expect(all).toContain('Someone without an account can:\n- See what is on near you [F960]\n\nA member can:')
    expect((await runTool(db, 'can_do', { who: 'owner' })).isError).toBe(true)
  })

  // [guards F129.4]
  it("names the condition a can't-yet line waits on, and lists the line as can once its slice ships", async () => {
    await db.query(`select knowledge.revise('F971-S1', '{"status":"shipped"}', 'test: shipped')`)
    const sum = await loadCapabilities(db, { words: WORDS, rollup: ROLLUP, failing: new Set() })
    expect(sum.changed.map((c) => `${c.words} ${c.status}`)).toEqual(['Take card pre-orders can'])
    expect((await runTool(db, 'can_do', { who: 'runner' })).text).toContain('can:\n- Post an event from your Page [F960]\n- Take card pre-orders [F971]')
  })

  it("moves a line to can't right now on a failing smoke, back when it passes, and withdraws a line no longer listed", async () => {
    let sum = await loadCapabilities(db, { words: WORDS, rollup: ROLLUP, failing: new Set(['page']) })
    expect(sum.changed.map((c) => c.status)).toEqual(['cant_now'])
    expect((await runTool(db, 'can_do', { who: 'runner' })).text).toContain("Can't right now:\n- Post an event from your Page: The overnight check")
    sum = await loadCapabilities(db, { words: WORDS.slice(0, 4), rollup: ROLLUP, failing: new Set() })
    expect(sum.changed.map((c) => c.status)).toEqual(['can'])
    expect(sum.withdrawn).toBe(1)
    expect((await runTool(db, 'can_do', {})).text).not.toContain('Barter')
  })
})
