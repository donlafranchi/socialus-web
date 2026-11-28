import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import { readMapSeed, readRollup, loadMaps } from '../scripts/knowledge/maps'
import { runTool } from '@/lib/knowledge/tools'
import { PHONE_LINES } from '@/lib/knowledge/maps'

// F137 (#1526): the lookup tool answers a theme with its journeys, and a journey, feature or idea with its themes;
// story_map and fits name the themes too. The store's own rules are tested in SQL: supabase/tests/knowledge_themes.sql.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a theme answers with its journeys, what is built and its open questions, and every journey, feature or idea names its themes',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F137: asking about themes', { timeout: 30_000 }, () => {
  let pool: Pool
  let db: PoolClient
  const tool = async (name: string, args: Record<string, unknown>) => (await runTool(db, name, args)).text
  const sql = (q: string, p: unknown[] = []) => db.query(q, p)

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'themes-test')
    await loadMaps(db, { seed: readMapSeed(), walkthroughs: [], rollup: readRollup() })
    await sql(`select knowledge.theme('{"id":"TH-9901","answer":"Neighbours bring neighbours in","why":"help people be the change","status":"live"}', 't')`)
    await sql(`select knowledge.theme('{"id":"TH-9902","answer":"Towns that run themselves","why":"towns decide","status":"live"}', 't')`)
    await sql(`select knowledge.theme_journey('TH-9901', 'JY-BRING', true, 't')`)
    await sql(`select knowledge.theme_journey('TH-9901', 'JY-LAUNCH', true, 't')`)
    await sql(`select knowledge.theme_journey('TH-9902', 'JY-BRING', true, 't')`)
    await sql(`select knowledge.record('{"id":"F9901","kind":"feature","answer":"Bring in the makers you love","status":"approved","audience":"members","departments":[]}', 't')`)
    await sql(`select knowledge.place('F9901', 'JY-BRING.A2.T1', 't')`)
    await sql(`select knowledge.record('{"id":"CO-9901","kind":"concept","answer":"Neighbour vouching","status":"scoped","audience":"members","departments":[]}', 't')`)
    await sql(`select knowledge.place('CO-9901', 'JY-BRING.A2.T1', 't')`)
    await sql(`select knowledge.record('{"id":"CO-9902","kind":"concept","answer":"Unplaced idea about kites","status":"idea","audience":"members","departments":[]}', 't')`)
    await sql(`select knowledge.record('{"id":"Q-9901","kind":"question","answer":"Who counts as bringing someone in?","status":"open","audience":"members","departments":[]}', 't')`)
    await sql(`select knowledge.link('Q-9901', 'F9901', 'relates')`)
  }, 60_000)

  afterAll(async () => {
    await db?.query('rollback').catch(() => {})
    db?.release()
    await pool?.end()
  })

  // [guards F137.3]
  it('a theme answers with its why, its journeys, what is built on each and their open questions', async () => {
    const t = (await tool('theme', { item: 'Neighbours bring neighbours in' })).split('\n')
    expect(t[0]).toMatch(/^"Neighbours bring neighbours in" \[TH-9901\]: 2 journeys, (not built|part built|built)\.$/)
    expect(t[1]).toBe('Why: help people be the change')
    const at = t.findIndex((l) => l.includes('[JY-BRING]'))
    expect(t[at]).toMatch(/^- "Members bring something to life together that wasn't here before" \[JY-BRING\], (not built|part built|built)\.$/)
    // What is on the journey goes on the line under it.
    expect(t[at + 1]).toMatch(/Features: Bring in the makers you love \(not built\)/)
    expect(t[at + 1]).toMatch(/Ideas: Neighbour vouching/)
    expect(t[at + 1]).toMatch(/Open: Who counts as bringing someone in\?/)
    expect(t.some((l) => l.includes('[JY-LAUNCH]'))).toBe(true)
    expect(await tool('theme', { item: 'TH-9901' })).toBe(t.join('\n'))
  })

  // [guards F137.3]
  it('a journey, a feature or an idea answers with every theme it sits under, and the journey that carries it', async () => {
    const j = await tool('theme', { item: 'JY-BRING' })
    expect(j.split('\n')[0]).toBe('"Members bring something to life together that wasn\'t here before" sits under 2 themes:')
    expect(j).toMatch(/- "Neighbours bring neighbours in" \[TH-9901\]/)
    expect(j).toMatch(/- "Towns that run themselves" \[TH-9902\]/)
    const f = await tool('theme', { item: 'F9901' })
    expect(f.split('\n')[0]).toBe('"Bring in the makers you love" sits under 2 themes:')
    expect(f).toMatch(/- "Towns that run themselves" \[TH-9902\], through "Members bring something to life/)
    expect((await tool('theme', { item: 'Neighbour vouching' })).split('\n')[0]).toBe('"Neighbour vouching" sits under 2 themes:')
    expect(await tool('theme', { item: 'JY-LOCAL' })).toMatch(/: no theme yet\.$/)
    expect(await tool('theme', { item: 'CO-9902' })).toBe('"Unplaced idea about kites": no theme yet. It sits on no journey yet.')
  })

  it('with nothing, lists every theme', async () => {
    const t = await tool('theme', {})
    expect(t.split('\n')[0]).toMatch(/^Themes \(\d+\):$/)
    expect(t).toMatch(/"Towns that run themselves" \[TH-9902\], 1 journey/)
  })

  // [guards F137.3]
  it('story_map names the themes above a journey or an item on it', async () => {
    expect(await tool('story_map', { item: 'JY-BRING' })).toMatch(/\nThemes: "Neighbours bring neighbours in"; "Towns that run themselves"$/)
    expect(await tool('story_map', { item: 'JY-BRING.A2.T1' })).toMatch(/\nThemes: "Neighbours bring neighbours in"; "Towns that run themselves"$/)
    expect(await tool('story_map', { item: 'JY-LOCAL' })).toMatch(/\nThemes: no theme yet$/)
  })

  // [guards F137.4]
  it('where does this fit names the themes as well as the journey, or says no theme yet', async () => {
    const placed = (await tool('fits', { idea: 'CO-9901' })).split('\n')
    expect(placed[0]).toMatch(/^"Neighbour vouching" fits under "Bring it here" in the journey "Members bring something to life/)
    expect(placed).toContain('Themes: "Neighbours bring neighbours in"; "Towns that run themselves"')
    const none = (await tool('fits', { idea: 'a chess ladder for retirees' })).split('\n')
    expect(none).toContain('Themes: no theme yet')
    expect((await tool('fits', { idea: 'CO-9902' })).split('\n')[0]).toMatch(/^"Unplaced idea about kites": no journey yet/)
  })

  // [guards F137.6]
  it('every theme answer fits a phone screen and names no ticket', async () => {
    for (const args of [{}, { item: 'TH-9901' }, { item: 'JY-BRING' }, { item: 'F9901' }, { item: 'CO-9901' }, { item: 'JY-LOCAL' }]) {
      const t = await tool('theme', args)
      expect(t.split('\n').length, JSON.stringify(args)).toBeLessThanOrEqual(PHONE_LINES)
      expect(t, JSON.stringify(args)).not.toMatch(/\bF\d{3,4}\b|CO-\d{4}|#\d+|\bT\d{3}\b/)
    }
  })

  it('a word that names nothing says so', async () => {
    const r = await runTool(db, 'theme', { item: 'zzz nothing' })
    expect(r.isError).toBe(true)
    expect(r.text).toBe('No theme, journey, feature or idea "zzz nothing" that this key can read.')
  })
})
