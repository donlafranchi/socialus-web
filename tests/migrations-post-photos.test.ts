// F099 — a post carries at most one photo of its own, with hide and remove state
// beside it, and the Page's own photo is not the post's.
import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const RUNNABLE = requireRunnable({
  claim: 'a post can carry one photo of its own, with hide and remove state',
  available: !!DATABASE_URL,
  remedy: 'run `supabase start`, then put DATABASE_URL in .env.test.local (recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('F099 — page_posts photo columns', () => {
  const query = async <T>(sql: string): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      return (await pool.query(sql)).rows as T[]
    } finally {
      await pool.end()
    }
  }

  // [guards F099.3]
  it('has one nullable photo URL, and the hide and remove state beside it', async () => {
    const rows = await query<{ column_name: string; data_type: string; is_nullable: string }>(
      `select column_name, data_type, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'page_posts' and column_name like 'photo%'`,
    )
    const by = Object.fromEntries(rows.map((r) => [r.column_name, r]))
    expect(Object.keys(by).sort()).toEqual(['photo_hidden_at', 'photo_hide_locked_url', 'photo_removed_at', 'photo_url'].sort())
    for (const r of rows) expect(r.is_nullable).toBe('YES')
    expect(by['photo_url']!.data_type).toBe('text')
  })
})
