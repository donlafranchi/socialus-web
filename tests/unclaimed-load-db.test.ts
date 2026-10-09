import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { loadUnclaimed } from '@/lib/unclaimed/load'
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
