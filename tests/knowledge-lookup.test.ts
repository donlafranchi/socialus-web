import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { getEncoding } from 'js-tiktoken'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enterStore, importAll, type Sources } from '../scripts/knowledge/import'
import { TOOLS, runTool } from '@/lib/knowledge/tools'

// F125 / T1018 (#1219) — the lookup tool, against the real rulings. The tool
// functions run here exactly as the route runs them, on a connection that is
// the store's own login holding one agent's key; only the transaction around
// them differs (the route opens one per call, this file one for the whole
// suite, always rolled back). socialus-plan and socialus-ops are read at the
// commits CI pins, as the import's own test does.

const PLAN = resolve(process.env.KNOWLEDGE_PLAN_DIR ?? '../socialus-plan')
const OPS = resolve(process.env.KNOWLEDGE_OPS_DIR ?? '../socialus-ops')
const HAVE_SOURCES = existsSync(resolve(PLAN, 'constraints/code.md')) && existsSync(resolve(OPS, 'process/ABSOLUTES.md'))

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the lookup tool answers from the store as one agent at a time, and keeps every question it could not answer',
  available: safety.safe && HAVE_SOURCES,
  remedy: `${safety.reason} And check out socialus-plan and socialus-ops beside this repo, or set KNOWLEDGE_PLAN_DIR and KNOWLEDGE_OPS_DIR.`,
})

/** A real tokenizer, so "under 2,000 tokens" is counted, not guessed from characters. */
const tokens = (text: string) => getEncoding('o200k_base').encode(text).length

describe('the tool list', () => {
  it('offers the lookups and the two internal writes, and nothing names a model', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      ['as_of', 'built', 'can_do', 'concept', 'decide', 'get', 'history', 'how', 'live', 'next', 'plan', 'plan_changes', 'precedents', 'propose', 'related', 'review_method', 'roadmap', 'search', 'upkeep', 'where', 'why'].sort(),
    )
    for (const t of TOOLS) {
      expect(t.description, t.name).not.toMatch(/\b(claude|anthropic|openai|gpt|gemini|llama|haiku|sonnet|opus|fable|codex)\b/i)
    }
  })
})

