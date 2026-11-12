import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore } from '../scripts/knowledge/import'
import {
  loadRun, loadRuns, namedIn, readJson, recordRun, LOAD_PRACTICE, NEXT_FOR_LAYER, ROUTINES_PATH, RUNS_SEED_PATH,
  type LoadResult, type Routine, type SeedRun,
} from '../scripts/knowledge/runs'
import { historyText, type RunHistory } from '@/lib/knowledge/runs'
import { runTool } from '@/lib/knowledge/tools'

// F135 (#1274): each run of a repeated routine keeps a dated record. Here: how
// a load run becomes a record (scripts/knowledge/runs.ts), how a merged PR
// names a run, the workflows that call them, the seed of run one, and the
// lookup tool's `runs` verb. The store's own rules are tested in SQL:
// supabase/tests/knowledge_runs.sql.

const ROOT = join(__dirname, '..')
const result: LoadResult = {
  firstBroken: { level: 'view-out-200', load: '200 viewers', layers: [{ layer: 'rendering', why: 'the app process at 290%' }] },
  firstSaturated: { layer: 'rendering', level: 'view-out-200', why: 'the app process at 290%' },
  levels: [
    { level: 'view-out-50', load: '50 viewers', rps: 19, p50: 19, p95: 44, failed: 0, broke: false, layers: [] },
    { level: 'view-out-200', load: '200 viewers', rps: 65, p50: 296, p95: 1030.4, failed: 0, broke: true, layers: [{ layer: 'rendering', why: 'x' }] },
    { level: 'view-out-1000', load: '1000 viewers', rps: 84, p50: 2400, p95: 30000, failed: 0.15, broke: true, layers: [{ layer: 'rendering', why: 'x' }] },
  ],
  cold: { pageSignedOut: { ms: 377, status: 200 } },
}
const env = {
  GITHUB_SHA: '6860c49821eee7728958870f4e76ee51bbd8a28c', GITHUB_RUN_ID: '43120126693', GITHUB_RUN_ATTEMPT: '1',
  GITHUB_REPOSITORY: 'donlafranchi/socialus-web', LOAD_LEVELS: '50 200 1000', LOAD_OUTCOME: 'success',
}

describe('a load run, as a record', () => {
  // [guards F135.1 partial: the store's side, in supabase/tests/knowledge_runs.sql]
  it('carries the date, commit, members simulated, the numbers per level, what broke first and next ideas', () => {
    const run = loadRun(result, env, '2026-11-11')
    expect(run).toMatchObject({
      practice: LOAD_PRACTICE, key: 'gh:43120126693:1', ran_on: '2026-11-11', commit: env.GITHUB_SHA, members: 1000,
      outcome: 'passed', broke_first: 'rendering at 200 viewers (view-out-200)',
      url: 'https://github.com/donlafranchi/socialus-web/actions/runs/43120126693',
    })
    expect(run.summary).toBe('First to break: 200 viewers (view-out-200), rendering; p95 1 s there.')
    expect((run.numbers.levels as Record<string, { p95_ms: number; broke: boolean }>)['view-out-200']).toMatchObject({ p95_ms: 1030, broke: true })
    expect(run.ideas).toEqual([NEXT_FOR_LAYER.rendering])
  })

  // [guards F135.2 partial: the store refusing a second write and a non-operator is supabase/tests/knowledge_runs.sql]
  it('is written pass or fail: a run that stopped before its first level, or whose step failed, is a failed run', () => {
    const stopped = loadRun(null, { ...env, LOAD_OUTCOME: 'failure' }, '2026-11-12')
    expect(stopped).toMatchObject({ outcome: 'failed', broke_first: 'the run stopped before its first level', numbers: {} })
    expect(stopped.summary).toBe('The load simulation stopped before its first level.')
    expect(loadRun(result, { ...env, LOAD_OUTCOME: 'failure' }).outcome).toBe('failed')
    expect(loadRun(result, { ...env, LOAD_OUTCOME: '' }).outcome).toBe('failed') // the step never ran
    expect(() => loadRun(result, { ...env, GITHUB_SHA: undefined })).toThrow(/names its commit/)
  })

  it('keeps the ideas a person typed, once each, after the one for the layer that broke', () => {
    const run = loadRun(result, { ...env, LOAD_IDEAS: 'Try 5,000 viewers; Try 5,000 viewers\nShard the Page' })
    expect(run.ideas).toEqual([NEXT_FOR_LAYER.rendering, 'Try 5,000 viewers', 'Shard the Page'])
  })

  // [guards F135.2 partial: the store's side is supabase/tests/knowledge_runs.sql]
  it('the Load simulation workflow records every run that was not cancelled, and a run that cannot record fails it', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/load.yml'), 'utf8')
    const step = yml.slice(yml.indexOf('- name: Record the run in the knowledge store'), yml.indexOf('- uses: actions/upload-artifact'))
    expect(step).toContain("if: ${{ !cancelled() }}")
    expect(step).toContain('LOAD_OUTCOME: ${{ steps.load.outcome }}')
    expect(step).toContain('runs.ts record-load load-out --commit')
    expect(step).not.toMatch(/continue-on-error|\|\| true/)
    expect(yml).toMatch(/- name: Load simulation\n\s+id: load\n/)
  })
})

