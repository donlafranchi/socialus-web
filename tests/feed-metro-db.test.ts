// T155 (#52) — the metro resolver against a real database.
//
// The unit tests stub the client, so they prove the precedence logic and
// nothing about whether `metro_polygons` has the columns this reads or the row
// `DEFAULT_METRO_SLUG` names. That gap is exactly how a resolver ships green
// and returns null in production, so this suite closes it.
//
// Read-only — three SELECTs — so it takes T150's fail-loudly gate but NOT
// T151's write-safe gate, for the same reason rls-coverage.test.ts does not.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'
import { DEFAULT_METRO_SLUG } from '../src/lib/feed/feed-metro'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const RUNNABLE = requireRunnable({
  claim: 'the metro the feed defaults to actually exists in the database',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('T155 — metro_polygons, as the resolver reads it', () => {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(sql, params)
      return rows as T[]
    } finally {
      await pool.end()
    }
  }

  it('exposes exactly the columns the resolver selects', async () => {
    const rows = await query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'metro_polygons'`,
    )
    const columns = new Set(rows.map((r) => r.column_name))
    for (const needed of ['id', 'slug', 'name']) {
      expect(columns.has(needed), `metro_polygons is missing ${needed}`).toBe(true)
    }
  })

  it('holds the row DEFAULT_METRO_SLUG names', async () => {
    // If this fails, every unresolvable feed lands on null rather than on the
    // default — the blank-feed outcome the fallback exists to prevent.
    const rows = await query<{ slug: string }>(
      'select slug from public.metro_polygons where slug = $1',
      [DEFAULT_METRO_SLUG],
    )
    expect(rows).toHaveLength(1)
  })

  it('keeps slug unique, so a slug lookup can use maybeSingle', async () => {
    const rows = await query<{ slug: string; n: string }>(
      'select slug, count(*) as n from public.metro_polygons group by slug having count(*) > 1',
    )
    expect(rows).toEqual([])
  })
})
