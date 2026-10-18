import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { searchRaw, searchTsQuery } from '@/lib/search/query'

// #916 (Don, 2026-10-18: "I did a search for flowers (plural) and it didn't return anything but flower
// (singular) did.") — Explore's search runs in browse_feed over every row the reader may see in the market.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'Explore search finds plurals, typos and synonyms across the whole market, and keeps post text from strangers',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000916'
const VISITOR = 'b4000000-0000-4000-8000-000000000916'
const ANCHOR = 'd4000000-0000-4000-8000-000000000916'
const PAGES = {
  flowers: 'c4000000-0000-4000-8000-000000009161',
  nursery: 'c4000000-0000-4000-8000-000000009162',
  coffee: 'c4000000-0000-4000-8000-000000009163',
}
const POST = 'e4000000-0000-4000-8000-000000000916'
const METRO = `(select id from public.metro_polygons where slug = 'sacramento-roseville-ca')`

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 's916-owner'], [VISITOR, 's916-visitor']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Yard','s916-yard', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  const page = (id: string, name: string, description: string, slug: string) =>
    client.query(
      `insert into public.groups (id, kind, name, description, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'business',$2,$3,$4,'active','listed',$5,$6)`,
      [id, name, description, slug, OWNER, ANCHOR],
    )
  await page(PAGES.flowers, 'Zinnia Flower Farm', 'Cut stems every Saturday.', 's916-zinnia')
  await page(PAGES.nursery, 'Quillwort Nurseries', 'Natives and succulents.', 's916-quillwort')
  await page(PAGES.coffee, 'Xylo Roasters', 'Small-batch coffee, roasted weekly.', 's916-xylo')
  await client.query(
    `insert into public.page_posts (id, group_id, body, lifecycle_state) values ($1,$2,'Vervain tincture is back in stock','active')`,
    [POST, PAGES.coffee],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  const ids = Object.values(PAGES)
  await client.query(`delete from public.page_posts where group_id = any($1)`, [ids])
  await client.query(`delete from public.group_events where group_id = any($1)`, [ids])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [ids])
  await client.query(`delete from public.groups where id = any($1)`, [ids])
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
    const { rows } = await client.query<{ result_id: string }>(
      `select result_id from public.browse_feed(p_metro_id => ${METRO}, p_search => $1, p_search_raw => $2, p_limit => 100)`,
      [searchTsQuery(text), searchRaw(text)],
    )
    return rows.map((r) => r.result_id)
  } finally {
    await client.query('rollback')
  }
}

describe.skipIf(!RUNNABLE)('#916 — Explore search, in the database', () => {
  it('a plural finds the singular, and the singular the plural', async () => {
    expect(await search('flowers')).toContain(PAGES.flowers)
    expect(await search('flower')).toContain(PAGES.flowers)
    expect(await search('nursery')).toContain(PAGES.nursery)
  })

  it('one typo still finds it', async () => {
    expect(await search('zinia')).toContain(PAGES.flowers)
  })

  it('part of a word finds it', async () => {
    expect(await search('quillw')).toContain(PAGES.nursery)
  })

  it('a synonym finds it', async () => {
    expect(await search('cafe')).toContain(PAGES.coffee)
  })

  it('a match comes from the whole market, not a first page of it', async () => {
    const first = await search('zinnia')
    expect(first[0]).toBe(PAGES.flowers)
  })

  it('a member finds a post by its words', async () => {
    expect(await search('vervain')).toContain(POST)
  })

  it('a stranger never finds a post by its words, and so learns nothing a post says', async () => {
    expect(await search('vervain', 'anon')).toEqual([])
    expect(await search('flowers', 'anon')).toContain(PAGES.flowers)
  })

  it('a word that matches nothing returns nothing', async () => {
    expect(await search('qqqzzz')).toEqual([])
  })
})
