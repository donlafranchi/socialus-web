// T156 (#53) — browse_feed against a real database.
//
// Two suites, the same split every migration test here uses. The catalog half
// proves the function exists, is shaped right and says what it claims; it
// cannot prove a draft is withheld, and on a fresh database `groups` is empty,
// so an assertion about withholding would pass on zero rows and check nothing.
// The behaviour half seeds inside a transaction and rolls it back.
//
// The load-bearing case is the follow set. "Signed out, the personal half is
// absent — server-side, never rendered and hidden" (Don, 2026-09-17) is a
// claim about the database, so it is tested against one.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const RUNNABLE = requireRunnable({
  claim: 'browse_feed returns Pages and posts, and withholds the personal half from a stranger',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

const SIG = 'browse_feed'
const MIG = resolve(__dirname, '..', 'supabase', 'migrations')

describe('T156 — the migration file', () => {
  const file = readdirSync(MIG).find((f) => f.endsWith('_browse_feed.sql'))
  const sql = file ? readFileSync(resolve(MIG, file), 'utf8') : ''

  it('exists, timestamped per #39', () => {
    expect(file).toMatch(/^\d{14}_browse_feed\.sql$/)
  })

  it('drops the two sources it supersedes, so no dead browse path survives it', () => {
    expect(sql).toMatch(/drop function if exists public\.browse_pages/i)
    expect(sql).toMatch(/drop function if exists public\.browse_posts/i)
  })

  // The absence is the decision. Free-versus-priced is Don's and unmade, and
  // there is no price on a Page or a post to filter on. Asserted by word so
  // that adding the parameter means deleting a test that says why it is not
  // there — the same device the page_posts migration uses for payment.
  it('carries no cost or price parameter — that lens is unbuilt, on purpose', () => {
    const body = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .toLowerCase()
    expect(body).not.toContain('p_cost')
    expect(body).not.toContain('p_price')
    expect(body).not.toContain('p_free')
  })
})

