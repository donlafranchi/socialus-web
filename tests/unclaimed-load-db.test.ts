import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { enrichPage, loadUnclaimed, type Enrichment } from '@/lib/unclaimed/load'
import type { PlannedPage } from '@/lib/unclaimed/plan'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

// #517 — the researched makers go in as unclaimed Pages: founded by the system
// member, owned by no one, in their city, listed, with a source log. Running it
// again changes nothing, and a Page someone asked to have removed is never
// brought back or duplicated. Run against Postgres, through the loader.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the unclaimed-makers loader creates each Page once and never revives a removed one',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const page = (n: string, city = 'Sacramento', county?: string): PlannedPage => ({
  name: `T517 ${n} Roasters`,
  slug: `t517-${n}-roasters-abc123`,
  description: `T517 ${n} Roasters: coffee roaster, in Midtown. Claim this Page to tell your own story.`,
  publicInfoUrl: `https://test-517-${n}.example/`,
  city,
  county,
  purpose: 'sell',
  pool: 'Food & drink',
  interests: ['Food & drink', 'Local business'],
  area: 'Midtown',
  sources: (['name', 'description', 'website', 'address'] as const).map((field) => ({ field, url: `https://test-517-${n}.example/` })),
})
const A = page('a')
const B = page('b')

let pool: Pool
let client: PoolClient
const count = async (sql: string, p: unknown[] = []) => Number((await client.query(sql, p)).rows[0].n)
const groupsLike = () => count(`select count(*) n from public.groups where public_info_url like 'https://test-517-%'`)

async function cleanup() {
  await client.query(`delete from public.groups where public_info_url like 'https://test-517-%'`)
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
})
afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('loadUnclaimed (#517)', () => {
  it('creates each Page unclaimed, listed, founded by the system member, with no owner and a source log', async () => {
    const r = await loadUnclaimed(client, [A, B])
    expect(r).toEqual({ created: 2, existing: 0, failed: [] })
    const g = (await client.query(
      `select g.kind, g.purpose, g.lifecycle_state, g.discoverability, g.founder_member_id, g.unclaimed_at, g.unclaimed_hidden_at, g.anchor_location_id, g.description,
              (select count(*) from public.group_memberships m where m.group_id = g.id)::int members,
              (select count(*) from public.page_sources s where s.group_id = g.id)::int sources,
              (select display_name from public.group_businesses b where b.group_id = g.id) biz
         from public.groups g where g.public_info_url = $1`,
      [A.publicInfoUrl],
    )).rows[0]
    expect(g).toMatchObject({ kind: 'business', purpose: 'sell', lifecycle_state: 'active', discoverability: 'listed', founder_member_id: SYSTEM_MEMBER_ID, unclaimed_hidden_at: null, members: 0, sources: 4, biz: A.name })
    expect(g.unclaimed_at).not.toBeNull()
    expect(g.anchor_location_id).not.toBeNull()
    expect(g.description.endsWith('Claim this Page to tell your own story.')).toBe(true)
  })

  it('running it again changes nothing', async () => {
    const before = await groupsLike()
    const r = await loadUnclaimed(client, [A, B])
    expect(r).toEqual({ created: 0, existing: 2, failed: [] })
    expect(await groupsLike()).toBe(before)
  })

  it('a Page someone asked to remove stays hidden and is not duplicated', async () => {
    await client.query(`update public.groups set unclaimed_hidden_at = now() where public_info_url = $1`, [A.publicInfoUrl])
    const r = await loadUnclaimed(client, [A])
    expect(r.created).toBe(0)
    expect(await count(`select count(*) n from public.groups where public_info_url = $1`, [A.publicInfoUrl])).toBe(1)
    expect(await count(`select count(*) n from public.groups where public_info_url = $1 and unclaimed_hidden_at is not null`, [A.publicInfoUrl])).toBe(1)
  })

  it('a signed-out visitor sees the Page in Explore for its metro', async () => {
    await client.query('begin')
    try {
      await client.query('set local role anon')
      const metro = (await client.query(
        `select m.id from public.metro_polygons m join public.places p on p.kind = 'city' and p.display_name = 'Sacramento' and p.deleted_at is null
          where st_intersects(m.geography, p.centroid) limit 1`,
      )).rows[0]
      expect(metro, 'a metro polygon holds Sacramento').toBeTruthy()
      const rows = (await client.query(`select name from public.browse_feed(p_metro_id => $1, p_limit => 100)`, [metro.id])).rows
      expect(rows.map((x: { name: string }) => x.name)).toContain(B.name)
      expect(rows.map((x: { name: string }) => x.name)).not.toContain(A.name)
    } finally {
      await client.query('rollback')
    }
  })

  it('a town that is not in places falls back to its county, and the Page sits there', async () => {
    const d = page('d', 'Nowhereville', 'Sacramento')
    expect(await loadUnclaimed(client, [d])).toEqual({ created: 1, existing: 0, failed: [] })
    const where = (await client.query(
      `select p.kind, p.display_name from public.groups g join public.locations l on l.id = g.anchor_location_id join public.places p on p.id = l.place_id where g.public_info_url = $1`,
      [d.publicInfoUrl],
    )).rows[0]
    expect(where).toEqual({ kind: 'county', display_name: 'Sacramento' })
  })

  it('a place outside the Sacramento metro is refused, so a Page nobody can find is not made', async () => {
    const r = await loadUnclaimed(client, [page('e', 'Yuba City', 'Sutter')])
    expect(r.created).toBe(0)
    expect(r.failed[0]!.error).toMatch(/metro/i)
    expect(await count(`select count(*) n from public.groups where public_info_url = $1`, ['https://test-517-e.example/'])).toBe(0)
  })

  it('a city it cannot find fails that Page alone and writes nothing for it', async () => {
    const r = await loadUnclaimed(client, [page('c', 'Nowhereville')])
    expect(r.created).toBe(0)
    expect(r.failed).toEqual([{ name: 'T517 c Roasters', error: expect.stringContaining('Nowhereville') }])
    expect(await count(`select count(*) n from public.groups where public_info_url = $1`, ['https://test-517-c.example/'])).toBe(0)
  })
})


