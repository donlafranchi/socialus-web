import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #286 — Don, 2026-10-01: tags go on posts as well as Pages. A post carries
// its own tags, or its Page's when it has none, and a tag lens matches either.
// Signed out, no tags at all (F093 criterion 8).

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a post carries its own tags, a tag lens matches them, and nobody signed out reads them',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000000286'
const READER = 'b4000000-0000-4000-8000-000000000286'
const PAGE = 'c4000000-0000-4000-8000-000000000286'
const TAGGED = 'd4000000-0000-4000-8000-000000000286'
const UNTAGGED = 'd4000000-0000-4000-8000-000000000287'
const PAGE_TAG = 'e4000000-0000-4000-8000-000000000286'
const POST_TAG = 'e4000000-0000-4000-8000-000000000287'

let pool: Pool
let client: PoolClient
let metroId: string

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: 'authenticated' }),
      ])
    }
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

const feed = (sub: string | null, tags: string[] | null = null) =>
  as<{ result_id: string; tags: string[] }>(
    sub,
    `select result_id, tags from public.browse_feed(p_metro_id => $1, p_tags => $2, p_limit => 500)
      where result_id = any($3)`,
    [metroId, tags, [PAGE, TAGGED, UNTAGGED]],
  )

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  metroId = (await client.query(`select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`)).rows[0].id
  const place = (await client.query(`select id from public.places where slug = 'oak-park' limit 1`)).rows[0]
  for (const [id, h] of [[OWNER, 'b286-owner'], [READER, 'b286-reader']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  const loc = (
    await client.query(
      `insert into public.locations (member_id, kind, label, slug, geography, place_id)
       values ($1,'permanent','Oak Park','b286-loc', ST_GeogFromText('POINT(-121.4702 38.5412)'), $2) returning id`,
      [OWNER, place.id],
    )
  ).rows[0].id
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'interest','B286 Hall','b286-hall','Here.','active','listed',$2,$3)`,
    [PAGE, OWNER, loc],
  )
  await client.query(
    `insert into public.tags (id, label, normalized, status, created_by) values
       ($1,'Bread','b286-bread','visible',$3), ($2,'Concert','b286-concert','visible',$3)`,
    [PAGE_TAG, POST_TAG, OWNER],
  )
  await client.query(`insert into public.page_tags (group_id, tag_id) values ($1,$2)`, [PAGE, PAGE_TAG])
  await client.query(
    `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability) values
       ($1,$3,'Concert Friday','active','listed'), ($2,$3,'Loaves are in','active','listed')`,
    [TAGGED, UNTAGGED, PAGE],
  )
  await client.query(`insert into public.post_tags (post_id, tag_id) values ($1,$2)`, [TAGGED, POST_TAG])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.post_tags where post_id = any($1)`, [[TAGGED, UNTAGGED]])
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.page_tags where group_id = $1`, [PAGE])
  await client.query(`delete from public.tags where id = any($1)`, [[PAGE_TAG, POST_TAG]])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.location_events where acting_member_id = $1`, [OWNER])
  await client.query(`delete from public.locations where member_id = $1`, [OWNER])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, READER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, READER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#286 — tags on posts', () => {
  it('a post carries its own tags, and its Page\'s when it has none', async () => {
    const rows = Object.fromEntries((await feed(READER)).map((r) => [r.result_id, r.tags]))
    expect(rows[TAGGED]).toEqual(['Concert'])
    expect(rows[UNTAGGED]).toEqual(['Bread'])
    expect(rows[PAGE]).toEqual(['Bread'])
  })

  it('a tag lens finds a post by its own tag', async () => {
    const ids = (await feed(READER, ['b286-concert'])).map((r) => r.result_id)
    expect(ids).toEqual([TAGGED])
  })

  it('a Page\'s tag still finds every post on it', async () => {
    const ids = (await feed(READER, ['b286-bread'])).map((r) => r.result_id).sort()
    expect(ids).toEqual([PAGE, TAGGED, UNTAGGED].sort())
  })

  it('signed out, nobody reads a post\'s tags', async () => {
    await expect(as(null, `select tag_id from public.post_tags`)).rejects.toThrow(/permission denied/)
  })

  it('signed in, a post\'s tags answer with the post', async () => {
    const rows = await as<{ post_id: string }>(READER, `select post_id from public.post_tags where post_id = $1`, [TAGGED])
    expect(rows).toHaveLength(1)
  })
})