describe('a merged PR names what it followed', () => {
  // [guards F135.3 partial: linking in the store is supabase/tests/knowledge_runs.sql]
  it('finds runs, ideas and practices in a PR body, once each', () => {
    expect(namedIn('Follows RN-0001 and ID-0003; see practice.load-sim-and-checkpoints. Again RN-0001.')).toEqual([
      'RN-0001', 'ID-0003', 'practice.load-sim-and-checkpoints',
    ])
    expect(namedIn('Closes #1270. The run-history page. ID-12. practice.')).toEqual([])
    expect(namedIn(null)).toEqual([])
  })

  // [guards F135.3 partial: linking in the store is supabase/tests/knowledge_runs.sql]
  it('the link workflow runs on every merge to main and links what the body names', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/knowledge-run-links.yml'), 'utf8')
    expect(yml).toMatch(/pull_request:\n\s+types: \[closed\]\n\s+branches: \[main\]/)
    expect(yml).toContain('github.event.pull_request.merged == true')
    expect(yml).toContain('runs.ts link-pr --commit')
    expect(yml).toContain('MERGED_AT: ${{ github.event.pull_request.merged_at }}')
  })
})

describe('the one-call answer, in words', () => {
  const h: RunHistory = {
    practice: { id: LOAD_PRACTICE, answer: 'Load-test locally.', name: 'Load simulation', every_days: 90, workflow: 'load.yml' },
    runs: [
      {
        id: 'RN-0001', ran_on: '2026-11-11', outcome: 'passed', summary: 'First to break: 200 viewers.', commit: env.GITHUB_SHA, members: 1000,
        numbers: { levels: { 'view-out-200': { p95_ms: 1030, rps: 65, failed: 0, broke: true } } }, broke_first: 'rendering at 200 viewers',
        url: null, changed_after: [{ url: 'https://github.com/x/y/pull/1270', label: '#1270 taps under load' }], tried: [],
      },
      {
        id: 'RN-0002', ran_on: '2027-01-10', outcome: 'passed', summary: 'Nothing broke up to 1000 viewers.', commit: 'abcdef1234', members: 1000,
        numbers: { levels: { 'view-out-200': { p95_ms: 300, rps: 70, failed: 0, broke: false } } }, broke_first: null, url: null,
        changed_after: [], tried: ['ID-0002'],
      },
    ],
    open: [{ id: 'ID-0001', answer: 'Cache the signed-out Page.', since: '2026-11-11', from: 'RN-0001' }],
    closed: [{ id: 'ID-0002', answer: 'Raise the pool.', status: 'tried', on: '2027-01-10', why: 'Tried by RN-0002.' }],
  }

  // [guards F135.7 partial: the store's read is supabase/tests/knowledge_runs.sql]
  it('lists each run in date order with its numbers and what broke first, the changes between, and the open list', () => {
    const text = historyText(h)
    expect(text).toBe(
      [
        `Load simulation (${LOAD_PRACTICE}), expected every 90 days.`,
        '',
        '2026-11-11 · RN-0001 · passed · 6860c49 · 1,000 members',
        '  First to break: 200 viewers.',
        '  Broke first: rendering at 200 viewers',
        '  view-out-200 (broke): p95 1 s, 65/s, 0% failed',
        '  Changed after: #1270 taps under load',
        '',
        '2027-01-10 · RN-0002 · passed · abcdef1 · 1,000 members',
        '  Nothing broke up to 1000 viewers.',
        '  view-out-200: p95 300 ms, 70/s, 0% failed',
        '  Tried: ID-0002',
        '',
        'Try next time:',
        '- ID-0001 (since 2026-11-11, from RN-0001): Cache the signed-out Page.',
        '',
        'Tried or dropped:',
        '- ID-0002 tried 2027-01-10: Raise the pool. (Tried by RN-0002.)',
      ].join('\n'),
    )
  })
})

