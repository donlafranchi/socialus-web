import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  readSeed, readImagine, readScenarios, frontmatter, loadConcepts, currentName, ideaSource, IDEAS_DISTILLED_ON,
  type ConceptSummary,
} from '../scripts/knowledge/concepts'
import { readDrift, staleDocs } from '../scripts/knowledge/drift'
import { runTool } from '@/lib/knowledge/tools'

// F130 (#1232): concepts: the loader (scripts/knowledge/concepts.ts), the
// lookup tool's `concept` verb and the drift check's doc scan. The store's own
// rules are tested in SQL: supabase/tests/knowledge_concepts.sql.
//
// The plan side is a fixture written here, in the two shapes IMAGINE.md holds
// and the frontmatter scenarios carry, so the test does not move when
// socialus-plan does. The two traced timelines are the real seed file.

const seed = readSeed()

const IMAGINE = `# Imagine

Ideas we might build one day.

## House rules

- Not an idea, a rule.

## Ideas

Distilled ${IDEAS_DISTILLED_ON}.

- **Bulletin intelligence.** Tell a Page which of its posts its followers act on. [lane: later]
- **Tool library.** Neighbours lend tools through a shared shelf. [lane: considering]
- **Tool Library!** The same name twice, by mistake. [lane: later]

## Added under the house rules

Open your town (Don, 2026-10-26): scenario F118, Next.

### Skill swaps

*Don, 2026-10-02:* "I teach guitar, you fix my bike." *Analysis, agent:* Barter of time; needs no money to move. [lane: later] What would make it real: two members who each want what the other has.
`

const scenario = (id: string, extra: string) =>
  `---\nid: ${id}\ntitle: ${id} title\nstatus: approved\n${extra}---\n\n# ${id}\n`

function writePlan(dir: string, imagine: string | null) {
  mkdirSync(join(dir, 'planning'), { recursive: true })
  mkdirSync(join(dir, 'product', 'needs'), { recursive: true })
  mkdirSync(join(dir, 'planning', 'briefs'), { recursive: true })
  if (imagine !== null) writeFileSync(join(dir, 'IMAGINE.md'), imagine)
  else rmSync(join(dir, 'IMAGINE.md'), { force: true })
  writeFileSync(join(dir, 'planning', 'scenario-F118.md'), scenario('F118', 'concept: CO-0002\n'))
  writeFileSync(join(dir, 'planning', 'scenario-F130.md'), scenario('F130', ''))
  writeFileSync(join(dir, 'planning', 'scenario-F131.md'), scenario('F131', 'concept: CO-0001\n'))
  writeFileSync(join(dir, 'planning', 'scenario-F132.md'), scenario('F132', 'concept: Posts\n'))
  writeFileSync(
    join(dir, 'product', 'needs', 'vendors.md'),
    '# Vendors\n\n- Bulletins, cut: vendors reach followers another way.\n- Posts are live.\n' +
      '- Post replies are a separate idea, and the vendor feed idea from the spring was cut in May.\n',
  )
  writeFileSync(join(dir, 'planning', 'briefs', 'old.md'), '- Bulletins, cut on 2026-05-11.\n')
}

describe('reading the plan side', () => {
  const dir = mkdtempSync(join(tmpdir(), 'f130-'))
  writePlan(dir, IMAGINE)

  it("reads IMAGINE.md's ideas in both shapes, and nothing else", () => {
    const ideas = readImagine(join(dir, 'IMAGINE.md'))
    expect(ideas.map((i) => i.name)).toEqual(['Bulletin intelligence', 'Tool library', 'Tool Library!', 'Skill swaps'])
    expect(ideas[0]).toMatchObject({ slug: 'bulletin-intelligence', on: IDEAS_DISTILLED_ON, lane: 'later', pmWords: null })
    expect(ideas[0].description).toBe('Tell a Page which of its posts its followers act on.')
    const swaps = ideas[3]
    expect(swaps.on).toBe('2026-10-02')
    expect(swaps.pmWords).toBe('I teach guitar, you fix my bike.')
    expect(swaps.analysis).toBe('Barter of time; needs no money to move.')
    expect(swaps.lane).toBe('later')
    expect(swaps.description).not.toContain('guitar')
  })

  it("reads a scenario's concept from its frontmatter", () => {
    expect(frontmatter(scenario('F118', 'concept: CO-0002\n'))).toMatchObject({ id: 'F118', concept: 'CO-0002' })
    expect(frontmatter('# no frontmatter\nconcept: CO-0001\n')).toEqual({})
    expect(readScenarios(dir).map((s) => [s.id, s.concept])).toEqual([
      ['F118', 'CO-0002'], ['F130', null], ['F131', 'CO-0001'], ['F132', 'Posts'],
    ])
  })

  it('transcribes each traced timeline with one id and every name it had', () => {
    expect(seed.concepts.map((c) => [c.id, currentName(c)])).toEqual([['CO-0001', 'Post'], ['CO-0002', 'Open your town']])
    expect(seed.concepts[0].names.find((n) => n.state === 'refused')?.name).toBe('Bulletin')
  })
})

