import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #347 — boundary layers are public data: anyone reads them, only the loader
// (service role) writes them, and every pin sits inside its own shape.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'boundary layers are readable by anyone, writable by nobody but the loader, and pin inside their shape',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const SQUARE = 'MULTIPOLYGON(((-121.5 38.5,-121.4 38.5,-121.4 38.6,-121.5 38.6,-121.5 38.5)))'

let pool: Pool
let client: PoolClient

async function as<T>(role: 'anon' | 'authenticated', sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    await client.query(`set local role ${role}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into public.boundaries (layer, source_id, name, geography, centroid, state_fips, county_fips, msa_code, source, source_url, licence, vintage)
     values ('tract', 'test-347', 'Test tract', $1::geography, st_pointonsurface($1::geometry)::geography, '06', '067', '40900', 'test', 'https://example.test', 'test', 'test')
     on conflict (layer, source_id) do nothing`,
    [`SRID=4326;${SQUARE}`],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.boundaries where source_id = 'test-347'`)
  client.release()
  await pool.end()
})

describe.runIf(RUNNABLE)('#347 — boundary layers', () => {
  it('anyone can read them, signed out or in', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      const rows = await as<{ name: string }>(role, `select name from public.boundaries where source_id = 'test-347'`)
      expect(rows).toEqual([{ name: 'Test tract' }])
    }
  })

  it('nobody but the loader can write them', async () => {
    const writes = [
      `update public.boundaries set name = 'x' where source_id = 'test-347'`,
      `delete from public.boundaries where source_id = 'test-347'`,
      `insert into public.boundaries (layer, source_id, name, geography, centroid, state_fips, source, source_url, licence, vintage)
       select layer, 'test-347-b', name, geography, centroid, state_fips, source, source_url, licence, vintage from public.boundaries where source_id = 'test-347'`,
    ]
    for (const role of ['anon', 'authenticated'] as const) {
      for (const sql of writes) {
        // Checked inside the same transaction, before the rollback hides it.
        await client.query('begin')
        try {
          await client.query(`set local role ${role}`)
          await client.query('savepoint w')
          await client.query(sql).catch(() => client.query('rollback to savepoint w'))
          await client.query('reset role')
          const { rows } = await client.query(`select name from public.boundaries where source_id like 'test-347%'`)
          expect(rows, `${role}: ${sql.slice(0, 30)}`).toEqual([{ name: 'Test tract' }])
        } finally {
          await client.query('rollback')
        }
      }
    }
  })

  it('every pin falls inside its own shape', async () => {
    const { rows } = await client.query<{ n: number }>(
      `select count(*)::int as n from public.boundaries where not st_covers(geography, centroid)`,
    )
    expect(rows[0]!.n).toBe(0)
  })
})
