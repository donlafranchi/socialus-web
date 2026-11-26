import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { getEncoding } from 'js-tiktoken'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import { enforcers, findDrift, readEnforced } from '../scripts/knowledge/practice-drift'
import { renderPack, packBody, PACK_TOKEN_LIMIT, REVIEW_METHOD_ID, type PackPractice } from '@/lib/knowledge/pack'
import { packRows } from '@/lib/knowledge/lookups'
import { runTool } from '@/lib/knowledge/tools'

// F128 (#1237): how we work, read from the store. The pack renderer
// (src/lib/knowledge/pack.ts), the lookup tool's how, review_method and
// upkeep verbs, and the weekly practice-drift reader. The records are seeded
// here; the files they once came from are gone. The store's own rules are
// tested in SQL: supabase/tests/knowledge_practices.sql.

const STEPS = 'Use with the pack. Read only the material given and the pack.\n\n1. List the claims.\n2. Place each.'

const encoder = getEncoding('o200k_base')
const countTokens = (text: string) => encoder.encode(text).length

const practice = (slug: string, area: string, answer: string, why: string, ring: string, extra: Partial<PackPractice> = {}): PackPractice => ({
  id: `practice.${slug}`, concern: `how-${area}`, area: `how-${area}`, answer, why, strength: 'rule', ring, holds: null, ...extra,
})

const practices: PackPractice[] = [
  practice('t-second-review', 'reviewing', 'A second session reviews changes to actions and the schema.', 'A builder reviewing its own PR passed it.', 'adopt'),
  practice('t-push-once', 'shipping', 'Push once, when a change is ready to review.', 'Every push runs CI.', 'trial', { strength: 'guideline' }),
  practice('t-no-em-dash', 'words', 'No em dashes.', 'They read as machine voice.', 'adopt'),
]

describe('the pack', () => {
  it('opens with its date and size, gives each practice one line with its why, strictness and ring, and carries only what judging needs', () => {
    const out = renderPack(practices, [{ id: 'PH-0001', answer: 'Production asks the PM.' }], '2026-11-11', countTokens)
    expect(out.text.split('\n')[2]).toBe(`Written 2026-11-11 from the knowledge store. 3 live practices, about ${out.tokens} tokens.`)
    expect(out.tokens).toBe(countTokens(out.text))
    expect(out.text).toContain('- **No em dashes.** rule, adopt. Why: They read as machine voice. (practice.t-no-em-dash)')
    expect(out.text).toContain('Production asks the PM. (PH-0001)')
  })

  // [guards F128.9 partial: the size, against a large synthetic pack; what the store holds today is checked when the pack is read]
  it('counts a pack of 10,000 tokens or more as over the limit', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({ ...practices[0], id: `practice.n${i}`, why: 'A reason that runs on for a while. '.repeat(3) }))
    expect(renderPack(many, [], '2026-11-11', countTokens).tokens).toBeGreaterThanOrEqual(PACK_TOKEN_LIMIT)
    expect(renderPack(practices, [], '2026-11-11', countTokens).tokens).toBeLessThan(PACK_TOKEN_LIMIT)
  })

  it('the body comparison ignores only the date line', () => {
    const a = renderPack(practices, [], '2026-11-11').text
    const b = renderPack(practices, [], '2026-12-01').text
    expect(a).not.toBe(b)
    expect(packBody(a)).toBe(packBody(b))
    const moved = renderPack(practices.map((p) => (p.id === 'practice.t-push-once' ? { ...p, ring: 'adopt' } : p)), [], '2026-11-11').text
    expect(packBody(moved)).not.toBe(packBody(a))
  })
})

