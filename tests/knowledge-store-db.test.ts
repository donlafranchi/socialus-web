import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// F125 — the knowledge store's test suite. The tests are SQL, in
// supabase/tests/knowledge_store.sql, so they read as the store's own rules
// and run with psql as easily as here; each criterion marker sits on its
// block there. This file only runs them: one test per "-- test:" block, each
// in its own transaction after the preamble, always rolled back.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim:
    'the knowledge store keeps every version, refuses what its rules refuse, and walls departments off from each other',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const SUITE = readFileSync(resolve(__dirname, '..', 'supabase', 'tests', 'knowledge_store.sql'), 'utf8')

function splitSuite(sql: string): { preamble: string; tests: { name: string; body: string }[] } {
  const [head, ...rest] = sql.split(/^-- test: /m)
  const preamble = head.slice(head.indexOf('-- preamble'))
  const tests = rest.map((chunk) => {
    const nl = chunk.indexOf('\n')
    return { name: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1) }
  })
  return { preamble, tests }
}

const { preamble, tests } = splitSuite(SUITE)

describe('the suite file', () => {
  it('has a preamble and the tests the brief asks for', () => {
    expect(preamble).toContain('knowledge.add_agent')
    expect(tests.length).toBeGreaterThanOrEqual(12)
  })
})

describe.skipIf(!RUNNABLE)('F125 — the knowledge store', () => {
  let pool: Pool
  let client: PoolClient

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()
  })

  afterAll(async () => {
    client?.release()
    await pool?.end()
  })

  for (const t of tests) {
    it(t.name, async () => {
      await client.query('begin')
      try {
        await client.query(preamble)
        await client.query(t.body)
      } finally {
        await client.query('rollback')
      }
    })
  }
})