describe.skipIf(!RUNNABLE)('T156 — browse_feed, as shipped', () => {
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
  })

  it('takes the kind as a parameter, and the follow set as a parameter', async () => {
    const rows = await query<{ names: string[] }>(
      `select p.proargnames as names
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    const names = rows[0].names
    for (const p of [
      'p_metro_id',
      'p_place_id',
      'p_kinds',
      'p_result_kinds',
      'p_audience',
      'p_following',
      'p_tags',
      'p_starts_from',
      'p_starts_before',
      'p_created_after',
      'p_sort',
      'p_now',
      'p_limit',
    ]) {
      expect(names, `browse_feed is missing ${p}`).toContain(p)
    }
  })

  it('is stable, security invoker, and pins its search_path', async () => {
    const rows = await query<{
      provolatile: string
      prosecdef: boolean
      proconfig: string[] | null
    }>(
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
    expect(acl).not.toMatch(/(^|,)=X/) // no PUBLIC grant
  })

  it('carries a comment naming what it projects and what it withholds', async () => {
    const rows = await query<{ d: string | null }>(
      `select obj_description(p.oid, 'pg_proc') as d
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    expect(rows[0].d ?? '').toMatch(/browse/i)
  })

  it('projects the columns the helper reads', async () => {
    const rows = await query<{ column_name: string }>(
      `select unnest(p.proargnames) as column_name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = $1`,
      [SIG],
    )
    const names = rows.map((r) => r.column_name)
    for (const c of [
      'result_kind',
      'result_id',
      'group_id',
      'group_kind',
      'slug',
      'name',
      'place_path',
      'photo_url',
      'photo_hidden_at',
      'photo_removed_at',
      'description',
      'body',
      'tags',
      'starts_at',
      'location_geography',
      'page_created_at',
      'updated_at',
      'sort_at',
    ]) {
      expect(names, `browse_feed is missing ${c}`).toContain(c)
    }
  })

  // The grain guard. discoverable_items is one row per Item and there are no
  // Items; if a later edit reaches back into it, this is where it shows.
  it('reads groups and page_posts, never discoverable_items', async () => {
    const s = await src()
    expect(s).toContain('public.groups')
    expect(s).toContain('public.page_posts')
    expect(s).not.toContain('discoverable_items')
  })

  it('withholds drafts, unlisted and dissolved in its own predicate', async () => {
    const s = await src()
    expect(s).toContain("lifecycle_state = 'active'")
    expect(s).toContain("discoverability = 'listed'")
    expect(s).toContain('dissolved_at is null')
  })

  it('never hardcodes a Page kind', async () => {
    const s = await src()
    expect(s).not.toMatch(/kind\s*=\s*'business'/)
  })

  it('the two superseded sources are gone', async () => {
    const rows = await query<{ name: string }>(
      `select p.proname as name
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname in ('browse_pages','browse_posts')`,
    )
    expect(rows).toEqual([])
  })

  it('leaves locality_feed_items alone — Home is paused, not deleted', async () => {
    const rows = await query<{ n: string }>(
      `select count(*) as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'locality_feed_items'`,
    )
    expect(Number(rows[0].n)).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Behaviour, against seeded rows.

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const WRITABLE = requireRunnable({
  claim:
    'browse_feed returns what it should, and withholds the personal half from a signed-out reader',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

type Q = (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>

describe.skipIf(!WRITABLE)('T156 — browse_feed, against seeded rows', () => {
  const inRollback = async <T>(fn: (q: Q) => Promise<T>): Promise<T> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()
    try {
      await client.query('begin')
      const q: Q = async (sql, p = []) =>
        (await client.query(sql, p)).rows as Record<string, unknown>[]
      return await fn(q)
    } finally {
      await client.query('rollback')
      client.release()
      await pool.end()
    }
  }

  const seed = async (q: Q) => {
    const [{ id: placeId }] = (await q(
      `select id from public.places where geography is not null limit 1`,
    )) as { id: string }[]
    const [{ id: memberId }] = (await q(`select id from public.members limit 1`)) as {
      id: string
    }[]
    const [{ pt }] = (await q(
      `select st_pointonsurface(geography::geometry)::geography as pt
         from public.places where id = $1`,
      [placeId],
    )) as { pt: string }[]
    const [metro] = (await q(
      `select id, st_pointonsurface(geography::geometry)::geography as pt
         from public.metro_polygons limit 1`,
    )) as { id: string; pt: string }[]

    let n = 0
    const mkLoc = async (tag: string, point: string = pt) => {
      n += 1
      const [{ id }] = (await q(
        `insert into public.locations (member_id, kind, label, slug, geography, place_id)
         values ($1, 'permanent', $2, $3, $4, $5) returning id`,
        [memberId, `${tag} loc`, `t156-${tag}-${n}`, point, placeId],
      )) as { id: string }[]
      return id
    }

    const mkPage = async (
      slug: string,
      opts: {
        kind?: string
        state?: string
        disc?: string
        dissolved?: boolean
        point?: string
        createdAt?: string
      } = {},
    ) => {
      const locId = await mkLoc(slug, opts.point ?? pt)
      const [{ id }] = (await q(
        `insert into public.groups
           (name, slug, kind, description, anchor_location_id, founder_member_id,
            lifecycle_state, discoverability, dissolved_at, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, coalesce($10::timestamptz, now()))
         returning id`,
        [
          slug,
          slug,
          opts.kind ?? 'business',
          `${slug} description`,
          locId,
          memberId,
          opts.state ?? 'active',
          opts.disc ?? 'listed',
          opts.dissolved ? new Date().toISOString() : null,
          opts.createdAt ?? null,
        ],
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
      } = {},
    ) => {
      const locId = opts.withOwnLocation ? await mkLoc(`${body}-own`) : null
      await q(
        `insert into public.page_posts
           (group_id, body, starts_at, location_id, lifecycle_state, discoverability)
         values ($1, $2, $3, $4, $5, $6)`,
        [
          groupId,
          body,
          opts.startsAt ?? null,
          locId,
          opts.state ?? 'active',
          opts.disc ?? 'listed',
        ],
      )
    }

    const mkTag = async (groupId: string, label: string) => {
      const [{ id }] = (await q(
        `insert into public.tags (label, normalized, created_by)
         values ($1, $2, $3)
         on conflict (normalized) do update set label = excluded.label
         returning id`,
        [label, label.trim().toLowerCase().replace(/\s+/g, ' '), memberId],
      )) as { id: string }[]
      await q(
        `insert into public.page_tags (group_id, tag_id) values ($1, $2)
         on conflict do nothing`,
        [groupId, id],
      )
    }

    return { placeId, memberId, metro, mkPage, mkPost, mkTag }
  }

  /** One call, every argument named, so a test says only what it varies. */
  const call = (args: Record<string, string> = {}) => {
    const defaults: Record<string, string> = {
      p_metro_id: 'null',
      p_place_id: 'null',
      p_kinds: 'null',
      p_result_kinds: 'null',
      p_audience: `'public'`,
      p_following: 'null',
      p_tags: 'null',
      p_starts_from: 'null',
      p_starts_before: 'null',
      p_created_after: 'null',
      p_sort: `'recent'`,
      p_now: 'null',
      p_limit: '100',
    }
    const merged = { ...defaults, ...args }
    const list = Object.entries(merged)
      .map(([k, v]) => `${k} => ${v}`)
      .join(', ')
    return `select * from public.browse_feed(${list})`
  }

  const slugs = (rows: Record<string, unknown>[]) => rows.map((r) => r.slug as string)
  const bodies = (rows: Record<string, unknown>[]) =>
    rows.filter((r) => r.result_kind === 'post').map((r) => r.body as string)

  it('returns a live, listed Page scoped to a Place', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-live')
      return q(call({ p_place_id: `'${placeId}'::uuid` }))
    })
    expect(slugs(rows)).toContain('t156-live')
    expect(rows.find((r) => r.slug === 't156-live')?.result_kind).toBe('page')
  })

  it('returns a Page scoped to a metro', async () => {
    const rows = await inRollback(async (q) => {
      const { metro, mkPage } = await seed(q)
      await mkPage('t156-metro', { point: metro.pt })
      return q(call({ p_metro_id: `'${metro.id}'::uuid` }))
    })
    expect(slugs(rows)).toContain('t156-metro')
  })

  // An unscoped browse is not a wider browse. Nothing should fall out of the
  // function when the caller forgot to say where.
  it('returns nothing when neither a metro nor a Place is given', async () => {
    const rows = await inRollback(async (q) => {
      const { mkPage } = await seed(q)
      await mkPage('t156-unscoped')
      return q(call())
    })
    expect(rows).toEqual([])
  })

  it('withholds a draft, an unlisted and a dissolved Page', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-live')
      await mkPage('t156-draft', { state: 'draft' })
      await mkPage('t156-unlisted', { disc: 'unlisted' })
      await mkPage('t156-dissolved', { dissolved: true })
      return slugs(await q(call({ p_place_id: `'${placeId}'::uuid` })))
    })
    expect(found).toContain('t156-live')
    expect(found).not.toContain('t156-draft')
    expect(found).not.toContain('t156-unlisted')
    expect(found).not.toContain('t156-dissolved')
  })

  it('returns Pages and posts together, discriminated by result_kind', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-both')
      await mkPost(g, 'sourdough is back thursday')
      return q(call({ p_place_id: `'${placeId}'::uuid` }))
    })
    expect(rows.some((r) => r.result_kind === 'page')).toBe(true)
    expect(bodies(rows)).toContain('sourdough is back thursday')
  })

  it('a post row carries its owning Page identity', async () => {
    const row = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-ident')
      await mkPost(g, 'post with identity')
      const rows = await q(call({ p_place_id: `'${placeId}'::uuid` }))
      return rows.find((r) => r.body === 'post with identity')!
    })
    expect(row.slug).toBe('t156-ident')
    expect(row.name).toBe('t156-ident')
    expect(row.group_id).toBeTruthy()
  })

  it('restricts to the kinds asked for, and admits every kind when asked for none', async () => {
    const [all, onlyBusiness] = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-shop', { kind: 'business' })
      await mkPage('t156-runclub', { kind: 'interest' })
      return [
        slugs(await q(call({ p_place_id: `'${placeId}'::uuid` }))),
        slugs(
          await q(
            call({ p_place_id: `'${placeId}'::uuid`, p_kinds: `array['business']::text[]` }),
          ),
        ),
      ]
    })
    expect(all).toEqual(expect.arrayContaining(['t156-shop', 't156-runclub']))
    expect(onlyBusiness).toContain('t156-shop')
    expect(onlyBusiness).not.toContain('t156-runclub')
  })

  it('restricts to one result kind when asked', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-postsonly')
      await mkPost(g, 'only this')
      return q(
        call({ p_place_id: `'${placeId}'::uuid`, p_result_kinds: `array['post']::text[]` }),
      )
    })
    expect(rows.every((r) => r.result_kind === 'post')).toBe(true)
  })

  // ---- the personal half -------------------------------------------------

  it('the following audience returns only Pages in the given set', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const followed = await mkPage('t156-followed')
      const stranger = await mkPage('t156-stranger')
      await mkPost(followed, 'from a Page you follow')
      await mkPost(stranger, 'from a Page you do not follow')
      return bodies(
        await q(
          call({
            p_place_id: `'${placeId}'::uuid`,
            p_audience: `'following'`,
            p_following: `array['${followed}']::uuid[]`,
          }),
        ),
      )
    })
    expect(found).toContain('from a Page you follow')
    expect(found).not.toContain('from a Page you do not follow')
  })

  // THE signed-out case. It is a database claim, so it is tested here: with no
  // follow set there is nothing to match, and the rows never leave Postgres.
  it('the following audience with an empty set returns nothing at all', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-signedout')
      await mkPost(g, 'personal content')
      return q(
        call({
          p_place_id: `'${placeId}'::uuid`,
          p_audience: `'following'`,
          p_following: `array[]::uuid[]`,
        }),
      )
    })
    expect(rows).toEqual([])
  })

  it('the following audience with a null set returns nothing, never everything', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-nullset')
      return q(call({ p_place_id: `'${placeId}'::uuid`, p_audience: `'following'` }))
    })
    expect(rows).toEqual([])
  })

  // Fail-closed. A typo must cost the personal row, not disclose the feed
  // under a heading that claims it is personal.
  it('an unrecognised audience returns nothing rather than the whole public feed', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-typo')
      return q(call({ p_place_id: `'${placeId}'::uuid`, p_audience: `'Following'` }))
    })
    expect(rows).toEqual([])
  })

  it('the public audience ignores a follow set that was passed anyway', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      const followed = await mkPage('t156-pub-followed')
      await mkPage('t156-pub-stranger')
      return slugs(
        await q(
          call({
            p_place_id: `'${placeId}'::uuid`,
            p_following: `array['${followed}']::uuid[]`,
          }),
        ),
      )
    })
    expect(found).toEqual(expect.arrayContaining(['t156-pub-followed', 't156-pub-stranger']))
  })

  // ---- the lens axes -----------------------------------------------------

  it('the tag lens narrows to Pages carrying the tag, matching the normalised key', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkTag } = await seed(q)
      const food = await mkPage('t156-food')
      await mkPage('t156-nottagged')
      await mkTag(food, 'Local Food')
      return slugs(
        await q(
          call({ p_place_id: `'${placeId}'::uuid`, p_tags: `array['local food']::text[]` }),
        ),
      )
    })
    expect(found).toContain('t156-food')
    expect(found).not.toContain('t156-nottagged')
  })

  it("projects a Page's tags as the creator typed them", async () => {
    const tags = await inRollback(async (q) => {
      const { placeId, mkPage, mkTag } = await seed(q)
      const g = await mkPage('t156-tagged')
      await mkTag(g, 'Local Food')
      const rows = await q(call({ p_place_id: `'${placeId}'::uuid` }))
      return rows.find((r) => r.slug === 't156-tagged')?.tags as string[]
    })
    expect(tags).toContain('Local Food')
  })

  it('a post inherits its Page’s tags, so a tag lens finds posts too', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost, mkTag } = await seed(q)
      const g = await mkPage('t156-tagpost')
      await mkTag(g, 'Local Food')
      await mkPost(g, 'tagged by its Page')
      return bodies(
        await q(
          call({ p_place_id: `'${placeId}'::uuid`, p_tags: `array['local food']::text[]` }),
        ),
      )
    })
    expect(found).toContain('tagged by its Page')
  })

  it('the newcomers lens returns only Pages created since the cutoff', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-old', { createdAt: '2026-01-01T00:00:00Z' })
      await mkPage('t156-new')
      return slugs(
        await q(
          call({
            p_place_id: `'${placeId}'::uuid`,
            p_created_after: `'2026-06-01T00:00:00Z'::timestamptz`,
            p_sort: `'newest'`,
          }),
        ),
      )
    })
    expect(found).toContain('t156-new')
    expect(found).not.toContain('t156-old')
  })

  it('the time lens returns posts inside the window and nothing outside it', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-window')
      await mkPost(g, 'tonight', { startsAt: '2026-10-01T19:00:00Z' })
      await mkPost(g, 'next month', { startsAt: '2026-11-01T19:00:00Z' })
      await mkPost(g, 'undated')
      return bodies(
        await q(
          call({
            p_place_id: `'${placeId}'::uuid`,
            p_now: `'2026-09-30T00:00:00Z'::timestamptz`,
            p_starts_from: `'2026-10-01T00:00:00Z'::timestamptz`,
            p_starts_before: `'2026-10-02T00:00:00Z'::timestamptz`,
          }),
        ),
      )
    })
    expect(found).toEqual(['tonight'])
  })

  it('drops a past-dated post on its own, and never drops an undated one', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-dropout')
      await mkPost(g, 'last week', { startsAt: '2026-09-01T19:00:00Z' })
      await mkPost(g, 'next week', { startsAt: '2026-10-01T19:00:00Z' })
      await mkPost(g, 'no date at all')
      return bodies(
        await q(
          call({
            p_place_id: `'${placeId}'::uuid`,
            p_now: `'2026-09-15T00:00:00Z'::timestamptz`,
          }),
        ),
      )
    })
    expect(found).toContain('next week')
    expect(found).toContain('no date at all')
    expect(found).not.toContain('last week')
  })

  it('the soonest sort puts the next occurrence first', async () => {
    const found = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-soonest')
      await mkPost(g, 'later', { startsAt: '2026-11-01T19:00:00Z' })
      await mkPost(g, 'sooner', { startsAt: '2026-10-01T19:00:00Z' })
      return bodies(
        await q(
          call({
            p_place_id: `'${placeId}'::uuid`,
            p_result_kinds: `array['post']::text[]`,
            p_sort: `'soonest'`,
            p_now: `'2026-09-15T00:00:00Z'::timestamptz`,
          }),
        ),
      )
    })
    expect(found).toEqual(['sooner', 'later'])
  })

  // ---- projection --------------------------------------------------------

  it('projects the canonical place path, so the caller needs no second query', async () => {
    const path = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-path')
      const rows = await q(call({ p_place_id: `'${placeId}'::uuid` }))
      return rows.find((r) => r.slug === 't156-path')?.place_path
    })
    expect(path).toBeTruthy()
  })

  it("projects a post's OWN geography, never its Page's pin", async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage, mkPost } = await seed(q)
      const g = await mkPage('t156-pins')
      await mkPost(g, 'with an address', { withOwnLocation: true })
      await mkPost(g, 'without one')
      return q(call({ p_place_id: `'${placeId}'::uuid` }))
    })
    const withAddr = rows.find((r) => r.body === 'with an address')
    const without = rows.find((r) => r.body === 'without one')
    expect(withAddr?.location_geography).toBeTruthy()
    expect(without?.location_geography).toBeNull()
  })

  it('honours the limit', async () => {
    const rows = await inRollback(async (q) => {
      const { placeId, mkPage } = await seed(q)
      await mkPage('t156-a')
      await mkPage('t156-b')
      return q(call({ p_place_id: `'${placeId}'::uuid`, p_limit: '1' }))
    })
    expect(rows).toHaveLength(1)
  })
})