describe('practice drift', () => {
  it('reads the paths a practice names, out of its enforced_by', () => {
    expect(enforcers('socialus-web:.github/workflows/ci.yml (the review job); socialus-ops:process/PIPELINE.md')).toEqual([
      { repo: 'socialus-web', path: '.github/workflows/ci.yml' },
      { repo: 'socialus-ops', path: 'process/PIPELINE.md' },
    ])
    expect(enforcers(null)).toEqual([])
  })

  // [guards F128.3 partial: the weekly schedule and the Issue it opens, which only the workflow does]
  it('flags a practice whose enforcing check is gone, and never one in a repo it cannot see', () => {
    // findDrift looks on disk; point it at a directory holding only REVIEW.md.
    const web = mkdtempSync(join(tmpdir(), 'f128-web-'))
    writeFileSync(join(web, 'REVIEW.md'), '# Review\n')
    const live = [
      { id: 'practice.t-second-review', answer: 'A second session reviews.', enforced_by: 'socialus-web:REVIEW.md (the review rules)' },
      { id: 'practice.t-push-once', answer: 'Push once.', enforced_by: 'socialus-web:.github/workflows/gone.yml (a check that was removed)' },
      { id: 'practice.t-no-em-dash', answer: 'No em dashes.', enforced_by: 'socialus-legal:STYLE.md (style)' },
      { id: 'practice.none', answer: 'x', enforced_by: null },
    ]
    const out = findDrift(live, { 'socialus-web': web })
    expect(out.drift).toEqual([{ id: 'practice.t-push-once', answer: 'Push once.', repo: 'socialus-web', path: '.github/workflows/gone.yml' }])
    expect(out.unchecked.map((u) => u.id)).toEqual(['practice.t-no-em-dash'])
    expect(out.unenforced).toEqual(['practice.none'])
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the lookup tool answers how we work, review_method and upkeep from records in the store',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F128: how we work, read from the store', () => {
  let pool: Pool
  let db: PoolClient

  const record = (doc: Record<string, unknown>) =>
    db.query(`select knowledge.record($1::jsonb, 'F128 test')`, [JSON.stringify({ audience: 'operators', scope: 'process', ...doc })])

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'how-we-work-test')
    // An absolute, as the store holds them.
    await record({ id: 't-production-asks', kind: 'decision', answer: 'Production asks the PM.', why: 'He owns what members see.', strength: 'absolute', holds: 'always', tags: ['absolute'] })
    await record({
      id: 'practice.t-second-review', kind: 'practice', status: 'live', concern: 'how-reviewing',
      answer: 'A second session reviews changes to actions and the schema.', why: 'A builder reviewing its own PR passed it.',
      strength: 'rule', ring: 'adopt', enforced_by: 'socialus-web:REVIEW.md (the review rules)', decided_on: '2026-10-21', as_of: '2026-10-21',
    })
    await record({
      id: 'practice.t-push-once', kind: 'practice', status: 'live', concern: 'how-shipping',
      answer: 'Push once, when a change is ready to review.', why: 'Every push runs CI.',
      strength: 'guideline', ring: 'trial', enforced_by: 'socialus-web:.github/workflows/gone.yml (a check that was removed)', decided_on: '2026-10-05', as_of: '2026-10-05',
    })
    await record({
      id: 'practice.t-no-em-dash', kind: 'practice', status: 'live', concern: 'how-words',
      answer: 'No em dashes.', why: 'They read as machine voice.', strength: 'rule', ring: 'adopt', enforced_by: 'socialus-legal:STYLE.md (style)',
      decided_on: '2026-10-05', as_of: '2026-10-05',
    })
    await record({
      id: REVIEW_METHOD_ID, kind: 'practice', status: 'live', concern: 'how-agents', answer: STEPS,
      why: 'So any new method is checked against how we work in one session.', strength: 'rule', ring: 'trial', decided_on: '2026-11-10', as_of: '2026-11-10',
    })
    await record({ id: 'experiment.t-late', kind: 'experiment', status: 'running', answer: 'Merge on green without waiting for a look.' })
    await db.query(`select knowledge.set_experiment_terms('experiment.t-late', 'practice.t-push-once', 'Four days from green to merge.', 'Days from green to merge.', '2026-11-01'::date)`)
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
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

  // [guards F128.7 partial: the monthly Issue is no longer opened by a workflow; the list itself is the tool's]
  it('upkeep lists experiments past their verdict date and practices not confirmed in 90 days', async () => {
    const out = await runTool(db, 'upkeep', { today: '2026-11-20' })
    expect(out.text).toContain('experiment.t-late (experiment): verdict was due 2026-11-01 and is still running')
    expect(out.text).not.toContain('practice.t-second-review')
    const later = await runTool(db, 'upkeep', { today: '2027-03-01' })
    expect(later.text).toContain('practice.t-second-review (practice): not confirmed since 2026-10-21')
  })

  it('the drift step reads every live practice the store holds, and the pack rows carry the steps', async () => {
    const ids = (await readEnforced(db)).map((r) => r.id)
    expect(ids).toEqual(expect.arrayContaining(['practice.t-second-review', REVIEW_METHOD_ID]))
    expect((await packRows(db)).steps).toBe(STEPS)
  })
})
