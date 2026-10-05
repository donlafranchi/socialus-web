import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #280 — Don, 2026-10-01: builder accounts on the live app. Nothing a builder
// makes shows to a real member or counts in a number; builders see each
// other's. Enforced in SQL, so every door (Explore, search, the map, the
// signed-out front door, PostgREST, crawlers) answers the same way.
//
// #388 — Don, 2026-10-05: a switch, "builder content visible to members", on
// by default in beta. Off, everything above holds; on, builder content shows,
// and a builder's follows, joins and RSVPs still never count. The switch is
// flipped inside each query's own transaction, so parallel suites never see it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'nothing a builder makes is visible to a real member or counts in a number',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const BUILDER = 'a3000000-0000-4000-8000-000000000280'
const BUILDER2 = 'a3000000-0000-4000-8000-000000000281'
const REAL = 'b3000000-0000-4000-8000-000000000280'
const REAL_OWNER = 'b3000000-0000-4000-8000-000000000281'
const B_PAGE = 'c3000000-0000-4000-8000-000000000280'
const R_PAGE = 'c3000000-0000-4000-8000-000000000281'
const B_POST = 'd3000000-0000-4000-8000-000000000280'
const B_ITEM = 'e3000000-0000-4000-8000-000000000280'
const R_ITEM = 'e3000000-0000-4000-8000-000000000281'
const METRO_SLUG = 'sacramento-roseville-ca'
const PEOPLE: [string, string][] = [
  [BUILDER, 'b280-builder'],
  [BUILDER2, 'b280-builder-two'],
  [REAL, 'b280-real'],
  [REAL_OWNER, 'b280-real-owner'],
]

let pool: Pool
let client: PoolClient
let metroId: string

let switchOn = false

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    await client.query(`update public.builder_content set visible = $1`, [switchOn])
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

const ids = async (sub: string | null, sql: string, params: unknown[] = []) =>
  (await as<{ id: string }>(sub, sql, params)).map((r) => r.id)

const feed = (sub: string | null) =>
  ids(
    sub,
    `select result_id as id from public.browse_feed(p_metro_id => $1, p_limit => 500)`,
    [metroId],
  )

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  metroId = (await client.query(`select id from public.metro_polygons where slug = $1`, [METRO_SLUG])).rows[0].id
  const place = (await client.query(`select id from public.places where slug = 'oak-park' limit 1`)).rows[0]
  for (const [id, h] of PEOPLE) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name, home_metro_id) values ($1,$2,$2,$3)`, [
      id,
      h,
      metroId,
    ])
  }
  await client.query(`insert into public.builders (member_id, persona) values ($1,'b280-owner'), ($2,'b280-member')`, [
    BUILDER,
    BUILDER2,
  ])
  for (const [page, founder, name] of [
    [B_PAGE, BUILDER, 'B280 Builder Page'],
    [R_PAGE, REAL_OWNER, 'B280 Real Page'],
  ]) {
    const loc = (
      await client.query(
        `insert into public.locations (member_id, kind, label, slug, geography, place_id)
         values ($1,'permanent','Oak Park',$2, ST_GeogFromText('POINT(-121.4702 38.5412)'), $3) returning id`,
        [founder, `b280-loc-${page.slice(-3)}`, place.id],
      )
    ).rows[0].id
    await client.query(
      `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'interest',$3,$4,'Here.','active','listed',$2,$5)`,
      [page, founder, name, name.toLowerCase().replace(/ /g, '-'), loc],
    )
    await client.query(
      `insert into public.group_memberships (group_id, member_id, role, source, relationship)
       values ($1,$2,'owner','explicit','member')`,
      [page, founder],
    )
  }
  await client.query(
    `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability)
     values ($1,$2,'B280 builder post','active','listed')`,
    [B_POST, B_PAGE],
  )
  await client.query(
    `insert into public.items (id, member_id, kind, title, state, group_id) values
       ($1,$2,'gathering','B280 builder run','published',null),
       ($3,$4,'gathering','B280 real run','published',$5)`,
    [B_ITEM, BUILDER, R_ITEM, REAL_OWNER, R_PAGE],
  )
  // A builder follows, joins and RSVPs to real things: none of it may count.
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
       ($1,$2,'member','soft_via_follow','follower'),
       ($1,$3,'member','explicit','member')`,
    [R_PAGE, BUILDER, BUILDER2],
  )
  await client.query(
    `insert into public.item_responses (item_id, responder_member_id, response_kind) values ($1,$2,'rsvp')`,
    [R_ITEM, BUILDER],
  )
  await client.query(`refresh materialized view public.discoverable_items`)
})

