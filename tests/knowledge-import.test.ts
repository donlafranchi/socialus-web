import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { readRulings } from '../scripts/knowledge/plan-source'
import { renderConstraints } from '../scripts/knowledge/render'
import { enterStore, leaveStore, importAll, type Sources } from '../scripts/knowledge/import'
import { exportConstraints } from '../scripts/knowledge/export'

// F125 / T1017 (#1218) — the knowledge import. Reads a checkout of
// socialus-plan (and socialus-ops, for its absolutes file), imports it into
// the store, and reads constraints/code.md back out. CI checks both out at a
// pinned commit (.github/workflows/ci.yml); locally they are the sibling repos.
// The database half runs in one transaction that is always rolled back, so it
// leaves nothing behind for the store's own suite.

const PLAN = resolve(process.env.KNOWLEDGE_PLAN_DIR ?? '../socialus-plan')
const OPS = resolve(process.env.KNOWLEDGE_OPS_DIR ?? '../socialus-ops')
const HAVE_SOURCES = existsSync(resolve(PLAN, 'constraints/code.md')) && existsSync(resolve(OPS, 'process/ABSOLUTES.md'))

const SOURCES_RUNNABLE = requireRunnable({
  claim: "the knowledge import reads socialus-plan's rulings exactly as its own constraints generator does",
  available: HAVE_SOURCES,
  remedy: 'check out socialus-plan and socialus-ops beside this repo, or set KNOWLEDGE_PLAN_DIR and KNOWLEDGE_OPS_DIR',
})

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const DB_RUNNABLE = requireRunnable({
  claim: "every live ruling lands in the knowledge store, and the store's constraints/code.md matches the hand-built one",
  available: safety.safe && HAVE_SOURCES,
  remedy: `${safety.reason} And check out socialus-plan and socialus-ops (see SOURCES above). Recipe in .env.local.example`,
})

const handBuilt = (tier: string) => readFileSync(resolve(PLAN, `constraints/${tier}.md`), 'utf8')

describe.skipIf(!SOURCES_RUNNABLE)('the import reads the rulings as markers.py does', () => {
  it('rebuilds constraints/code.md and planning.md from the parsed rulings alone', () => {
    const rows = readRulings(PLAN)
      .filter((r) => r.listed)
      .map((r) => ({
        date: r.date, holds: r.holds, tiers: r.binds ? r.binds.tiers : null,
        surfaces: r.binds?.surfaces ?? [], words: r.words, file: r.file, line: r.line,
      }))
    expect(renderConstraints('code', rows)).toBe(handBuilt('code'))
    expect(renderConstraints('planning', rows)).toBe(handBuilt('planning'))
  })

  it('reads every line of PRINCIPLES.md that carries a date as a principle', () => {
    const principles = readRulings(PLAN).filter((r) => r.principle)
    const dated = readFileSync(resolve(PLAN, 'PRINCIPLES.md'), 'utf8')
      .split('\n')
      .filter((l) => /^- (<a id="[a-z0-9-]+"><\/a>)?\*\*\d{4}-\d{2}-\d{2} — /.test(l))
    expect(principles.length).toBe(dated.length)
    expect(principles.length).toBeGreaterThan(0)
  })
})

