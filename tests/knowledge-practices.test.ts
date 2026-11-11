import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  checkSeed, enforcedBy, enforcers, loadPractices, readPracticeSeed, readReviewSteps, wantedPractice,
  PRACTICE_SEED_PATH, REVIEW_METHOD_FILE, REVIEW_METHOD_ID, type PracticeSeed,
} from '../scripts/knowledge/practices'
import { findDrift, readEnforced } from '../scripts/knowledge/practice-drift'
import { planPack, countTokens, upkeepText, PACK_DIR, PACK_FILE, STEPS_FILE } from '../scripts/knowledge/pack'
import { renderPack, packBody, PACK_TOKEN_LIMIT, type PackPractice } from '@/lib/knowledge/pack'
import { packRows } from '@/lib/knowledge/lookups'
import { runTool } from '@/lib/knowledge/tools'

// F128 (#1237): how we work. The loader (scripts/knowledge/practices.ts),
// the pack writer (scripts/knowledge/pack.ts), the drift step
// (scripts/knowledge/practice-drift.ts) and the lookup tool's how,
// review_method and upkeep verbs. The store's own rules are tested in SQL:
// supabase/tests/knowledge_practices.sql.
//
// A small fixture seed is written here so the test does not move when the
// real seed does; the real seed (practices-seed.json) is checked for shape and
// for a pack under 10,000 tokens.

const STEPS = 'Use with the pack. Read only the material given and the pack.\n\n1. List the claims.\n2. Place each.'

const fixture: PracticeSeed = {
  practices: [
    {
      slug: 't-second-review', area: 'reviewing', statement: 'A second session reviews changes to actions and the schema.',
      why: 'A builder reviewing its own PR passed it.', evidence: [{ date: '2026-10-21', what: 'PR #990 self-reviewed', ref: 'socialus-web#990' }],
      strength: 'rule', ring: 'adopt', enforced_by: [{ repo: 'socialus-web', path: 'REVIEW.md', what: 'the review rules' }],
      source: 'socialus-web:CLAUDE.md', holds: 'always',
    },
    {
      slug: 't-push-once', area: 'shipping', statement: 'Push once, when a change is ready to review.', why: 'Every push runs CI.',
      evidence: [{ date: '2026-10-05', what: 'CI minutes spent on half-done pushes', ref: 'socialus-web#300' }],
      strength: 'guideline', ring: 'trial', enforced_by: [{ repo: 'socialus-web', path: '.github/workflows/gone.yml', what: 'a check that was removed' }],
      source: 'socialus-web:CLAUDE.md',
    },
    {
      slug: 't-no-em-dash', area: 'words', statement: 'No em dashes.', why: 'They read as machine voice.',
      evidence: [], strength: 'rule', ring: 'adopt', enforced_by: [{ repo: 'socialus-legal', path: 'STYLE.md', what: 'style' }],
      source: 'socialus-ops:process/WORDS.md',
    },
    {
      slug: 't-production-asks', area: 'shipping', statement: 'Production asks the PM.', why: 'He owns what members see.',
      evidence: [], strength: 'absolute', ring: 'adopt', enforced_by: [], source: 'socialus-ops:process/ABSOLUTES.md#t-production-asks',
    },
  ],
  experiments: [
    {
      slug: 't-merge-on-green', practice: 't-push-once', change: 'Merge on green without waiting for a look.',
      baseline: 'Four days from green to merge.', measure: 'Days from green to merge.', verdict_date: '2026-11-01', verdict: null,
      source: 'socialus-plan:planning/briefs/single-loop.md',
    },
  ],
}

