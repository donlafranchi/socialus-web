// T154 (#51) — browse_pages against a real database.
//
// The helper's unit tests stub the RPC, so they prove the projection and
// nothing about whether the function exists, returns those columns, or applies
// the predicate it claims.
//
// The introspection suite below is read-only. The behaviour suite at the
// bottom is NOT: `groups` is empty on a fresh local database, so asserting
// "a draft does not come back" against it passes without checking anything —
// the exact shape T150 exists to remove. So it seeds a fixture inside a
// transaction and rolls it back, and takes T151's write-safe gate because it
// writes.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const RUNNABLE = requireRunnable({
  claim: 'the browse source returns Pages, and hides drafts and unlisted Pages',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

const SIG = 'browse_pages'

describe.skipIf(!RUNNABLE)('T154 — browse_pages, as shipped', () => {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(sql, params)
      return rows as T[]
    } finally {
      await pool.end()
    }
  }

  it('exists with exactly one signature — no overload pair', async () => {
    const rows = await query<{ args: string }>(
      `select pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].args).toBe('p_place_id uuid, p_category text, p_limit integer')
  })

  it('is stable, security invoker, and pins its search_path', async () => {
    const rows = await query<{ provolatile: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select p.provolatile, p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows[0].provolatile).toBe('s')
    expect(rows[0].prosecdef).toBe(false) // invoker, so RLS applies
    expect(rows[0].proconfig?.join(',')).toContain('search_path=public, extensions')
  })

  it('is executable by anon and authenticated, and not by public', async () => {
    const rows = await query<{ acl: string | null }>(
      `select array_to_string(p.proacl, ',') as acl
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    const acl = rows[0].acl ?? ''
    expect(acl).toContain('anon=X')
    expect(acl).toContain('authenticated=X')
    expect(acl).not.toMatch(/(^|,)=X/) // no grant to PUBLIC
  })

  it('returns the columns the helper reads, and no Item column', async () => {
    const rows = await query<{ column_name: string }>(
      `select unnest(p.proargnames) as column_name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    const names = rows.map((r) => r.column_name)
    for (const c of ['group_id', 'slug', 'name', 'category', 'description', 'photo_url',
                     'anchor_location_geography', 'updated_at']) {
      expect(names, `browse_pages is missing ${c}`).toContain(c)
    }
    // Guards the grain. If a later edit reaches back into discoverable_items,
    // an item column shows up here.
    expect(names.some((n) => n.startsWith('item'))).toBe(false)
  })

  it('reads groups and never discoverable_items', async () => {
    const rows = await query<{ src: string }>(
      `select pg_get_functiondef(p.oid) as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows[0].src).toContain('public.groups')
    expect(rows[0].src).not.toContain('discoverable_items')
  })

  it('withholds drafts, unlisted and dissolved Pages in its own predicate', async () => {
    // RLS admits a founder's own draft — correct for their Page view, wrong
    // for a public index. The function must carry its own browse policy.
    const rows = await query<{ src: string }>(
      `select pg_get_functiondef(p.oid) as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    const src = rows[0].src
    expect(src).toContain("lifecycle_state = 'active'")
    expect(src).toContain("discoverability = 'listed'")
    expect(src).toContain('dissolved_at is null')
  })

  it('carries no interest-tag boost in its ordering', async () => {
    // Browse is complete and unranked by member interest (ruled 2026-09-12).
    const rows = await query<{ src: string }>(
      `select pg_get_functiondef(p.oid) as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows[0].src).not.toContain('p_tags')
    expect(rows[0].src).not.toContain('primary_tag')
  })

  it('leaves locality_feed_items alone', async () => {
    const rows = await query<{ n: string }>(
      `select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'locality_feed_items'`,
    )
    expect(Number(rows[0].n)).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Behaviour, against seeded rows.
//
// Everything above reads the catalog: the function exists, is shaped right,
// and its source contains the clauses. None of that proves a draft is actually
// withheld — and on a fresh local database `groups` is empty, so a "no drafts
// come back" assertion would pass on zero rows and check nothing.
//
// This seeds four Pages in one transaction, asserts, and rolls back.

const safety = writeSafety(process.env)
const WRITABLE = requireRunnable({
  claim: 'the browse source actually withholds drafts, unlisted and dissolved Pages',
  available: !!DATABASE_URL && safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!WRITABLE)('T154 — browse_pages, against seeded Pages', () => {
  /** Seed, run `fn`, always roll back. Nothing survives this suite. */
  const inRollback = async <T>(fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>): Promise<T> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()
    try {
      await client.query('begin')
      const q = async (sql: string, p: unknown[] = []) =>
        (await client.query(sql, p)).rows as Record<string, unknown>[]
      return await fn(q)
    } finally {
      await client.query('rollback')
      client.release()
      await pool.end()
    }
  }

  const seed = async (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => {
    const [{ id: placeId }] = (await q(
      `select id from public.places where geography is not null limit 1`,
    )) as { id: string }[]
    const [{ id: memberId }] = (await q(`select id from public.members limit 1`)) as { id: string }[]
    // A point guaranteed inside the chosen Place.
    const [{ pt }] = (await q(
      `select st_pointonsurface(geography::geometry)::geography as pt
         from public.places where id = $1`,
      [placeId],
    )) as { pt: string }[]

    const mk = async (slug: string, state: string, disc: string, dissolved: boolean) => {
      const [{ id: locId }] = (await q(
        `insert into public.locations (member_id, kind, label, slug, geography, place_id)
         values ($1, 'permanent', $2, $3, $4, $5) returning id`,
        [memberId, `${slug} loc`, `${slug}-loc`, pt, placeId],
      )) as { id: string }[]
      await q(
        `insert into public.groups
           (name, slug, kind, anchor_location_id, founder_member_id,
            lifecycle_state, discoverability, dissolved_at, category)
         values ($1, $2, 'business', $3, $4, $5, $6, $7, 'Food & Drink')`,
        [slug, slug, locId, memberId, state, disc, dissolved ? new Date().toISOString() : null],
      )
    }

    await mk('t154-live', 'active', 'listed', false)
    await mk('t154-draft', 'draft', 'listed', false)
    await mk('t154-unlisted', 'active', 'unlisted', false)
    await mk('t154-dissolved', 'active', 'listed', true)
    return placeId
  }

  const slugs = (rows: Record<string, unknown>[]) => rows.map((r) => r.slug as string).sort()

  it('returns a live, listed Page', async () => {
    const found = await inRollback(async (q) => {
      const placeId = await seed(q)
      return slugs(await q(`select slug from public.browse_pages($1, null, 100)`, [placeId]))
    })
    expect(found).toContain('t154-live')
  })

  it('withholds a draft, an unlisted Page, and a dissolved Page', async () => {
    const found = await inRollback(async (q) => {
      const placeId = await seed(q)
      return slugs(await q(`select slug from public.browse_pages($1, null, 100)`, [placeId]))
    })
    expect(found).not.toContain('t154-draft')
    expect(found).not.toContain('t154-unlisted')
    expect(found).not.toContain('t154-dissolved')
  })

  it('filters to one category, and excludes the others', async () => {
    const [matching, other] = await inRollback(async (q) => {
      const placeId = await seed(q)
      return [
        slugs(await q(`select slug from public.browse_pages($1, 'Food & Drink', 100)`, [placeId])),
        slugs(await q(`select slug from public.browse_pages($1, 'Growing', 100)`, [placeId])),
      ]
    })
    expect(matching).toContain('t154-live')
    expect(other).not.toContain('t154-live')
  })

  it('projects a decodable point for the map pin', async () => {
    const rows = await inRollback(async (q) => {
      const placeId = await seed(q)
      return q(
        `select anchor_location_geography is not null as has_point
           from public.browse_pages($1, null, 100) where slug = 't154-live'`,
        [placeId],
      )
    })
    expect(rows[0]?.has_point).toBe(true)
  })

  it('honours the limit', async () => {
    const rows = await inRollback(async (q) => {
      const placeId = await seed(q)
      return q(`select slug from public.browse_pages($1, null, 1)`, [placeId])
    })
    expect(rows.length).toBeLessThanOrEqual(1)
  })
})