const PLAN = resolve(process.env.KNOWLEDGE_PLAN_DIR ?? '../socialus-plan')
const BRIEF = resolve(PLAN, seed.brief)

// Runs wherever socialus-plan is checked out at or after the brief's commit.
describe.skipIf(!existsSync(BRIEF))('the seed against the brief', () => {
  it("holds every timeline entry of the brief, in the brief's own words and order", () => {
    const brief = readFileSync(BRIEF, 'utf8')
    for (const c of seed.concepts) {
      const at = brief.indexOf(c.title)
      expect(at, c.title).toBeGreaterThanOrEqual(0)
      const lines = brief.slice(at).split('\n').slice(1)
      const entries = lines.slice(0, lines.findIndex((l) => !l.startsWith('- '))).filter((l) => /^- \d{4}-\d{2}-\d{2} /.test(l))
      expect(entries, c.title).toEqual(c.entries.map((e) => `- ${e.on} ${e.text}`))
    }
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the two traced timelines, the ideas and the scenarios load into the store as concepts, and one call reads each back',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F130: concepts loaded into the store', () => {
  let pool: Pool
  let db: PoolClient
  const dir = mkdtempSync(join(tmpdir(), 'f130-db-'))
  let first: ConceptSummary
  let second: ConceptSummary
  let afterRemoval: ConceptSummary

  const load = (imagine: string | null) => {
    writePlan(dir, imagine)
    return loadConcepts(db, {
      seed,
      ideas: readImagine(join(dir, 'IMAGINE.md')),
      scenarios: readScenarios(dir),
      commits: { plan: 'abcdef1234567', web: 'fedcba7654321' },
    })
  }
  const timeline = async (id: string) =>
    (await db.query('select knowledge.concept_timeline($1) as t', [id])).rows[0].t

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'concepts-test')
    // The rulings behind the traced names, as the import would hold them.
    for (const c of seed.concepts) {
      for (const n of c.names) {
        if (!n.ruling) continue
        await db.query('select knowledge.record($1::jsonb, $2)', [
          JSON.stringify({ kind: 'decision', concern: 'ontology', answer: n.ruling.words, why: 'test', decided_on: n.ruling.on,
                           audience: 'department', departments: ['building'] }),
          'F130 test',
        ])
      }
    }
    first = await load(IMAGINE)
    second = await load(IMAGINE)
    // The ideas have left IMAGINE.md once loaded (the plan side's half of F130.5).
    afterRemoval = await load(null)
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F130.4]
  it('loads Posts and Open your town with the timelines in the brief, entry for entry', async () => {
    // The brief, entry for entry: the seed holds each of its lines, in order.
    expect(existsSync(BRIEF), `the brief, in a socialus-plan checkout at ${PLAN} (set KNOWLEDGE_PLAN_DIR)`).toBe(true)
    const brief = readFileSync(BRIEF, 'utf8')
    for (const c of seed.concepts) {
      const lines = brief.slice(brief.indexOf(c.title)).split('\n').slice(1)
      const entries = lines.slice(0, lines.findIndex((l) => !l.startsWith('- '))).filter((l) => /^- \d{4}-\d{2}-\d{2} /.test(l))
      expect(brief.indexOf(c.title), c.title).toBeGreaterThanOrEqual(0)
      expect(entries, c.title).toEqual(c.entries.map((e) => `- ${e.on} ${e.text}`))
    }
    // The store, entry for entry: the seed's every event, name and the ruling behind each name.
    for (const c of seed.concepts) {
      const t = await timeline(c.id)
      expect(t.concept).toMatchObject({ id: c.id, name: currentName(c), status: c.status, why: c.why })
      expect(t.names.map((n: { name: string; on: string; state: string }) => [n.on, n.name, n.state]))
        .toEqual(c.names.map((n) => [n.on, n.name, n.state]).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)))
      const want = c.entries.flatMap((e) =>
        e.events.map((x) => ({ on: e.on, type: x.type, what: x.what, evidence: x.evidence, pm_words: x.pm_words ?? null })),
      )
      const got = t.events.map((e: Record<string, unknown>) => ({ on: e.on, type: e.type, what: e.what, evidence: e.evidence, pm_words: e.pm_words }))
      expect(got).toEqual(want)
      for (const n of c.names.filter((x) => x.ruling)) {
        const loaded = t.names.find((x: { name: string; state: string }) => x.name === n.name && x.state === n.state)
        expect(loaded.ruling, `${c.id} "${n.name}" carries its ruling`).toMatch(/^D-\d{4}$/)
      }
    }
    const posts = await timeline('CO-0001')
    expect(posts.events.find((e: { pm_words: string | null }) => e.pm_words)?.pm_words).toBe('an announcement is a post')
  })

  // [guards F130.5 partial: removing each idea from IMAGINE.md is socialus-plan's]
  it("makes each of IMAGINE.md's ideas a concept with status idea, and keeps it once the idea has left the file", async () => {
    expect(first.ideasRecorded).toBe(3)
    expect(first.problems).toContainEqual(expect.stringContaining('"Tool Library!" (line'))
    expect(second.ideasRecorded).toBe(0)
    expect(afterRemoval.ideasRecorded).toBe(0)
    const { rows } = await db.query(
      `select id, answer, status, tags from knowledge.records where kind = 'concept' and source like 'socialus-plan:IMAGINE.md#%' order by answer`,
    )
    expect(rows.map((r) => [r.answer, r.status])).toEqual([
      ['Bulletin intelligence', 'idea'], ['Skill swaps', 'idea'], ['Tool library', 'idea'],
    ])
    const swaps = rows.find((r) => r.answer === 'Skill swaps')
    expect(swaps.tags).toEqual(['lane:later'])
    const t = await timeline(swaps.id)
    expect(t.events).toHaveLength(1)
    expect(t.events[0]).toMatchObject({ on: '2026-10-02', type: 'idea', pm_words: 'I teach guitar, you fix my bike.' })
    expect(t.concept.why).toContain('Analysis, agent: Barter of time')
    // The Posts split points at the idea, after the idea's file is gone.
    const posts = await timeline('CO-0001')
    expect(posts.lineage).toContainEqual(expect.objectContaining({ type: 'split_from', other: 'Bulletin intelligence', to: 'CO-0001' }))
    expect(rows.find((r) => r.answer === 'Bulletin intelligence').id).toBe(
      (await db.query('select id from knowledge.records where source = $1', [ideaSource('bulletin-intelligence')])).rows[0].id,
    )
  })

  // [guards F130.6 partial: the lint that fails a scenario touched without one is socialus-plan's]
  it('links a scenario that names its concept, and reports one that names something else', async () => {
    const oyt = await timeline('CO-0002')
    const scopes = oyt.lineage.filter((l: { type: string }) => l.type === 'scopes').map((l: { from: string }) => l.from)
    expect(scopes.sort()).toEqual(['F076', 'F103', 'F118'])
    expect(oyt.lineage.find((l: { from: string }) => l.from === 'F118').other).toBe('F118 title')
    // F131 is in no traced timeline: only its frontmatter links it.
    const posts = await timeline('CO-0001')
    expect(posts.lineage).toContainEqual(expect.objectContaining({ from: 'F131', type: 'scopes', to: 'CO-0001', other: 'F131 title' }))
    expect(first.problems).toContain('planning/scenario-F132.md: concept "Posts" is not a concept id (CO-0001)')
    expect((await db.query(`select 1 from knowledge.records where id = 'F132'`)).rowCount).toBe(0)
    const f130 = await db.query(`select 1 from knowledge.records where id = 'F130'`)
    expect(f130.rowCount).toBe(0)
  })

  it('records nothing twice on a second run', () => {
    expect(second).toMatchObject({ conceptsRecorded: 0, conceptsRevised: 0, ideasRecorded: 0, features: 0, names: 0, events: 0, links: 0 })
    expect(first.conceptsRecorded).toBe(2)
  })

  // [guards F130.7]
  it('answers "how did this concept change and why" in one lookup-tool call, by any name it had', async () => {
    const out = await runTool(db, 'concept', { concept: 'Bulletins' })
    expect(out.isError ?? false).toBe(false)
    const text = out.text
    expect(text.split('\n')[0]).toBe('CO-0001 · built: Post (posts)')
    expect(text).toContain('Why: A Page reaching its followers.')
    expect(text).toContain('- 2026-09-21 REFUSED "Bulletin"')
    expect(text).toContain('- 2026-10-01 renamed: Post (plan commit 3277f66) The PM: "an announcement is a post"')
    expect(text).toContain('- 2026-05-11 cut: the migrations were wiped (plan commit 993e447)')
    expect(text).toContain('F072 scopes CO-0001')
    expect((await runTool(db, 'concept', { concept: 'bulletin' })).text.split('\n')[0]).toBe('CO-0001 · built: Post (posts)')
    expect((await runTool(db, 'concept', { concept: 'market unlock' })).text.split('\n')[0]).toBe('CO-0002 · deferred: Open your town')
    const none = await runTool(db, 'concept', { concept: 'Teleporter' })
    expect(none.isError).toBe(true)
  })

  // [guards F130.8 partial: that it runs weekly is the workflow's schedule, .github/workflows/knowledge-drift.yml]
  it('finds docs that still call a concept cut after it came back, and no drift in the two traced concepts', async () => {
    const { drift, returned } = await readDrift(db)
    expect(drift.filter((d) => d.id === 'CO-0001' || d.id === 'CO-0002')).toEqual([])
    expect(returned.map((r) => r.id).sort()).toEqual(['CO-0001', 'CO-0002'])
    const stale = staleDocs(dir, returned)
    expect(stale).toEqual([
      expect.objectContaining({ concept: 'CO-0001', name: 'Bulletins', file: 'product/needs/vendors.md', line: 3 }),
    ])
  })
})
