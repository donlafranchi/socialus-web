// T162 (#75) — page_posts and browse_posts against a real database.
//
// Same split as migrations-browse-pages.test.ts: a read-only introspection
// suite, then a behaviour suite that seeds inside a transaction and rolls back.
// The reason for the second half is the same reason T150 exists — `page_posts`
// is empty on a fresh database, so "a draft does not come back" passes without
// checking anything unless something is actually there to withhold.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

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
  claim: 'the post table exists and the post-grain browse source is shaped as specified',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

const SIG = 'browse_posts'

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

describe.skipIf(!RUNNABLE)('T162 — browse_posts, as shipped', () => {
  const query = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query(sql, params)
      return rows as T[]
    } finally {
      await pool.end()
    }
  }

  const src = async () => {
    const rows = await query<{ src: string }>(
      `select pg_get_functiondef(p.oid) as src
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    return rows[0].src
  }

  it('exists with exactly one signature — no overload pair', async () => {
    const rows = await query<{ args: string }>(
      `select pg_get_function_identity_arguments(p.oid) as args
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].args).toBe('p_place_id uuid, p_now timestamp with time zone, p_limit integer')
  })

  it('is stable, security invoker, and pins its search_path', async () => {
    const rows = await query<{ provolatile: string; prosecdef: boolean; proconfig: string[] | null }>(
      `select p.provolatile, p.prosecdef, p.proconfig
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows[0].provolatile).toBe('s')
    expect(rows[0].prosecdef).toBe(false)
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
    expect(acl).not.toMatch(/(^|,)=X/)
  })

  it('carries a comment naming what it projects', async () => {
    const rows = await query<{ d: string | null }>(
      `select obj_description(p.oid, 'pg_proc') as d
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect((rows[0].d ?? '').length).toBeGreaterThan(40)
  })

  it('projects the columns the helper reads', async () => {
    const rows = await query<{ column_name: string }>(
      `select unnest(p.proargnames) as column_name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    const names = rows.map((r) => r.column_name)
    for (const c of ['post_id', 'group_id', 'slug', 'name', 'photo_url', 'body',
                     'starts_at', 'location_id', 'location_label',
                     'location_geography', 'created_at', 'updated_at']) {
      expect(names, `browse_posts is missing ${c}`).toContain(c)
    }
    // Guards the grain against a drift back to the retired model.
    expect(names.some((n) => n.startsWith('item'))).toBe(false)
  })

  it('withholds drafts, unlisted and dissolved — of the post AND of its Page', async () => {
    const s = await src()
    expect(s).toContain("lifecycle_state = 'active'")
    expect(s).toContain("discoverability = 'listed'")
    expect(s).toContain('dissolved_at is null')
  })

  it('carries no interest-tag boost and no category filter', async () => {
    const s = await src()
    expect(s).not.toContain('p_tags')
    expect(s).not.toContain('p_category')
  })

  it('leaves locality_feed_items and browse_pages alone', async () => {
    const rows = await query<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('locality_feed_items','browse_pages')`,
    )
    expect(rows.map((r) => r.name).sort()).toEqual(['browse_pages', 'locality_feed_items'])
  })
})