describe('the routines and run one, as committed', () => {
  // [guards F135.5 partial: loading them into the store is the database test below]
  it('name the load simulation as a routine and seed run one from the first load simulation', () => {
    const routines = readJson<{ routines: Routine[] }>(ROUTINES_PATH)!.routines
    expect(routines.map((r) => r.practice)).toEqual([LOAD_PRACTICE])
    const runs = readJson<{ runs: SeedRun[] }>(RUNS_SEED_PATH)!.runs
    expect(runs[0]).toMatchObject({
      practice: LOAD_PRACTICE, key: 'gh:43120126693:1', ran_on: '2026-11-11', commit: '6860c49821eee7728958870f4e76ee51bbd8a28c',
      members: 1000, broke_first: 'rendering at 200 viewers (view-out-200)',
    })
    expect(Object.keys((runs[0].numbers as { levels: object }).levels)).toHaveLength(8)
    expect(runs.map((r) => r.ran_on)).toEqual(['2026-11-11', '2026-11-12']) // run two: the taps-under-load fix (#1270)
  })
})

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'routines and run one load from their files, and the runs verb answers from them in one call',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!RUNNABLE)('F135: runs loaded into the store and read back', () => {
  let pool: Pool
  let db: PoolClient

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, 'runs-test')
    await db.query(`select knowledge.record($1::jsonb, 'F135 test')`, [
      JSON.stringify({ id: LOAD_PRACTICE, kind: 'practice', concern: 'how-shipping', answer: 'Load-test locally.', why: 'Production holds real members.',
                       scope: 'process', audience: 'members', ring: 'assess' }),
    ])
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F135.5]
  it('the import loads the routine, run one from #1264 and run two from #1270, once', async () => {
    const first = await loadRuns(db)
    expect(first).toMatchObject({ routines: 1 })
    expect(first.recorded).toHaveLength(2)
    expect(await loadRuns(db)).toMatchObject({ routines: 1, recorded: [] })
    const { rows } = await db.query(
      `select t.ran_on::text, t.commit, t.members, t.broke_first, x.status, x.decided_on::text
         from knowledge.run_terms t join knowledge.records x on x.id = t.run_id where t.practice_id = $1 order by t.ran_on`,
      [LOAD_PRACTICE],
    )
    expect(rows).toEqual([{ ran_on: '2026-11-11', commit: '6860c49821eee7728958870f4e76ee51bbd8a28c', members: 1000,
                            broke_first: 'rendering at 200 viewers (view-out-200)', status: 'passed', decided_on: '2026-11-11' },
                          { ran_on: '2026-11-12', commit: 'e3fbc20715fb0e15c14732b91d5beedb84726519', members: 1000,
                            broke_first: 'rendering at 200 viewers (view-out-200)', status: 'passed', decided_on: '2026-11-12' }])
    // #1270 is what changed after run one, and run two, on that fix, tried the two ideas it acted on.
    const h = (await db.query(`select knowledge.run_history('load') as h`)).rows[0].h
    expect(h.runs[0].changed_after).toEqual([{ url: 'https://github.com/donlafranchi/socialus-web/pull/1270', label: expect.stringMatching(/^#1270 /) }])
    expect(h.runs[1].tried).toHaveLength(2)
    expect(h.closed.map((i: { status: string }) => i.status)).toEqual(['tried', 'tried'])
    // Run two's rendering idea joins run one's, still open, rather than adding a second.
    const { rows: open } = await db.query(`select count(*)::int as n from knowledge.records where kind = 'idea' and answer like 'Cut the server render%'`)
    expect(open[0].n).toBe(1)
  })

  // [guards F135.7]
  it('"how has load changed and what should we try next?" is one call to the runs verb', async () => {
    const later = loadRun({ firstBroken: null, levels: [{ level: 'view-out-1000', load: '1000 viewers', p95: 400, broke: false, layers: [] }] },
                          { ...env, GITHUB_RUN_ID: '9', GITHUB_SHA: 'abcdef1234567' }, '2026-11-12')
    await recordRun(db, { ...later, ideas: ['Try 5,000 viewers'] })
    const out = await runTool(db, 'runs', { routine: 'how has load changed and what should we try next?' })
    expect(out.isError).toBeFalsy()
    const lines = out.text.split('\n')
    expect(lines[0]).toBe(`Load simulation (${LOAD_PRACTICE}), expected every 90 days.`)
    expect(lines.findIndex((l) => l.startsWith('2026-11-11'))).toBeLessThan(lines.findIndex((l) => l.startsWith('2026-11-12')))
    expect(out.text).toContain('Broke first: rendering at 200 viewers (view-out-200)')
    expect(out.text).toContain('Nothing broke up to 1000 viewers')
    expect(out.text).toMatch(/- ID-\d{4} \(since 2026-11-12, from RN-\d{4}\): Try 5,000 viewers/)
    expect((await runTool(db, 'runs', { routine: 'the weather' })).text).toMatch(/^No routine matches "the weather"\. Routines with a run history: Load simulation\./)
  })

  it('the PM drops an idea through the lookup tool, with why', async () => {
    const id = (await db.query(`select id from knowledge.records where kind = 'idea' and answer = 'Try 5,000 viewers'`)).rows[0].id
    expect((await runTool(db, 'drop_idea', { id, why: 'Not before the second metro.' })).text).toBe(`${id} dropped: Not before the second metro.`)
    expect((await runTool(db, 'runs', { routine: 'load' })).text).toContain(`- ${id} dropped `)
  })

  // [guards F135.8 partial: the store's read is supabase/tests/knowledge_runs.sql]
  it('the upkeep verb lists a routine overdue and an idea open over 90 days', async () => {
    const out = await runTool(db, 'upkeep', { today: '2027-03-01' })
    expect(out.text).toMatch(new RegExp(`- ${LOAD_PRACTICE.replace('.', '\\.')} \\(routine\\): has not run since 2026-11-12 \\(expected every 90 days\\)`))
    expect(out.text).toMatch(/- ID-\d{4} \(idea\): open since 2026-11-11, over 90 days, untried\./)
    expect(out.text).not.toContain('Try 5,000 viewers') // dropped above
  })
})