// #556 — a Page is brought up to a cover photo, pictures behind it, sample posts and a phone, once.
describe.skipIf(!RUNNABLE)('enrichPage (#556)', () => {
  const E = page('e')
  const photo = (n: number, own = false) => ({ url: `https://media.test-517.example/${n}.webp`, credit: own ? 'T517 e (from their website)' : 'Unsplash (stock photo, not this business)', sourceUrl: `https://test-517-e.example/${n}`, own })
  const enrichment: Enrichment = { photos: [photo(1, true), photo(2), photo(3), photo(4)], phone: '+19165550142', social: { instagram: 'https://www.instagram.com/t517e' }, siteUrl: E.publicInfoUrl }
  const now = new Date('2026-10-10T18:00:00Z')

  it('gives the Page a credited cover, a phone, profiles and three labelled sample posts with pictures', async () => {
    await loadUnclaimed(client, [E])
    expect(await enrichPage(client, E, async () => enrichment, now)).toBe('enriched')
    const g = (await client.query(`select photo_url, photo_credit, photo_source_url, contact_phone, social_links from public.groups where public_info_url = $1`, [E.publicInfoUrl])).rows[0]
    expect(g).toMatchObject({ photo_url: photo(1).url, photo_credit: 'T517 e (from their website)', contact_phone: '+19165550142', social_links: { instagram: 'https://www.instagram.com/t517e' } })
    const posts = (await client.query(`select p.body, p.photo_url, p.sample_kind, p.starts_at, p.ends_at from public.page_posts p join public.groups g on g.id = p.group_id where g.public_info_url = $1 order by p.sample_kind`, [E.publicInfoUrl])).rows
    expect(posts.map((p) => p.sample_kind)).toEqual(['deal', 'event', 'last_minute'])
    for (const p of posts) {
      expect(p.body.startsWith('Sample ·')).toBe(true)
      expect(p.photo_url).toMatch(/^https:\/\/media\.test-517\.example\//)
      expect(p.ends_at.getTime()).toBeGreaterThan(now.getTime())
    }
    expect(new Set(posts.map((p) => p.photo_url)).size).toBe(3)
  })

  it('a second run adds nothing and does not even go looking for pictures', async () => {
    let called = 0
    const r = await enrichPage(client, E, async () => (called++, enrichment), now)
    expect(r).toBe('complete')
    expect(called).toBe(0)
    expect(await count(`select count(*) n from public.page_posts p join public.groups g on g.id = p.group_id where g.public_info_url = $1`, [E.publicInfoUrl])).toBe(3)
  })

  it('rolls a stale sample forward to the next day', async () => {
    const later = new Date('2026-10-30T18:00:00Z')
    expect(await enrichPage(client, E, async () => enrichment, later)).toBe('refreshed')
    const row = (await client.query(`select min(ends_at) m from public.page_posts p join public.groups g on g.id = p.group_id where g.public_info_url = $1`, [E.publicInfoUrl])).rows[0]
    expect(row.m.getTime()).toBeGreaterThan(later.getTime())
  })

  it('a Page the loader has not made is reported missing, not invented', async () => {
    expect(await enrichPage(client, page('nope'), async () => enrichment, now)).toBe('missing')
  })

  it('too few pictures fails the Page and writes nothing', async () => {
    const F = page('f')
    await loadUnclaimed(client, [F])
    await expect(enrichPage(client, F, async () => ({ ...enrichment, photos: [photo(1)] }), now)).rejects.toThrow(/pictures/)
    expect(await count(`select count(*) n from public.groups where public_info_url = $1 and photo_url is not null`, [F.publicInfoUrl])).toBe(0)
  })

  it('a retired picture comes off the Page: its sample posts are made again from fresh pictures, and a retired cover is replaced (#795)', async () => {
    const H = page('h')
    await loadUnclaimed(client, [H])
    const bad = { url: 'https://media.test-517.example/u/5740ac8e2dc5.webp', credit: 'Unsplash (stock photo, not this business)', sourceUrl: 'https://unsplash.com/photos/e3-9x-Ee238', own: false }
    await enrichPage(client, H, async () => ({ ...enrichment, photos: [bad, photo(2), photo(3), photo(4)] }), now)
    const fresh: Enrichment = { ...enrichment, photos: [photo(5, true), photo(6), photo(7), photo(8)] }
    expect(await enrichPage(client, H, async () => fresh, now, ['5740ac8e2dc5'])).toBe('enriched')
    const g = (await client.query(`select photo_url, photo_source_url from public.groups where public_info_url = $1`, [H.publicInfoUrl])).rows[0]
    expect(g.photo_url).toBe(photo(5).url)
    const urls = (await client.query(`select p.photo_url from public.page_posts p join public.groups g on g.id = p.group_id where g.public_info_url = $1`, [H.publicInfoUrl])).rows.map((r) => r.photo_url as string)
    expect(urls).toHaveLength(3)
    expect(urls.some((u) => u.includes('5740ac8e2dc5'))).toBe(false)
    // Once it is gone, the next run finds nothing to do.
    expect(await enrichPage(client, H, async () => fresh, now, ['5740ac8e2dc5'])).toBe('complete')
  })

  // #816 a2 — the Page and its samples carry its interest tags; a Page loaded before them gets them on the next run.
  it('tags the Page and every sample with its interests, once, and backfills a Page that has none', async () => {
    const K = page('k')
    await loadUnclaimed(client, [K])
    await enrichPage(client, K, async () => enrichment, now)
    const tagsOf = async () =>
      (await client.query(
        `select t.label from public.page_tags pt join public.tags t on t.id = pt.tag_id join public.groups g on g.id = pt.group_id where g.public_info_url = $1 order by 1`,
        [K.publicInfoUrl],
      )).rows.map((r) => r.label as string)
    const postTagCount = async () =>
      Number((await client.query(
        `select count(*) n from public.post_tags x join public.page_posts p on p.id = x.post_id join public.groups g on g.id = p.group_id where g.public_info_url = $1`,
        [K.publicInfoUrl],
      )).rows[0].n)
    expect((await tagsOf()).map((l) => l.toLowerCase())).toEqual(['food & drink', 'local business'])
    expect(await postTagCount()).toBe(6)
    // A Page tagged before keeps one row per tag; a run with no tags missing changes nothing.
    expect(await enrichPage(client, K, async () => enrichment, now)).toBe('complete')
    expect(await postTagCount()).toBe(6)
    // Backfill: take the tags off, as on a Page loaded before #816; the next run puts them back.
    await client.query(`delete from public.page_tags where group_id = (select id from public.groups where public_info_url = $1)`, [K.publicInfoUrl])
    expect(await enrichPage(client, K, async () => enrichment, now)).toBe('refreshed')
    expect(await tagsOf()).toHaveLength(2)
  })

  // #816 a1 — a Page loaded before has its event moved onto a weekend, once.
  it('moves an event sample that is not on a Fri, Sat or Sun onto one', async () => {
    const M = page('m')
    await loadUnclaimed(client, [M])
    await enrichPage(client, M, async () => enrichment, now)
    const id = `(select id from public.groups where public_info_url = '${M.publicInfoUrl}')`
    await client.query(`update public.page_posts set starts_at = '2026-10-14T19:00:00Z', ends_at = '2026-10-14T21:00:00Z' where group_id = ${id} and sample_kind = 'event'`) // a Wednesday
    const later = new Date('2026-10-12T18:00:00Z')
    expect(await enrichPage(client, M, async () => enrichment, later)).toBe('refreshed')
    const [{ starts_at }] = (await client.query(`select starts_at from public.page_posts where group_id = ${id} and sample_kind = 'event'`)).rows
    expect(['Fri', 'Sat', 'Sun']).toContain(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short' }).format(starts_at))
    expect(await enrichPage(client, M, async () => enrichment, later)).toBe('complete')
  it('a Page put on stock-only after it loaded gets its own pictures replaced by stock on the next run (#809, F080)', async () => {
    const J = page('j')
    await loadUnclaimed(client, [J])
    await enrichPage(client, J, async () => enrichment, now) // its own cover, from its site
    const stock: Enrichment = { ...enrichment, photos: [photo(11), photo(12), photo(13), photo(14)].map((p) => ({ ...p, sourceUrl: 'https://unsplash.com/photos/x' })) }
    expect(await enrichPage(client, J, async () => stock, now, [], { stockOnly: true })).toBe('enriched')
    const g = (await client.query(`select photo_url, photo_source_url from public.groups where public_info_url = $1`, [J.publicInfoUrl])).rows[0]
    expect(g).toMatchObject({ photo_url: photo(11).url, photo_source_url: 'https://unsplash.com/photos/x' })
    const urls = (await client.query(`select p.photo_url from public.page_posts p join public.groups g on g.id = p.group_id where g.public_info_url = $1`, [J.publicInfoUrl])).rows.map((r) => r.photo_url as string)
    expect(urls.every((u) => [photo(12).url, photo(13).url, photo(14).url, photo(11).url].includes(u))).toBe(true)
    // Already stock: nothing more to do.
    expect(await enrichPage(client, J, async () => stock, now, [], { stockOnly: true })).toBe('complete')
  })

  it('moves a Page filed under a dead address to the fixed one', async () => {
    const G = page('g')
    await loadUnclaimed(client, [G])
    const fixed = { ...G, legacyUrl: G.publicInfoUrl, publicInfoUrl: 'https://test-517-g-fixed.example/' }
    await enrichPage(client, fixed, async () => ({ ...enrichment, siteUrl: fixed.publicInfoUrl }), now)
    expect(await count(`select count(*) n from public.groups where public_info_url = $1`, [fixed.publicInfoUrl])).toBe(1)
    expect(await count(`select count(*) n from public.groups where public_info_url = $1`, [G.publicInfoUrl])).toBe(0)
    // A later run still finds it under the new address and makes no second one (a duplicate slug used to fail here).
    expect(await loadUnclaimed(client, [fixed])).toMatchObject({ created: 0, existing: 1, failed: [] })
  })
})