// ---------------------------------------------------------------------------
// Behaviour, against seeded rows.

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const WRITABLE = requireRunnable({
  claim: 'the post-grain browse source actually returns posts and withholds the ones it must',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!WRITABLE)('T162 — browse_posts, against seeded posts', () => {
  const inRollback = async <T>(
    fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
  ): Promise<T> => {
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

  /** One live Page in a real Place, plus the posts each test needs. */
  const seed = async (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => {
    const [{ id: placeId }] = (await q(
      `select id from public.places where geography is not null limit 1`,
    )) as { id: string }[]
    const [{ id: memberId }] = (await q(`select id from public.members limit 1`)) as { id: string }[]
    const [{ pt }] = (await q(
      `select st_pointonsurface(geography::geometry)::geography as pt
         from public.places where id = $1`,
      [placeId],
    )) as { pt: string }[]

    const mkLoc = async (slug: string) => {
      const [{ id }] = (await q(
        `insert into public.locations (member_id, kind, label, slug, geography, place_id)
         values ($1, 'permanent', $2, $3, $4, $5) returning id`,
        [memberId, `${slug} loc`, `${slug}-loc`, pt, placeId],
      )) as { id: string }[]
      return id
    }

    const mkPage = async (slug: string, state = 'active', disc = 'listed', dissolved = false) => {
      const locId = await mkLoc(slug)
      const [{ id }] = (await q(
        `insert into public.groups
           (name, slug, kind, anchor_location_id, founder_member_id,
            lifecycle_state, discoverability, dissolved_at)
         values ($1, $2, 'business', $3, $4, $5, $6, $7) returning id`,
        [slug, slug, locId, memberId, state, disc, dissolved ? new Date().toISOString() : null],
      )) as { id: string }[]
      return id
    }

    const mkPost = async (
      groupId: string,
      body: string,
      opts: {
        startsAt?: string | null
        withOwnLocation?: boolean
        state?: string
        disc?: string
        dissolved?: boolean
      } = {},
    ) => {
      const locId = opts.withOwnLocation ? await mkLoc(`${body}-own`) : null
      await q(
        `insert into public.page_posts
           (group_id, body, starts_at, location_id, lifecycle_state, discoverability, dissolved_at)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [
          groupId,
          body,
          opts.startsAt ?? null,
          locId,
          opts.state ?? 'active',
          opts.disc ?? 'listed',
          opts.dissolved ? new Date().toISOString() : null,
        ],
      )
    }

    return { placeId, mkPage, mkPost }
  }

  const bodies = (rows: Record<string, unknown>[]) => rows.map((r) => r.body as string)

  const run = (placeId: string, now: string | null = null) =>
    `select * from public.browse_posts('${placeId}'::uuid, ${now ? `'${now}'::timestamptz` : 'null'}, 100)`

  it('returns an undated post with no address of its own — browse is everything', async () => {
    // The whole reason this table exists. An undated, unplaced post is a
    // first-class post; an inclusion rule that drops it re-creates the gap.
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-undated-unplaced')
      return bodies(await q(run(placeId)))
    })
    expect(found).toContain('t162-undated-unplaced')
  })

  it('returns a future dated post', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-future', { startsAt: '2099-01-01T00:00:00Z' })
      return bodies(await q(run(placeId)))
    })
    expect(found).toContain('t162-future')
  })

  it('drops a past-dated post on its own, and keeps the undated one', async () => {
    // F059 acceptance 8. Withheld by the read source, never filtered in the
    // client. An undated post has no time to be past, so it never drops.
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-past', { startsAt: '2000-01-01T00:00:00Z' })
      await mkPost(g, 't162-undated')
      return bodies(await q(run(placeId)))
    })
    expect(found).not.toContain('t162-past')
    expect(found).toContain('t162-undated')
  })

  it('takes the cutoff from the caller when given one', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-2030', { startsAt: '2030-01-01T00:00:00Z' })
      // A cutoff after the post's time makes it past.
      return bodies(await q(run(placeId, '2031-01-01T00:00:00Z')))
    })
    expect(found).not.toContain('t162-2030')
  })

  it('withholds a draft, an unlisted and a dissolved post', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-live')
      await mkPost(g, 't162-draft', { state: 'draft' })
      await mkPost(g, 't162-unlisted', { disc: 'unlisted' })
      await mkPost(g, 't162-dissolved', { dissolved: true })
      return bodies(await q(run(placeId)))
    })
    expect(found).toContain('t162-live')
    expect(found).not.toContain('t162-draft')
    expect(found).not.toContain('t162-unlisted')
    expect(found).not.toContain('t162-dissolved')
  })

  it("withholds a live post whose PAGE is a draft, unlisted or dissolved", async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      await mkPost(await mkPage('t162-draft-page', 'draft'), 't162-on-draft-page')
      await mkPost(await mkPage('t162-unlisted-page', 'active', 'unlisted'), 't162-on-unlisted-page')
      await mkPost(await mkPage('t162-dissolved-page', 'active', 'listed', true), 't162-on-dissolved-page')
      return bodies(await q(run(placeId)))
    })
    expect(found).not.toContain('t162-on-draft-page')
    expect(found).not.toContain('t162-on-unlisted-page')
    expect(found).not.toContain('t162-on-dissolved-page')
  })

  it('projects the post\'s OWN geography, not its Page\'s', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-own-address', { withOwnLocation: true })
      await mkPost(g, 't162-no-address')
      return await q(
        `select body, location_id, location_geography is not null as has_point
           from public.browse_posts('${placeId}'::uuid, null, 100)`,
      )
    })
    const own = rows.find((r) => r.body === 't162-own-address')!
    const none = rows.find((r) => r.body === 't162-no-address')!
    expect(own.has_point).toBe(true)
    expect(own.location_id).toBeTruthy()
    // A post with no address of its own does not borrow its Page's pin. What a
    // map does with that is #53's call; the source does not decide it here.
    expect(none.has_point).toBe(false)
    expect(none.location_id).toBeNull()
  })

  it('returns many posts for one Page — the grain is the post', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-a')
      await mkPost(g, 't162-b')
      await mkPost(g, 't162-c')
      return bodies(await q(run(placeId)))
    })
    for (const b of ['t162-a', 't162-b', 't162-c']) expect(found).toContain(b)
  })

  it('carries the owning Page identity on every row', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-identity')
      return await q(
        `select slug, name, group_id from public.browse_posts('${placeId}'::uuid, null, 100)
          where body = 't162-identity'`,
      )
    })
    expect(rows[0]?.slug).toBe('t162-page')
    expect(rows[0]?.name).toBe('t162-page')
    expect(rows[0]?.group_id).toBeTruthy()
  })

  it('orders by recency, newest first', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-older')
      await q(`update public.page_posts set updated_at = now() - interval '10 days' where body = 't162-older'`)
      await mkPost(g, 't162-newer')
      return bodies(await q(run(placeId)))
    })
    expect(found.indexOf('t162-newer')).toBeLessThan(found.indexOf('t162-older'))
  })

  it('honours the limit', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-a')
      await mkPost(g, 't162-b')
      return await q(`select body from public.browse_posts('${placeId}'::uuid, null, 1)`)
    })
    expect(rows.length).toBeLessThanOrEqual(1)
  })

  it('cascades: deleting the Page deletes its posts', async () => {
    const remaining = await inRollback(async (q) => {
      const { mkPage, mkPost } = await seed(q)
      const g = await mkPage('t162-page')
      await mkPost(g, 't162-cascade')
      await q(`delete from public.groups where id = $1`, [g])
      return await q(`select id from public.page_posts where body = 't162-cascade'`)
    })
    expect(remaining).toEqual([])
  })
})

// ---------------------------------------------------------------------------

describe('T162 — page_posts is protected by the action-layer check', () => {
  it('appears in the conformance script\'s protected tables', () => {
    // ADR-7: writes go through the action layer. Nothing writes page_posts
    // yet — the composer is a later ticket — and that is exactly why it is
    // listed now: otherwise the change that adds the first direct write is
    // also the change that would have to add the rule.
    const script = readFileSync(
      resolve(__dirname, '..', 'scripts', 'check-action-layer-conformance.ts'),
      'utf8',
    )
    expect(script).toMatch(/'page_posts'/)
  })
})