describe.skipIf(!DB_RUNNABLE)('F125 — the knowledge import', () => {
  let pool: Pool
  let db: PoolClient
  const agent = 'import-test'
  const src: Sources = {
    planDir: PLAN,
    opsDir: OPS,
    registryPath: resolve(__dirname, '..', 'src', 'ontology', 'registry.json'),
  }
  let first: Awaited<ReturnType<typeof importAll>>
  let second: Awaited<ReturnType<typeof importAll>>
  let exported: string

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    db = await pool.connect()
    await db.query('begin')
    await enterStore(db, agent)
    first = await importAll(db, src)
    exported = await exportConstraints(db, 'code')
    second = await importAll(db, src)
  })

  afterAll(async () => {
    await db?.query('rollback')
    db?.release()
    await pool?.end()
  })

  // [guards F125.1 partial: a concern for the rulings whose surfaces map to none, or that carry no binds tag]
  it("exports a constraints/code.md that matches socialus-plan's line for line", () => {
    const want = handBuilt('code').split('\n')
    const got = exported.split('\n')
    for (let i = 0; i < Math.max(want.length, got.length); i++) expect(got[i], `line ${i + 1}`).toBe(want[i])
  })

  it('holds every live ruling as a dated record with its words, holds and tags', async () => {
    const rulings = readRulings(PLAN)
    const { rows } = await db.query<{ n: string; dated: string; tagged: string }>(
      `select count(*) as n,
              count(*) filter (where decided_on is not null and btrim(answer) <> '') as dated,
              count(*) filter (where cardinality(tags) > 0) as tagged
         from knowledge.records
        where kind in ('decision', 'philosophy') and source ~ '^[^:#]+\\.md:[0-9]+$'`,
    )
    expect(Number(rows[0].n)).toBe(rulings.length)
    expect(Number(rows[0].dated)).toBe(rulings.length)
    expect(Number(rows[0].tagged)).toBe(rulings.filter((r) => r.binds || r.anchor).length)
    const philosophies = await db.query(`select 1 from knowledge.records where kind = 'philosophy'`)
    expect(philosophies.rowCount).toBe(rulings.filter((r) => r.principle).length)
  })

  it('brings in both absolutes files at strength absolute, and the ontology registry', async () => {
    const { rows } = await db.query<{ kind: string; strength: string; n: string }>(
      `select kind, strength, count(*) as n from knowledge.records
        where 'absolute' = any (tags) or kind in ('noun', 'verb', 'link') group by 1, 2 order by 1, 2`,
    )
    const registry = JSON.parse(readFileSync(src.registryPath, 'utf8'))
    const count = (k: string, s: string) => Number(rows.find((r) => r.kind === k && r.strength === s)?.n ?? 0)
    expect(count('decision', 'absolute')).toBeGreaterThanOrEqual(8)
    expect(count('noun', 'guideline')).toBe(registry.objectTypes.length + registry.rejectedAsNouns.length)
    expect(count('verb', 'guideline')).toBe(registry.handlers.length)
    expect(count('link', 'guideline')).toBe(registry.links.length)
  })

  it('writes every change as the import, for the PM, through the history', async () => {
    const { rows } = await db.query<{ n: string; named: string }>(
      `select count(*) as n, count(*) filter (where person = 'the PM' and agent = $1) as named from knowledge.history`,
      [agent],
    )
    // F130: the concepts the import loads (the traced timelines, IMAGINE.md's
    // ideas, and the scenarios that name them) are recorded by the same run.
    const c = first.concepts!
    const all = first.recorded + c.conceptsRecorded + c.conceptsRevised + c.ideasRecorded + c.features
    expect(Number(rows[0].n)).toBe(all)
    expect(Number(rows[0].named)).toBe(all)
  })

  it('changes nothing when run again on the same files', () => {
    expect(first.recorded).toBeGreaterThan(0)
    expect(second).toMatchObject({ recorded: 0, revised: 0, retired: 0, links: 0, unchanged: first.recorded })
    expect(second.goneWithoutReplacement).toEqual([])
  })

  // [guards F125.10 partial: departs_from, since the rulings state no departures for the import to bring in]
  it('marks every applies link it guessed as inferred, and one call lists them per principle', async () => {
    const { rows } = await db.query<{ basis: string; reason: string }>(
      `select basis, reason from knowledge.links where type = 'applies'`,
    )
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      if (r.basis === 'stated') expect(r.reason).toMatch(/^Cites #[a-z0-9-]+\.$/)
      else expect(r.basis).toBe('inferred')
    }
    const { rows: top } = await db.query<{ to_id: string }>(
      `select to_id from knowledge.links where type = 'applies' and basis = 'inferred'
        group by to_id order by count(*) desc limit 1`,
    )
    const precedents = await db.query<{ basis: string; link_type: string }>(
      'select basis, link_type from knowledge.precedents_of($1)',
      [top[0].to_id],
    )
    expect(precedents.rows.length).toBeGreaterThan(0)
    expect(precedents.rows.some((p) => p.basis === 'inferred' && p.link_type === 'applies')).toBe(true)
  })

  // [guards F125.6 partial: the store's own refusals, which #1217's suite covers]
  it('names no model or agent as the audience of anything it imported', async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from knowledge.records
        where audience not in ('public', 'members', 'department', 'operators')
           or exists (select 1 from unnest(tags || departments) t
                       where t ~* '\\m(claude|anthropic|openai|gpt|gemini|llama|haiku|sonnet|opus|fable|codex)\\M')`,
    )
    expect(rows).toEqual([])
  })

  it('leaves the store login and the run key withdrawn', async () => {
    await leaveStore(db, agent)
    const { rows } = await db.query<{ revoked: boolean }>(
      `select revoked_at is not null as revoked from knowledge.agents where name = $1`,
      [agent],
    )
    expect(rows[0].revoked).toBe(true)
  })
})
