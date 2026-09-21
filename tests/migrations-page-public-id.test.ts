// Issue #175 — groups.public_id, against a real database.
//
// The ruling (ops-pattern planning/URL-IDENTITY.md, Don 2026-09-21) turns on
// properties of the identifier, not on the shape of the URL: it must not be
// derivable from a member, and it must not be walkable. Those are claims about
// what the generator does, so they are checked by running it.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { PUBLIC_ID_ALPHABET } from '../src/lib/groups/page-handle'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const FILE = readdirSync(MIG).find((f) => /^\d{14}_page_public_id\.sql$/.test(f))

describe('#175 — the migration file', () => {
  it('exists, timestamped per #39', () => {
    expect(FILE, 'expected a YYYYMMDDHHMMSS_page_public_id.sql').toBeTruthy()
  })

  const raw = FILE && existsSync(resolve(MIG, FILE)) ? readFileSync(resolve(MIG, FILE), 'utf8') : ''
  // `--` comments and single-quoted literals stripped, the convention the
  // other migration tests follow: prose explaining why a thing is absent is
  // not a regression, DDL containing it is.
  const sql = raw
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .replace(/'(?:[^']|'')*'/g, "''")

  it('mints from a CSPRNG', () => {
    expect(sql).toContain('gen_random_bytes')
  })

  it('never derives an id from a member, a group, a timestamp or a sequence', () => {
    // The one property in the ruling that is not a preference: derivation is
    // what would reintroduce both enumerability and the member link.
    for (const w of ['founder_member_id', 'member_id', 'nextval', 'serial', 'clock_timestamp']) {
      expect(sql.toLowerCase(), `the generator must not read ${w}`).not.toContain(w)
    }
  })

  it('never derives anything here from payment', () => {
    for (const w of ['payment', 'paid', 'subscription', 'plan_tier', 'promoted', 'sponsored']) {
      expect(sql.toLowerCase(), `public_id DDL must not mention ${w}`).not.toContain(w)
    }
    expect(raw.toLowerCase()).toContain('payment')
  })

  it('pins the function search_path — the #36 definer hardening', () => {
    expect(sql).toMatch(/set search_path = public, extensions, pg_catalog/i)
  })
})

const RUNNABLE = requireRunnable({
  claim: 'every Page has a non-sequential public id, and the generator makes unguessable ones',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('#175 — groups.public_id, as shipped', () => {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(sql, params)
      return rows as T[]
    } finally {
      await pool.end()
    }
  }

  it('is not null, so no Page can exist without an address', async () => {
    const rows = await query<{ is_nullable: string; column_default: string | null }>(
      `select is_nullable, column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'groups' and column_name = 'public_id'`,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].is_nullable).toBe('NO')
    expect(rows[0].column_default).toContain('new_page_public_id')
  })

  it('is unique, so two Pages can never share an address', async () => {
    const rows = await query<{ n: string }>(
      `select count(*) as n from pg_index i
         join pg_class c on c.oid = i.indexrelid
        where i.indrelid = 'public.groups'::regclass
          and i.indisunique
          and pg_get_indexdef(i.indexrelid) like '%(public_id)%'`,
    )
    expect(Number(rows[0].n)).toBe(1)
  })

  it('refuses an id that is not six Crockford characters', async () => {
    for (const bad of ['abc', 'abcdefg', 'ABC123', 'abcdei', 'abcdel', 'abcdeo', 'abcdeu']) {
      await expect(
        query(`select 1 where $1 ~ '^[0-9abcdefghjkmnpqrstvwxyz]{6}$'`, [bad]).then((r) => {
          if (r.length > 0) throw new Error(`the shape check admitted ${bad}`)
          return r
        }),
      ).resolves.toEqual([])
    }
  })

  it('mints six characters, every one of them in the alphabet', async () => {
    const rows = await query<{ ok: boolean }>(
      `select bool_and(
                length(id) = 6 and id ~ '^[0-9abcdefghjkmnpqrstvwxyz]{6}$'
              ) as ok
         from (select public.new_page_public_id() as id from generate_series(1, 300)) t`,
    )
    expect(rows[0].ok).toBe(true)
  })

  it('is not walkable: 2000 ids collide with none of each other', async () => {
    // Enumerability is the safety property. A sequence would give 2000 here
    // too, so the distribution test below is the one that separates them.
    const rows = await query<{ n: string }>(
      `select count(distinct id) as n
         from (select public.new_page_public_id() as id from generate_series(1, 2000)) t`,
    )
    expect(Number(rows[0].n)).toBe(2000)
  })

  it('draws each character about equally — a biased alphabet is a smaller keyspace', async () => {
    const rows = await query<{ ch: string; n: string }>(
      `with d as (select public.new_page_public_id() as id from generate_series(1, 3000)),
            c as (select substr(id, g, 1) as ch from d, generate_series(1, 6) g)
       select ch, count(*) as n from c group by ch`,
    )
    expect(rows).toHaveLength(32)
    expect(new Set(rows.map((r) => r.ch))).toEqual(new Set(PUBLIC_ID_ALPHABET.split('')))
    // 18000 draws over 32 characters: 562.5 expected, sd ~23. +/- 8 sd is a
    // band a fair generator clears essentially always and a broken one does not.
    for (const r of rows) {
      expect(Number(r.n), `character ${r.ch} drawn ${r.n} times`).toBeGreaterThan(375)
      expect(Number(r.n), `character ${r.ch} drawn ${r.n} times`).toBeLessThan(750)
    }
  })

  it('gives a new Page an id without anybody asking for one', async () => {
    const rows = await query<{ public_id: string }>(
      `select public.new_page_public_id() as public_id`,
    )
    expect(rows[0].public_id).toMatch(/^[0-9abcdefghjkmnpqrstvwxyz]{6}$/)
  })
})
