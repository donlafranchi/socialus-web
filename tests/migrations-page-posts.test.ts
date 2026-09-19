// T162 (#75) — page_posts and browse_posts against a real database.
//
// T156 (2026-09-19) folded `browse_posts` into `browse_feed`, so what is left
// here is the table: its grain, its cascades, its nullable absences and its
// read-only RLS. The post-grain BROWSE behaviour moved with the function, to
// tests/migrations-browse-feed.test.ts.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const FILE = readdirSync(MIG).find((f) => /^\d{14}_page_posts\.sql$/.test(f))

describe('T162 — the migration file', () => {
  it('exists, timestamped per #39', () => {
    expect(FILE, 'expected a YYYYMMDDHHMMSS_page_posts.sql').toBeTruthy()
  })

  const raw = FILE && existsSync(resolve(MIG, FILE)) ? readFileSync(resolve(MIG, FILE), 'utf8') : ''
  // Scanned with `--` comments and every single-quoted literal stripped,
  // extending the convention in migrations-reports-and-photo-hiding.test.ts.
  // Prose explaining *why* a thing is absent is not a regression; DDL
  // containing it is. Literals go rather than `comment on ... ;` statements
  // because a comment body may itself contain a semicolon — one does — and a
  // statement-terminator scan stops inside the string and reads the tail as
  // DDL. `''` escapes are consumed by the same pass.
  const sql = raw
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/'(?:[^']|'')*'/g, "''")

  it('never derives visibility from payment — not now, not as a column', () => {
    // #51: ordering may carry community response and may never carry payment.
    // The same holds for what is shown at all. Asserted on the migration text
    // so a later edit has to delete this test to add one.
    for (const word of ['payment', 'paid', 'subscription', 'plan_tier', 'promoted', 'sponsored', 'boost']) {
      expect(sql.toLowerCase(), `page_posts DDL must not mention ${word}`).not.toContain(word)
    }
    // ...and the migration must still say out loud why, so the rule survives
    // a reader who never opens this test.
    expect(raw.toLowerCase()).toContain('payment')
  })

  it('drops any replaced signature in the same migration, so no overload pair can exist', () => {
    expect(sql).toMatch(/drop function if exists public\.browse_posts/i)
  })
})

const RUNNABLE = requireRunnable({
  claim: 'the post table exists and is shaped as specified',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('T162 — page_posts, as shipped', () => {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(sql, params)
      return rows as T[]
    } finally {
      await pool.end()
    }
  }

  it('exists', async () => {
    const rows = await query<{ n: string }>(
      `select count(*) as n from information_schema.tables
        where table_schema = 'public' and table_name = 'page_posts'`,
    )
    expect(Number(rows[0].n)).toBe(1)
  })

  it('carries one row per post, keyed on its own id — not one row per Page', async () => {
    // The grain that was wrong in the retired model: discoverable_items is
    // unique on (item_id). A Page has many posts.
    const rows = await query<{ column_name: string }>(
      `select a.attname as column_name
         from pg_index i join pg_attribute a
           on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
        where i.indrelid = 'public.page_posts'::regclass and i.indisprimary`,
    )
    expect(rows.map((r) => r.column_name)).toEqual(['id'])
  })

  it('cascades from groups — a post has no life independent of its Page', async () => {
    const rows = await query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.page_posts'::regclass and contype = 'f'`,
    )
    const toGroups = rows.map((r) => r.def).find((d) => /references (public\.)?groups/i.test(d))
    expect(toGroups).toBeTruthy()
    expect(toGroups!.toLowerCase()).toContain('on delete cascade')
  })

  it("resolves an optional location through locations, and does not cascade a post away with it", async () => {
    const rows = await query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.page_posts'::regclass and contype = 'f'`,
    )
    const toLocations = rows.map((r) => r.def).find((d) => /references (public\.)?locations/i.test(d))
    expect(toLocations).toBeTruthy()
    expect(toLocations!.toLowerCase()).not.toContain('on delete cascade')
  })

  it('makes the start time and the location nullable — both are first-class absences', async () => {
    const rows = await query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'page_posts'`,
    )
    const by = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]))
    expect(by['starts_at']).toBe('YES')
    expect(by['location_id']).toBe('YES')
    // ...and the things that are never absent.
    expect(by['group_id']).toBe('NO')
    expect(by['body']).toBe('NO')
    expect(by['created_at']).toBe('NO')
    expect(by['updated_at']).toBe('NO')
  })

  it('uses the same lifecycle vocabulary as groups', async () => {
    const rows = await query<{ def: string }>(
      `select pg_get_constraintdef(oid) as def from pg_constraint
        where conrelid = 'public.page_posts'::regclass and contype = 'c'`,
    )
    const all = rows.map((r) => r.def).join(' ')
    for (const v of ['draft', 'active', 'dissolved']) expect(all).toContain(v)
    for (const v of ['listed', 'unlisted', 'private']) expect(all).toContain(v)
  })

  it('has RLS enabled', async () => {
    const rows = await query<{ relrowsecurity: boolean }>(
      `select relrowsecurity from pg_class where oid = 'public.page_posts'::regclass`,
    )
    expect(rows[0].relrowsecurity).toBe(true)
  })

  it('has read policies and no write policy — writes go through the action layer (ADR-7)', async () => {
    const rows = await query<{ polcmd: string }>(
      `select polcmd from pg_policy where polrelid = 'public.page_posts'::regclass`,
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r) => r.polcmd === 'r')).toBe(true)
  })
})


// T156 (#53) — browse_posts is gone, folded into browse_feed.
//
// Its coverage did not go with it: the post-grain behaviour it asserted — the
// flat rule, the past-dated drop-out, a post's own pin — is re-asserted
// against `browse_feed` in tests/migrations-browse-feed.test.ts. What is left
// here is the claim that no second post-grain browse path survives, because
// two of them is how the grain drifts back apart.
describe.skipIf(!RUNNABLE)('T162 — browse_posts, superseded by browse_feed', () => {
  it('no longer exists', async () => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.proname = 'browse_posts'`,
      )
      expect(rows).toEqual([])
    } finally {
      await pool.end()
    }
  })
})
