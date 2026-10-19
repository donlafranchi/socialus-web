import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { searchRaw, searchTsQuery } from '@/lib/search/query'
import { featuredItemSave } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// #909 (Don, 2026-10-18: "We want our search to help our businesses perform better, carry what the locals are
// looking for") — a Page's featured products and services join its search document in browse_feed, so
// "milkweed seed" finds the shop carrying it. The result is the Page, never a separate listing. Signed out, a
// match on what a Page carries would say what F093 withholds, as with tags.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "Explore search finds a Page by its featured products and services, signed in, and never by a hidden or removed one",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000990'
const VISITOR = 'b4000000-0000-4000-8000-000000000990'
const ANCHOR = 'd4000000-0000-4000-8000-000000000990'
const SHOP = 'c4000000-0000-4000-8000-000000000990'
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`

let pool: Pool
let client: PoolClient
const ctx = (): ActionContext => ({ actingMemberId: OWNER, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 's990-owner'], [VISITOR, 's990-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Yard','s990-yard', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, description, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'business','Wrenfield Goods','A small shop on the corner.','s990-wrenfield','active','listed',$2,$3)`,
    [SHOP, OWNER, ANCHOR],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'owner')`, [SHOP, OWNER])
  await featuredItemSave(ctx(), { groupId: SHOP, kind: 'product', name: 'Milkweed seed', details: 'Showy milkweed, for monarchs.' })
  await featuredItemSave(ctx(), { groupId: SHOP, kind: 'service', name: 'Bicycle tune-up' })
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.items where group_id = $1`, [SHOP])
  await client.query(`delete from public.group_memberships where group_id = $1`, [SHOP])
  await client.query(`delete from public.groups where id = $1`, [SHOP])
  await client.query(`delete from public.locations where id = $1`, [ANCHOR])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, VISITOR]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, VISITOR]])
  client.release()
  await pool.end()
})

async function search(text: string, as: 'visitor' | 'anon' = 'visitor'): Promise<string[]> {
  await client.query('begin')
  try {
    if (as === 'visitor') {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: VISITOR, role: 'authenticated' })])
      await client.query('set local role authenticated')
    } else {
      await client.query('set local role anon')
    }
    const { rows } = await client.query<{ result_id: string; result_kind: string }>(
      `select result_id, result_kind from public.browse_feed(p_metro_id => ${METRO}, p_search => $1, p_search_raw => $2, p_limit => 100)`,
      [searchTsQuery(text), searchRaw(text)],
    )
    return rows.map((r) => `${r.result_kind}:${r.result_id}`)
  } finally {
    await client.query('rollback')
  }
}

describe.skipIf(!RUNNABLE)('#909 — a Page is found by what it carries', () => {
  it('"milkweed seed" finds the shop carrying it, as the Page', async () => {
    expect(await search('milkweed seed')).toContain(`page:${SHOP}`)
  })

  it('a plural, a word from the details, and a service find it too', async () => {
    expect(await search('milkweeds')).toContain(`page:${SHOP}`)
    expect(await search('monarchs')).toContain(`page:${SHOP}`)
    expect(await search('bicycle tune-up')).toContain(`page:${SHOP}`)
  })

  it('one typo still finds it', async () => {
    expect(await search('milkweeed')).toContain(`page:${SHOP}`)
  })

  it('signed out, what a Page carries finds nothing (F093 front door)', async () => {
    expect(await search('milkweed', 'anon')).not.toContain(`page:${SHOP}`)
    expect(await search('wrenfield', 'anon')).toContain(`page:${SHOP}`)
  })

  it('a removed or report-hidden item no longer finds the Page', async () => {
    await client.query(`update public.items set hidden_at = now() where group_id = $1 and title = 'Bicycle tune-up'`, [SHOP])
    expect(await search('bicycle')).not.toContain(`page:${SHOP}`)
    await client.query(`update public.items set deleted_at = now() where group_id = $1 and title = 'Milkweed seed'`, [SHOP])
    expect(await search('milkweed')).not.toContain(`page:${SHOP}`)
  })
})
