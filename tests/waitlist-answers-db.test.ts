import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #1299 (F076.3) — the waitlist answers are staff-only: no browser role can select them, and a signed-in member
// still reads only the original columns of their own row. Reads the catalogue; writes nothing.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'no browser role can read the waitlist answers',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const ANSWERS = ['name', 'phone', 'zip', 'plans', 'offers', 'offer_name', 'offer_link', 'email']
let pool: Pool

beforeAll(() => {
  if (RUNNABLE) pool = new Pool({ connectionString: DATABASE_URL })
})
afterAll(async () => {
  if (RUNNABLE) await pool.end()
})

describe.skipIf(!RUNNABLE)('#1299 waitlist answers are staff-only', () => {
  it('anon and authenticated cannot select any answer column; authenticated keeps the original ones', async () => {
    const { rows } = await pool.query<{ role: string; col: string; can: boolean }>(
      `select r.role, c.col, has_column_privilege(r.role, 'public.metro_waitlist', c.col, 'select') as can
         from unnest(array['anon', 'authenticated']) r(role)
         cross join unnest($1::text[] || array['id', 'member_id', 'metro_id', 'role']) c(col)`,
      [ANSWERS],
    )
    const readable = rows.filter((r) => r.can).map((r) => `${r.role}.${r.col}`).sort()
    expect(readable).toEqual(['authenticated.id', 'authenticated.member_id', 'authenticated.metro_id', 'authenticated.role'])
  })
})