afterAll(async () => {
  if (!RUNNABLE) return
  const people = PEOPLE.map(([id]) => id)
  await client.query(`delete from public.item_responses where item_id = any($1)`, [[B_ITEM, R_ITEM]])
  await client.query(`delete from public.item_events where item_id = any($1)`, [[B_ITEM, R_ITEM]])
  await client.query(`delete from public.items where id = any($1)`, [[B_ITEM, R_ITEM]])
  await client.query(`delete from public.page_posts where id = $1`, [B_POST])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [[B_PAGE, R_PAGE]])
  await client.query(`delete from public.group_events where group_id = any($1)`, [[B_PAGE, R_PAGE]])
  await client.query(`delete from public.groups where id = any($1)`, [[B_PAGE, R_PAGE]])
  await client.query(`delete from public.location_events where acting_member_id = any($1)`, [people])
  await client.query(`delete from public.locations where member_id = any($1)`, [people])
  await client.query(`delete from public.builders where member_id = any($1)`, [people])
  await client.query(`delete from public.member_events where member_id = any($1)`, [people])
  await client.query(`delete from public.members where id = any($1)`, [people])
  await client.query(`delete from auth.users where id = any($1)`, [people])
  await client.query(`refresh materialized view public.discoverable_items`)
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#280 — with the switch off, builder content is invisible to real members', () => {
  const VIEWERS: [string, string | null][] = [
    ['signed out', null],
    ['a real member', REAL],
  ]

  for (const [who, sub] of VIEWERS) {
    it(`Explore, search and the map show ${who} no builder Page or post`, async () => {
      const rows = await feed(sub)
      expect(rows).toContain(R_PAGE)
      expect(rows).not.toContain(B_PAGE)
      expect(rows).not.toContain(B_POST)
    })

    it(`no builder Page, post or item answers ${who} directly`, async () => {
      expect(await ids(sub, `select id from public.groups where id = $1`, [B_PAGE])).toEqual([])
      expect(await ids(sub, `select id from public.page_posts where id = $1`, [B_POST])).toEqual([])
      expect(await ids(sub, `select id from public.items where id = $1`, [B_ITEM])).toEqual([])
      expect(await ids(sub, `select item_id as id from public.discoverable_items where item_id = $1`, [B_ITEM])).toEqual([])
    })

    it(`the withheld-post card counts nothing a builder posted, for ${who}`, async () => {
      const rows = await as<{ group_id: string }>(
        sub,
        `select group_id from public.announcements_withheld(p_metro_id => $1, p_limit => 500)`,
        [metroId],
      )
      expect(rows.map((r) => r.group_id)).not.toContain(B_PAGE)
    })

    it(`a builder's handle resolves nothing for ${who}`, async () => {
      const rows = await as<{ id: string | null }>(
        sub,
        `select public.posted_item_id('b280-builder', 'gathering', 'e3000000') as id`,
      )
      expect(rows[0].id).toBeNull()
    })
  }

  it('a builder follow, join or RSVP never counts in a real Page\'s numbers', async () => {
    const followers = await as<{ n: number }>(
      REAL_OWNER,
      `select count(*)::int as n from public.group_memberships where group_id = $1 and relationship = 'follower'`,
      [R_PAGE],
    )
    expect(followers[0].n).toBe(0)
    const members = await as<{ members: number }>(
      REAL_OWNER,
      `select members from public.page_listed_member_counts($1)`,
      [[R_PAGE]],
    )
    expect(members[0]?.members ?? 0).toBe(1)
    const responses = await as<{ response_count: number }>(
      REAL,
      `select response_count from public.discoverable_items where item_id = $1`,
      [R_ITEM],
    )
    expect(Number(responses[0]?.response_count ?? 0)).toBe(0)
  })

  it('nobody but the service role can read who is a builder', async () => {
    for (const sub of [null, REAL, BUILDER]) {
      await expect(as(sub, `select member_id from public.builders`)).rejects.toThrow(/permission denied/)
    }
  })
})

describe.skipIf(!RUNNABLE)('#280 — builders see each other', () => {
  it('a builder sees another builder\'s Page, post and item', async () => {
    expect(await feed(BUILDER2)).toEqual(expect.arrayContaining([B_PAGE, B_POST]))
    expect(await ids(BUILDER2, `select id from public.groups where id = $1`, [B_PAGE])).toEqual([B_PAGE])
    expect(await ids(BUILDER2, `select id from public.items where id = $1`, [B_ITEM])).toEqual([B_ITEM])
    const posted = await as<{ id: string }>(BUILDER2, `select public.posted_item_id('b280-builder', 'gathering', 'e3000000') as id`)
    expect(posted[0].id).toBe(B_ITEM)
  })
})

describe.skipIf(!RUNNABLE)('#388 — with the switch on, builder content shows; builder relations still never count', () => {
  beforeAll(() => {
    switchOn = true
  })
  afterAll(() => {
    switchOn = false
  })

  for (const [who, sub] of [['signed out', null], ['a real member', REAL]] as [string, string | null][]) {
    it(`${who} sees the builder Page and its post`, async () => {
      expect(await feed(sub)).toEqual(expect.arrayContaining([B_PAGE, B_POST]))
      expect(await ids(sub, `select id from public.groups where id = $1`, [B_PAGE])).toEqual([B_PAGE])
      expect(await ids(sub, `select id from public.page_posts where id = $1`, [B_POST])).toEqual([B_POST])
    })
  }

  it("a builder follow or join still never counts in a real Page's numbers", async () => {
    const followers = await as<{ n: number }>(
      REAL_OWNER,
      `select count(*)::int as n from public.group_memberships where group_id = $1 and relationship = 'follower'`,
      [R_PAGE],
    )
    expect(followers[0].n).toBe(0)
    const members = await as<{ members: number }>(
      REAL_OWNER,
      `select members from public.page_listed_member_counts($1)`,
      [[R_PAGE]],
    )
    expect(members[0]?.members ?? 0).toBe(1)
  })
})