describe('the seed and its words', () => {
  it('turns enforcing checks into readable entries and back', () => {
    const text = enforcedBy([{ repo: 'socialus-web', path: '.github/workflows/ci.yml', what: 'the review job (body); lint' }, { repo: 'socialus-ops', path: 'process/PIPELINE.md', what: '' }])
    expect(text).toBe('socialus-web:.github/workflows/ci.yml (the review job body lint); socialus-ops:process/PIPELINE.md')
    expect(enforcers(text)).toEqual([
      { repo: 'socialus-web', path: '.github/workflows/ci.yml' },
      { repo: 'socialus-ops', path: 'process/PIPELINE.md' },
    ])
  })

  // [guards F128.1 partial: the store's side, in supabase/tests/knowledge_practices.sql]
  it('refuses a seed with no why, an unknown area, ring or strength, or an experiment on no practice', () => {
    expect(checkSeed(fixture)).toEqual([])
    const bad = structuredClone(fixture)
    bad.practices[0].why = ' '
    bad.practices[1].area = 'vibes' as never
    bad.practices[2].ring = 'maybe' as never
    bad.experiments[0].practice = 'nothing'
    expect(checkSeed(bad)).toEqual([
      'practice "t-second-review" has no why',
      'practice "t-push-once": no area "vibes"',
      'practice "t-no-em-dash": ring "maybe"',
      'experiment "t-merge-on-green" changes "nothing", which is not a practice in the seed',
    ])
  })

  it('reads the review-a-method steps without their title', () => {
    const ops = mkdtempSync(join(tmpdir(), 'f128-ops-'))
    expect(readReviewSteps(ops)).toBeNull()
    mkdirSync(join(ops, 'process', 'research'), { recursive: true })
    writeFileSync(join(ops, REVIEW_METHOD_FILE), `# Review a method\n\n${STEPS}\n`)
    expect(readReviewSteps(ops)).toBe(STEPS)
  })
})

const asPack = (s: PracticeSeed): PackPractice[] =>
  s.practices.filter((p) => p.strength !== 'absolute').map((p) => {
    const w = wantedPractice(p)
    return { id: `practice.${p.slug}`, concern: String(w.concern), area: String(w.concern), answer: p.statement, why: p.why, strength: p.strength, ring: p.ring, holds: p.holds ?? null }
  })

describe('the pack', () => {
  // [guards F128.9 partial: the commit to socialus-ops, which only the workflow makes]
  it('opens with its date and size, gives each practice one line with its why, strictness and ring, and holds the steps apart', () => {
    const rows = { practices: [...asPack(fixture), { id: REVIEW_METHOD_ID, concern: 'how-agents', area: 'How the agents run', answer: STEPS, why: 'w', strength: 'rule', ring: 'trial', holds: null }], philosophies: [{ id: 'PH-0001', answer: 'Production asks the PM.' }], steps: STEPS }
    const ops = mkdtempSync(join(tmpdir(), 'f128-pack-'))
    const plan = planPack(rows, ops, '2026-11-11', false)
    expect(plan.write).toBe(true)
    const pack = plan.files.find((f) => f.path.endsWith(PACK_FILE))!.text
    expect(pack.split('\n')[2]).toBe(`Written 2026-11-11 from the knowledge store. 3 live practices, about ${plan.tokens} tokens.`)
    expect(plan.tokens).toBe(countTokens(pack))
    expect(pack).toContain('- **No em dashes.** rule, adopt. Why: They read as machine voice. (practice.t-no-em-dash)')
    expect(pack).toContain('Production asks the PM. (PH-0001)')
    expect(pack).not.toContain('1. List the claims.')
    expect(pack).not.toMatch(/REVIEW\.md|socialus-web#990/) // no enforcing paths, no evidence: only what judging needs
    expect(plan.files.find((f) => f.path.endsWith(STEPS_FILE))!.text).toContain('1. List the claims.')

    // Written once, the same pack is not rewritten; the monthly run rewrites it regardless.
    for (const f of plan.files) {
      mkdirSync(join(ops, PACK_DIR), { recursive: true })
      writeFileSync(join(ops, f.path), f.text)
    }
    expect(planPack(rows, ops, '2026-11-12', false).write).toBe(false)
    expect(planPack(rows, ops, '2026-11-12', true)).toMatchObject({ write: true, reason: 'the monthly rewrite' })
    // A ring move is a change.
    const moved = { ...rows, practices: rows.practices.map((p) => (p.id === 'practice.t-push-once' ? { ...p, ring: 'adopt' } : p)) }
    expect(planPack(moved, ops, '2026-11-12', false)).toMatchObject({ write: true, reason: 'a practice, its ring or its strength changed' })
  }, 30_000)

  it('refuses to write a pack of 10,000 tokens or more', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ ...asPack(fixture)[0], id: `practice.n${i}`, why: 'A reason that runs on for a while. '.repeat(3) }))
    expect(() => planPack({ practices: many, philosophies: [], steps: null }, mkdtempSync(join(tmpdir(), 'f128-big-')), '2026-11-11', true)).toThrow(/tokens/)
  }, 30_000)

  it('the body comparison ignores only the date line', () => {
    const a = renderPack(asPack(fixture), [], '2026-11-11').text
    const b = renderPack(asPack(fixture), [], '2026-12-01').text
    expect(a).not.toBe(b)
    expect(packBody(a)).toBe(packBody(b))
  })
})

