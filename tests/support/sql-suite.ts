import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './runnable'
import { databaseWriteSafety } from './write-safe'

// A test suite written in SQL (supabase/tests/*.sql), so it reads as the
// store's own rules and runs with psql as easily as here. Each criterion
// marker sits on its block in the SQL file. One test per "-- test:" block,
// each in its own transaction after the preamble, always rolled back.

export function splitSuite(sql: string): { preamble: string; tests: { name: string; body: string }[] } {
  const [head, ...rest] = sql.split(/^-- test: /m)
  const preamble = head.slice(head.indexOf('-- preamble'))
  const tests = rest.map((chunk) => {
    const nl = chunk.indexOf('\n')
    return { name: chunk.slice(0, nl).trim(), body: chunk.slice(nl + 1) }
  })
  return { preamble, tests }
}

export function runSqlSuite(opts: {
  file: string
  title: string
  claim: string
  atLeast: number
  /** Per test, in ms. A suite whose preamble can wait on another suite's open transaction (the role grant) sets it. */
  timeout?: number
}): void {
  const DATABASE_URL =
    process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
  const safety = databaseWriteSafety(DATABASE_URL, process.env)
  const RUNNABLE = requireRunnable({
    claim: opts.claim,
    available: safety.safe,
    remedy: `${safety.reason} Recipe in .env.local.example`,
  })

  const suite = readFileSync(resolve(__dirname, '..', '..', 'supabase', 'tests', opts.file), 'utf8')
  const { preamble, tests } = splitSuite(suite)

  describe(`${opts.file}`, () => {
    it('has a preamble and its tests', () => {
      expect(preamble).toContain('knowledge.add_agent')
      expect(tests.length).toBeGreaterThanOrEqual(opts.atLeast)
    })
  })

  describe.skipIf(!RUNNABLE)(opts.title, () => {
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
      }, opts.timeout)
    }
  })
}