describe.skipIf(!RUNNABLE)('F125 — the lookup tool', () => {
  let pool: Pool
  let db: PoolClient
  const keys: Record<'operator' | 'safety' | 'building', string> = { operator: '', safety: '', building: '' }

  /** Act as one agent: the store's login, holding that agent's key. */
  async function as(who: keyof typeof keys) {
    await db.query(`select set_config('knowledge.key', $1, true)`, [keys[who]])
  }
  const call = async (name: string, args: Record<string, unknown>) => {
    const out = await runTool(db, name, args)
    return out
  }

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    const src: Sources = {
      planDir: PLAN,
      opsDir: OPS,
      registryPath: resolve(__dirname, '..', 'src', 'ontology', 'registry.json'),
    }
    await enterStore(db, 'lookup-test-import')
    await importAll(db, src)
    // Three agents, minted as the schema owner, the way the keys workflow does.
    await db.query('reset role')
    for (const [who, depts, op] of [
      ['operator', '{}', true],
      ['safety', '{trust-and-safety}', false],
      ['building', '{building}', false],
    ] as const) {
      const { rows } = await db.query<{ key: string }>(
        `select knowledge.add_agent($1, 'a tester', $2::text[], $3) as key`,
        [`lookup-test-${who}`, depts, op],
      )
      keys[who] = rows[0].key
    }
    await db.query('set local role knowledge_store')
  }, 120_000)

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F125.9]
  it('gives a builder every live decision for moderation in one call, under 2,000 tokens', async () => {
    // The operator's key: it reads the most, so this is the longest answer any key gets.
    await as('operator')
    const out = await call('live', { concern: 'moderation-and-reports' })
    expect(out.isError).toBeFalsy()
    const { rows } = await db.query<{ id: string }>(
      `select id from knowledge.records where concern = 'moderation-and-reports' and status = 'live'`,
    )
    expect(rows.length).toBeGreaterThan(10)
    for (const r of rows) expect(out.text, r.id).toContain(r.id)
    // A margin under the 2,000: another tokenizer may count a little higher.
    expect(tokens(out.text)).toBeLessThan(1800)
  })

  it('lists the strictest first and says what each one follows', async () => {
    await as('operator')
    const out = await call('live', { concern: 'moderation-and-reports' })
    const lines = out.text.split('\n').filter((l) => l.startsWith('- '))
    expect(lines[0]).toMatch(/absolute/)
    expect(out.text).toMatch(/PH-\d{4}/)
  })

  it('names the concerns there are when asked about one that does not exist', async () => {
    await as('safety')
    const out = await call('live', { concern: 'moderaton' })
    expect(out.isError).toBe(true)
    expect(out.text).toContain('moderation-and-reports')
  })

  // [guards F125.12]
  it('keeps every search that finds nothing, with who asked', async () => {
    await as('building')
    const q = 'Are seashells accepted as currency on Tuesdays?'
    const out = await call('search', { question: q })
    expect(out.text).toMatch(/^Nothing found/)
    await as('operator')
    const found = await call('search', { question: 'report hides a post' })
    expect(found.text).not.toMatch(/^Nothing found/)
    const { rows } = await db.query<{ question: string; agent: string }>(
      `select question, agent from knowledge.unanswered where question in ($1, 'report hides a post')`,
      [q],
    )
    expect(rows).toEqual([{ question: q, agent: 'lookup-test-building' }])
  })

  it('finds a record by its words, live ones first, and by its id', async () => {
    await as('safety')
    const out = await call('search', { question: 'misusing reports strikes' })
    expect(out.text).toContain('D-')
    const byId = await call('search', { question: 'member-content-takedown' })
    expect(byId.text.split('\n').find((l) => l.startsWith('- '))).toContain('member-content-takedown')
  })

  // [guards F125.4]
  it('returns every version and the chain in one call, and what was live for a concern on a date', async () => {
    await as('operator')
    const old = await db.query<{ id: string }>(
      `select knowledge.record('{"kind":"decision","concern":"notifications","answer":"One market: Sacramento.","why":"A dense start in one city.","path":"well-worn"}',
                               'test', null, '2026-10-01') as id`,
    )
    const neu = await db.query<{ id: string }>(
      `select knowledge.record('{"kind":"decision","concern":"notifications","answer":"One market: Northern California.","why":"The city alone was too thin.","path":"well-worn"}',
                               'test', null, '2026-11-06') as id`,
    )
    await db.query(`select knowledge.retire($1, $2, 'replaced', '2026-11-06')`, [old.rows[0].id, neu.rows[0].id])

    const hist = JSON.parse((await call('history', { id: neu.rows[0].id })).text)
    expect(hist.versions.length).toBeGreaterThanOrEqual(1)
    expect(hist.older.map((o: { id: string }) => o.id)).toContain(old.rows[0].id)
    const back = JSON.parse((await call('history', { id: old.rows[0].id })).text)
    expect(back.newer.map((o: { id: string }) => o.id)).toContain(neu.rows[0].id)

    const october = await call('as_of', { concern: 'notifications', date: '2026-10-15' })
    expect(october.text).toContain('Sacramento')
    expect(october.text).not.toContain('Northern California')
    const now = await call('as_of', { concern: 'notifications', date: new Date().toISOString().slice(0, 10) })
    expect(now.text).toContain('Northern California')
    expect(now.text).not.toContain('Sacramento')
  })

  // [guards F125.10]
  it('lists every live decision that applies a pattern, with the ones that depart from it, inferred marked', async () => {
    await as('operator')
    const { rows } = await db.query<{ to_id: string }>(
      `select to_id from knowledge.links where type = 'applies' and basis = 'inferred'
        group by to_id order by count(*) desc limit 1`,
    )
    const pattern = rows[0].to_id
    const { rows: dep } = await db.query<{ id: string }>(
      `select id from knowledge.records r where kind = 'decision' and status = 'live'
          and not exists (select 1 from knowledge.links l where l.from_id = r.id and l.to_id = $1) limit 1`,
      [pattern],
    )
    await db.query(`select knowledge.link($1, $2, 'departs_from', 'stated', 'the one exception, for a reason')`, [
      dep[0].id,
      pattern,
    ])
    const out = await call('precedents', { pattern })
    expect(out.text).toContain(pattern)
    expect(out.text).toMatch(/Applies \(\d+/)
    expect(out.text).toMatch(/inferred/)
    expect(out.text).toMatch(/Departs from \(1\)/)
    expect(out.text).toContain(dep[0].id)
    expect(out.text).toContain('the one exception, for a reason')
  })

  it('groups the closest decisions to a question by the principles they apply', async () => {
    await as('operator')
    const out = await call('precedents', { question: 'members correct their own posts before staff step in' })
    expect(out.isError).toBeFalsy()
    expect(out.text).toMatch(/PH-\d{4}|rests on no principle/)
  })

  it('gives one record with its links and versions, and nothing a department key may not read', async () => {
    await as('operator')
    const { rows } = await db.query<{ id: string }>(
      `select knowledge.record('{"kind":"decision","concern":"moderation-and-reports","answer":"Internal moderation detail.","why":"Kept to the department.","audience":"department","departments":["trust-and-safety"],"path":"well-worn"}', 'test') as id`,
    )
    await as('safety')
    const seen = await call('get', { id: rows[0].id })
    expect(seen.text).toContain('Internal moderation detail.')
    await as('building')
    const hidden = await call('get', { id: rows[0].id })
    expect(hidden.isError).toBe(true)
    expect(hidden.text).not.toContain('Internal moderation detail.')
    const live = await call('live', { concern: 'moderation-and-reports' })
    expect(live.text).not.toContain(rows[0].id)
  })

  it('walks the links a record has, as many hops as asked', async () => {
    await as('operator')
    const { rows } = await db.query<{ from_id: string; to_id: string }>(
      `select from_id, to_id from knowledge.links where type = 'applies' limit 1`,
    )
    const out = await call('related', { id: rows[0].from_id })
    expect(out.text).toContain(rows[0].to_id)
    expect(out.text).toMatch(/applies/)
  })

  it('reads a why with its chain up to the platform, and every earlier wording', async () => {
    await as('operator')
    await db.query(
      `select knowledge.record('{"id":"platform-why","kind":"philosophy","answer":"The platform''s why.","why":"So neighbours find what is on near them.","audience":"operators","strength":"absolute"}', 'test')`,
    )
    const { rows } = await db.query<{ from_id: string; to_id: string }>(
      `select from_id, to_id from knowledge.links where type = 'applies' limit 1`,
    )
    await db.query(
      `select knowledge.revise($1, '{"why":"A sharper why."}', 'reworded', '{"signal":"a test"}')`,
      [rows[0].from_id],
    )
    const out = await call('why', { id: rows[0].from_id })
    expect(out.text).toContain('A sharper why.')
    expect(out.text).toContain(rows[0].to_id)
    expect(out.text).toContain('So neighbours find what is on near them.')
    expect(out.text).toMatch(/Earlier wordings/)
    expect(out.text).toContain('a test')
  })

  it('records a department agent\'s new-territory proposal as proposed, and only the PM\'s key decides it', async () => {
    await as('safety')
    const p = await call('propose', {
      record: {
        kind: 'decision',
        concern: 'moderation-and-reports',
        answer: 'A third report from one member is ignored.',
        why: 'One member cannot hide a post alone.',
        path: 'new territory',
        audience: 'department',
        departments: ['trust-and-safety'],
      },
      reason: 'seen in review',
      applies: [],
    })
    expect(p.isError).toBeFalsy()
    const id = /D-\d{4}/.exec(p.text)![0]
    expect(p.text).toMatch(/proposed/)
    const refused = await call('decide', { id, reason: 'agreed' })
    expect(refused.isError).toBe(true)
    await as('operator')
    const ok = await call('decide', { id, reason: 'agreed' })
    expect(ok.isError).toBeFalsy()
    const { rows } = await db.query<{ status: string }>('select status from knowledge.records where id = $1', [id])
    expect(rows[0].status).toBe('live')
  })

  it('refuses a proposal without a why, in words', async () => {
    await as('safety')
    const p = await call('propose', {
      record: { kind: 'decision', concern: 'moderation-and-reports', answer: 'No why.', path: 'well-worn',
                audience: 'department', departments: ['trust-and-safety'] },
      reason: 'test',
    })
    expect(p.isError).toBe(true)
    expect(p.text).toMatch(/needs a why/)
  })
})