describe.skipIf(!existsSync(PRACTICE_SEED_PATH))('the real seed', () => {
  const seed = readPracticeSeed()!
  it('is well formed', () => {
    expect(checkSeed(seed)).toEqual([])
    expect(seed.practices.length).toBeGreaterThan(10)
  })

  // [guards F128.6 partial: the store's side, in supabase/tests/knowledge_practices.sql]
  it("brings the single-loop plan's changes in as the first experiments", () => {
    expect(seed.experiments[0].source).toMatch(/single-loop/)
  })

  // [guards F128.9 partial: the size, against the real seed; what is written where is tested above]
  it('makes a pack under 10,000 tokens', () => {
    const pack = renderPack(asPack(seed), [], '2026-11-11', countTokens)
    expect(pack.tokens).toBeLessThan(PACK_TOKEN_LIMIT)
  })
})

describe('drift', () => {
  // [guards F128.3 partial: the weekly schedule and the Issue it opens, which only the workflow does]
  it('flags a practice whose enforcing check is gone, and never one in a repo it cannot see', () => {
    const web = mkdtempSync(join(tmpdir(), 'f128-web-'))
    writeFileSync(join(web, 'REVIEW.md'), '# Review\n')
    const live = fixture.practices.filter((p) => p.strength !== 'absolute').map((p) => ({ id: `practice.${p.slug}`, answer: p.statement, enforced_by: enforcedBy(p.enforced_by) }))
    const out = findDrift([...live, { id: 'practice.none', answer: 'x', enforced_by: null }], { 'socialus-web': web })
    expect(out.drift).toEqual([{ id: 'practice.t-push-once', answer: 'Push once, when a change is ready to review.', repo: 'socialus-web', path: '.github/workflows/gone.yml' }])
    expect(out.unchecked.map((u) => u.id)).toEqual(['practice.t-no-em-dash'])
    expect(out.unenforced).toEqual(['practice.none'])
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'practices and experiments load from the seed, re-runnably, and the lookup tool answers how we work from them',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F128: how we work loaded into the store', () => {
  let pool: Pool
  let db: PoolClient
  const load = (seed: PracticeSeed, steps: string | null = STEPS) => loadPractices(db, { seed, steps, today: '2026-11-11' })

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'practices-test')
    // An absolute, as the import brings them in from the ABSOLUTES files.
    await db.query(
      `select knowledge.record($1::jsonb, 'F128 test')`,
      [JSON.stringify({ id: 't-production-asks', kind: 'decision', answer: 'Production asks the PM.', why: 'He owns what members see.',
                        strength: 'absolute', scope: 'process', holds: 'always', tags: ['absolute'], audience: 'operators' })],
    )
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F128.1 partial: the real seed's extraction from socialus-ops and the CLAUDE.md files is the parent planning session's]
  it('loads every practice with scope process, its why, its failures as evidence, its strength, ring and check; a second run records nothing', async () => {
    const first = await load(fixture)
    expect(first).toMatchObject({ recorded: 4, revised: 0, experiments: 1, absolutes: ['t-production-asks'], problems: [] })
    // The absolute is linked to the record already there, not copied.
    expect((await db.query(`select 1 from knowledge.records where id = 'practice.t-production-asks'`)).rows).toEqual([])
    const { rows } = await db.query(
      `select r.scope, r.why, r.strength, r.ring, r.enforced_by, r.concern, r.as_of::text, h.evidence
         from knowledge.records r join knowledge.history h on h.record_id = r.id and h.version = 1
        where r.id = 'practice.t-second-review'`,
    )
    expect(rows[0]).toMatchObject({
      scope: 'process', why: 'A builder reviewing its own PR passed it.', strength: 'rule', ring: 'adopt',
      enforced_by: 'socialus-web:REVIEW.md (the review rules)', concern: 'how-reviewing', as_of: '2026-10-21',
    })
    expect(rows[0].evidence.failures).toEqual(fixture.practices[0].evidence)
    const again = await load(fixture)
    expect(again).toMatchObject({ recorded: 0, revised: 0, unchanged: 4, experiments: 0, verdicts: 0, problems: [] })
  })

  // [guards F128.5 partial: the store's refusals, in supabase/tests/knowledge_practices.sql]
  it('a ring moved in the seed is a new version with its why', async () => {
    const moved = structuredClone(fixture)
    moved.practices[1].ring = 'adopt'
    expect(await load(moved)).toMatchObject({ revised: 1 })
    const { rows } = await db.query(
      `select version, snapshot->>'ring' as ring, reason from knowledge.history where record_id = 'practice.t-push-once' order by version`,
    )
    expect(rows.map((r) => r.ring)).toEqual(['trial', 'adopt'])
    expect(rows[1].reason).toMatch(/ring changed/)
  })

  // [guards F128.5 partial: the store's refusals, in supabase/tests/knowledge_practices.sql]
  it('a ring moved or a verdict given in the store stands through the next import of an unchanged seed', async () => {
    await db.query(`select knowledge.revise('practice.t-second-review', '{"ring":"hold"}', 'Paused while the reviewer has no identity of its own.')`)
    const judged = structuredClone(fixture)
    judged.practices[1].ring = 'adopt' // as the seed now reads, after the move above
    expect(await load(judged)).toMatchObject({ revised: 0, verdicts: 0 })
    expect((await db.query(`select ring from knowledge.records where id = 'practice.t-second-review'`)).rows[0].ring).toBe('hold')
    // The seed changing the same field later still comes through.
    const later = structuredClone(judged)
    later.practices[0].ring = 'trial'
    expect(await load(later)).toMatchObject({ revised: 1 })
    expect((await db.query(`select ring from knowledge.records where id = 'practice.t-second-review'`)).rows[0].ring).toBe('trial')
    await load(judged) // back to the seed's adopt, for the tests after this one

    // A move in the store survives a later import that changes another field, and the import after that.
    await db.query(`select knowledge.revise('practice.t-push-once', '{"ring":"hold"}', 'The PM paused it.')`)
    const reworded = structuredClone(judged)
    reworded.practices[1].statement = 'Push once, when the change is ready for review.'
    expect(await load(reworded)).toMatchObject({ revised: 1 })
    expect(await load(reworded)).toMatchObject({ revised: 0 })
    const { rows } = await db.query(
      `select r.ring, r.answer from knowledge.records r where r.id = 'practice.t-push-once'`,
    )
    expect(rows[0]).toEqual({ ring: 'hold', answer: 'Push once, when the change is ready for review.' })
    await db.query(`select knowledge.revise('practice.t-push-once', '{"ring":"adopt"}', 'Back to the seed, for the tests after this one.')`)
  })

  // [guards F128.6 partial: that the real seed's first experiments are the single-loop plan's is the seed's, checked when it lands]
  it('an experiment comes in with its practice, baseline, measure and verdict date, and its verdict later', async () => {
    const { rows } = await db.query(`select * from knowledge.experiment_terms where experiment_id = 'experiment.t-merge-on-green'`)
    expect(rows[0]).toMatchObject({ practice_id: 'practice.t-push-once', baseline: 'Four days from green to merge.', measure: 'Days from green to merge.' })
    const judged = structuredClone(fixture)
    judged.experiments[0].verdict = 'keep'
    expect(await load(judged)).toMatchObject({ verdicts: 1 })
    expect((await db.query(`select status from knowledge.records where id = 'experiment.t-merge-on-green'`)).rows[0].status).toBe('keep')
    // A verdict given in the store stands when the seed gives none.
    await db.query(`select knowledge.record('{"id":"experiment.t-store-verdict","kind":"experiment","scope":"process","answer":"x","audience":"members"}', 't')`)
    const withIt = structuredClone(judged)
    withIt.experiments.push({ ...judged.experiments[0], slug: 't-store-verdict', verdict: null })
    await load(withIt)
    await db.query(`select knowledge.revise('experiment.t-store-verdict', '{"status":"revert"}', 'The PM: it cost more than it saved.')`)
    expect(await load(withIt)).toMatchObject({ verdicts: 0 })
    expect((await db.query(`select status from knowledge.records where id = 'experiment.t-store-verdict'`)).rows[0].status).toBe('revert')
  })

  // [guards F128.2]
  it('"how does our DevOps work" answers in short lines from live records, each with its id and enforcing check', async () => {
    const out = await runTool(db, 'how', { question: 'How does our DevOps work?' })
    expect(out.isError).toBeFalsy()
    expect(out.text).toContain('How we review:\n- practice.t-second-review · rule, adopt: A second session reviews changes to actions and the schema. Enforced by: socialus-web:REVIEW.md (the review rules).')
    expect(out.text).toContain('How we ship:\n- practice.t-push-once')
    expect(out.text.startsWith('Absolutes, which bind every area:\n- t-production-asks: Production asks the PM.')).toBe(true)
    expect(out.text).not.toContain('No em dashes')
    expect((await runTool(db, 'how', { question: 'words' })).text).toContain('practice.t-no-em-dash · rule, adopt')
    // The agents' area points at the review steps rather than printing them.
    const agents = (await runTool(db, 'how', { question: 'how does the agent loop work' })).text
    expect(agents).toContain(`To review a new method against all of this: call review_method (${REVIEW_METHOD_ID}).`)
    expect(agents).not.toContain('1. List the claims.')
    const none = await runTool(db, 'how', { question: 'the weather' })
    expect(none.isError).toBe(true)
    expect(none.text).toMatch(/agents \(How the agents run\)/)
  })

  // [guards F128.4 partial: the agent's reading of the material is its own; the tool gives it only the steps and the store]
  it('review_method hands over the steps and the pack in one call, and nothing else', async () => {
    const out = await runTool(db, 'review_method', { material: 'https://example.com/a-method' })
    expect(out.isError).toBeFalsy()
    expect(out.text.startsWith(STEPS)).toBe(true)
    expect(out.text).toContain('# How we work')
    expect(out.text).toContain('(practice.t-second-review)')
    expect(out.text).toContain('Production asks the PM. (t-production-asks)')
    expect(out.text).not.toContain('example.com')
  })

  // [guards F128.7 partial: the monthly Issue, opened by the workflow]
  it('upkeep lists experiments past their verdict date and practices not confirmed in 90 days', async () => {
    const late = structuredClone(fixture)
    late.experiments.push({ ...late.experiments[0], slug: 't-late', verdict: null })
    await load(late)
    const out = await runTool(db, 'upkeep', { today: '2026-11-20' })
    expect(out.text).toContain('experiment.t-late (experiment): verdict was due 2026-11-01 and is still running')
    expect(out.text).not.toContain('practice.t-second-review')
    const later = await runTool(db, 'upkeep', { today: '2027-03-01' })
    expect(later.text).toContain('practice.t-second-review (practice): not confirmed since 2026-10-21')
    const rows = (await db.query(`select id, kind, answer, problem, since::text from knowledge.practice_upkeep('2027-03-01')`)).rows
    expect(upkeepText(rows)).toContain('### Experiments past their verdict date\n- Merge on green')
  })

  it('the drift step reads every live practice the store holds', async () => {
    const ids = (await readEnforced(db)).map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['practice.t-second-review', REVIEW_METHOD_ID]))
    const rows = await packRows(db)
    expect(rows.steps).toBe(STEPS)
  })
})
