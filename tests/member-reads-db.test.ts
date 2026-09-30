import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #246 — what one member can read about another (Don, 2026-09-30). Nobody
// reads a member's fields, signed in or out: a Page may show its creator's
// display name and avatar. Nobody sees who follows whom; a Page's owner sees
// their own Page's followers. Interest tags are not public. A group Page's
// members see who RSVP'd; only a business's owners see who bought.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a member is readable by nobody but themselves, and the reads Pages need still answer',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const RUNNER = 'a0000000-0000-4000-8000-000000000246' // runs the group Page
const MEMBER = 'b0000000-0000-4000-8000-000000000246' // member of the group Page
const STRANGER = 'c0000000-0000-4000-8000-000000000246' // follows the group Page, buys
const SELLER = 'd0000000-0000-4000-8000-000000000246' // owns the business Page; RSVPs a one-on-one
const PLAIN = '50000000-0000-4000-8000-000000000246' // member of the group Page, no RSVP
const GUEST = '60000000-0000-4000-8000-000000000246' // RSVPs group gatherings, belongs to nothing
const GROUP = 'e0000000-0000-4000-8000-000000000246'
const SHOP = 'f0000000-0000-4000-8000-000000000246'
const LOCATION = '10000000-0000-4000-8000-000000000246'
const GATHERING = '20000000-0000-4000-8000-000000000246'
const PRODUCT = '30000000-0000-4000-8000-000000000246'
const OWN_ITEM = '40000000-0000-4000-8000-000000000246'
const SOLO = '70000000-0000-4000-8000-000000000246' // a gathering with no Page
const PRIV = '80000000-0000-4000-8000-000000000246' // a private group Page
const PRIV_EVENT = '90000000-0000-4000-8000-000000000246'
const ITEMS = [GATHERING, PRODUCT, OWN_ITEM, SOLO, PRIV_EVENT]

const PEOPLE: [string, string][] = [
  [RUNNER, 'b246-runner'],
  [MEMBER, 'b246-member'],
  [STRANGER, 'b246-stranger'],
  [SELLER, 'b246-seller'],
  [PLAIN, 'b246-plain'],
  [GUEST, 'b246-guest'],
]

let pool: Pool
let client: PoolClient

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

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of PEOPLE) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    // Public on both settings: the widest a member can open themselves, so
    // nothing below passes because a setting happened to hide the row.
    await client.query(
      `insert into public.members (id, handle, display_name, stakeholder_visibility)
       values ($1,$2,$2,'public')`,
      [id, h],
    )
    await client.query(
      `update public.member_privacy set profile_visibility = 'public', is_discoverable = true where member_id = $1`,
      [id],
    )
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','B246 Hall','b246-hall', ST_GeogFromText('POINT(-121.5 38.6)'))`,
    [LOCATION, RUNNER],
  )
  await client.query(
    `insert into public.location_events (location_id, event_kind, acting_member_id)
     values ($1,'location.created',$2)`,
    [LOCATION, RUNNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'interest','B246 Run Club','b246-run-club','active','listed',$2,$3),
            ($4,'business','B246 Bakery','b246-bakery','active','listed',$5,null),
            ($6,'interest','B246 Family','b246-family','active','private',$2,null)`,
    [GROUP, RUNNER, LOCATION, SHOP, SELLER, PRIV],
  )
  await client.query(`update public.groups set discoverability = 'private' where id = $1`, [PRIV])
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
       ($1,$2,'steward','explicit','member'),
       ($1,$3,'member','explicit','member'),
       ($1,$4,'member','explicit','follower'),
       ($5,$6,'owner','explicit','member'),
       ($1,$7,'member','explicit','member'),
       ($8,$2,'steward','explicit','member'),
       ($5,$7,'member','explicit','member')`,
    [GROUP, RUNNER, MEMBER, STRANGER, SHOP, SELLER, PLAIN, PRIV],
  )
  await client.query(
    `insert into public.items (id, member_id, kind, title, state, group_id) values
       ($1,$2,'gathering','B246 Saturday run','published',$3),
       ($4,$5,'product','B246 Loaf','published',$6),
       ($7,$8,'product','B246 Jam','published',null),
       ($9,$8,'gathering','B246 Piano lesson','published',null),
       ($10,$2,'gathering','B246 Family dinner','published',$11)`,
    [GATHERING, RUNNER, GROUP, PRODUCT, SELLER, SHOP, OWN_ITEM, MEMBER, SOLO, PRIV_EVENT, PRIV],
  )
  await client.query(
    `insert into public.item_gatherings (item_id, starts_at)
     select unnest($1::uuid[]), now() + interval '7 days'`,
    [[GATHERING, SOLO, PRIV_EVENT]],
  )
  await client.query(
    `insert into public.item_locations (item_id, location_id, schedule_kind) values ($1,$2,'one_time')`,
    [GATHERING, LOCATION],
  )
  await client.query(
    `insert into public.item_responses (item_id, responder_member_id, response_kind) values
       ($1,$2,'rsvp'), ($1,$5,'rsvp'), ($4,$3,'purchase'), ($4,$2,'pledge'),
       ($6,$7,'rsvp'), ($8,$5,'rsvp')`,
    [GATHERING, MEMBER, STRANGER, PRODUCT, GUEST, SOLO, SELLER, PRIV_EVENT],
  )
  await client.query(
    `insert into public.member_follows (follower_member_id, followed_member_id) values ($1,$2)`,
    [MEMBER, RUNNER],
  )
  await client.query(
    `insert into public.member_interests (member_id, tag) values ($1,'running'), ($2,'baking')`,
    [RUNNER, STRANGER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  const ids = PEOPLE.map(([id]) => id)
  await client.query(`delete from public.item_responses where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.item_locations where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.item_gatherings where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.item_events where item_id = any($1)`, [ITEMS])
  await client.query(`delete from public.items where id = any($1)`, [ITEMS])
  await client.query(`delete from public.group_events where group_id = any($1)`, [[GROUP, SHOP, PRIV]])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [[GROUP, SHOP, PRIV]])
  await client.query(`delete from public.groups where id = any($1)`, [[GROUP, SHOP, PRIV]])
  await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.member_follows where follower_member_id = any($1)`, [ids])
  await client.query(`delete from public.member_interests where member_id = any($1)`, [ids])
  await client.query(`delete from public.members where id = any($1)`, [ids])
  await client.query(`delete from auth.users where id = any($1)`, [ids])
  client.release()
  await pool.end()
})

const count = async (sub: string | null, sql: string, params: unknown[] = []) =>
  (await as(sub, sql, params)).length

describe.skipIf(!RUNNABLE)('what a member is, to anyone else', () => {
  it('signed out, no member row answers, not even one marked public', async () => {
    expect(await count(null, `select id from public.members where id = any($1)`, [PEOPLE.map(([id]) => id)])).toBe(0)
  })

  it('a signed-in stranger reads no other member row', async () => {
    const rows = await as<{ id: string }>(STRANGER, `select id from public.members where id = any($1)`, [
      PEOPLE.map(([id]) => id),
    ])
    expect(rows.map((r) => r.id)).toEqual([STRANGER])
  })

  it("a member of the same Page reads no other member's row either", async () => {
    expect(await count(MEMBER, `select id from public.members where id = $1`, [RUNNER])).toBe(0)
  })

  it('a profile resolves for its owner only', async () => {
    const q = `select member_id, verdict from public.resolve_member_page_visibility('b246-runner', true)`
    expect(await as(null, q)).toEqual([{ member_id: null, verdict: 'notfound' }])
    expect(await as(STRANGER, q)).toEqual([{ member_id: null, verdict: 'notfound' }])
    expect(await as(RUNNER, q)).toEqual([{ member_id: RUNNER, verdict: 'render' }])
  })

  it("a member's Pages are listed to that member only", async () => {
    const q = `select slug from public.member_public_pages($1)`
    expect(await count(null, q, [RUNNER])).toBe(0)
    expect(await count(STRANGER, q, [RUNNER])).toBe(0)
    expect(await count(RUNNER, q, [RUNNER])).toBe(1)
  })

  it('the member projections answer nobody', async () => {
    for (const view of [
      'member_public_group_memberships',
      'member_public_discoverability',
      'member_has_standing_presence',
      'member_public_has_published',
    ]) {
      for (const sub of [null, STRANGER]) {
        await expect(as(sub, `select member_id from public.${view} limit 1`), `${view} as ${sub}`).rejects.toThrow(
          /permission denied/,
        )
      }
    }
  })
})

describe.skipIf(!RUNNABLE)("a Page's creator, on that Page", () => {
  // Don, 2026-09-30 (corrected): the front door shows no founder, signed in
  // or out. A member of the Page, or someone inside it through an RSVP, sees
  // who founded it, by display name.
  it('names no founder to a signed-out visitor or a signed-in non-member, private Pages included', async () => {
    for (const page of [GROUP, PRIV]) {
      for (const sub of [null, SELLER, STRANGER]) {
        expect(await count(sub, `select * from public.page_founder_public($1)`, [page]), `${page} as ${sub}`).toBe(0)
      }
    }
  })

  it("names the founder to the Page's members and to someone inside it through an RSVP, by display name only", async () => {
    for (const [sub, page] of [[MEMBER, GROUP], [PLAIN, GROUP], [GUEST, GROUP], [GUEST, PRIV]]) {
      const rows = await as<Record<string, unknown>>(sub, `select * from public.page_founder_public($1)`, [page])
      expect(rows, `${page} as ${sub}`).toEqual([
        { handle: null, display_name: 'b246-runner', avatar_url: null, has_published: false },
      ])
    }
  })

  it("an item a member posted without a Page names its poster, by the handle already in the item's URL", async () => {
    for (const sub of [null, STRANGER]) {
      const rows = await as<Record<string, unknown>>(sub, `select * from public.post_author_public('b246-member')`)
      expect(rows).toEqual([{ member_id: MEMBER, display_name: 'b246-member', avatar_url: null }])
    }
  })

  it('a handle with nothing posted answers nothing', async () => {
    expect(await count(STRANGER, `select * from public.post_author_public('b246-stranger')`)).toBe(0)
  })

  // The count /you/following showed before, followers included; only its route changes.
  it("a Page's listed membership count answers without a roster", async () => {
    const rows = await as<{ group_id: string; members: number }>(
      STRANGER,
      `select group_id, members from public.page_listed_member_counts($1)`,
      [[GROUP]],
    )
    expect(rows).toEqual([{ group_id: GROUP, members: 4 }])
  })

  it("a venue's hosted items still list for a stranger", async () => {
    expect(await count(null, `select * from public.venue_hosted_items($1, $2)`, [LOCATION, GROUP])).toBe(1)
  })
})

describe.skipIf(!RUNNABLE)('the follow graph', () => {
  it('who follows whom answers nobody signed out', async () => {
    expect(await count(null, `select 1 from public.member_follows`)).toBe(0)
  })

  it('a stranger, and the member followed, do not see it', async () => {
    expect(await count(STRANGER, `select 1 from public.member_follows where follower_member_id = $1`, [MEMBER])).toBe(0)
    expect(await count(RUNNER, `select 1 from public.member_follows where followed_member_id = $1`, [RUNNER])).toBe(0)
  })

  it('the follower reads their own follow', async () => {
    expect(await count(MEMBER, `select 1 from public.member_follows where follower_member_id = $1`, [MEMBER])).toBe(1)
  })

  it("a stranger does not read a listed Page's roster", async () => {
    expect(await count(SELLER, `select 1 from public.group_memberships where group_id = $1`, [GROUP])).toBe(0)
  })

  it("a Page's follower does not read its roster, only their own row", async () => {
    const rows = await as<{ member_id: string }>(
      STRANGER,
      `select member_id from public.group_memberships where group_id = $1`,
      [GROUP],
    )
    expect(rows.map((r) => r.member_id)).toEqual([STRANGER])
  })

  // Don, 2026-09-30: business Pages don't have members. A row that says
  // otherwise reads no roster; only the business's owner does.
  it("a business Page's roster answers its owner, and no one holding a member row", async () => {
    const q = `select member_id from public.group_memberships where group_id = $1 order by 1`
    expect((await as<{ member_id: string }>(PLAIN, q, [SHOP])).map((r) => r.member_id)).toEqual([PLAIN])
    expect((await as<{ member_id: string }>(SELLER, q, [SHOP])).map((r) => r.member_id)).toEqual([SELLER, PLAIN].sort())
  })

  it("a Page's members see each other", async () => {
    expect(
      await count(MEMBER, `select 1 from public.group_memberships where group_id = $1 and relationship = 'member'`, [GROUP]),
    ).toBe(3)
  })

  it("a Page's owner sees who follows it", async () => {
    const rows = await as<{ member_id: string }>(
      RUNNER,
      `select member_id from public.group_memberships where group_id = $1 and relationship = 'follower'`,
      [GROUP],
    )
    expect(rows.map((r) => r.member_id)).toEqual([STRANGER])
  })

  it("a Page's member does not see who follows it", async () => {
    expect(
      await count(MEMBER, `select 1 from public.group_memberships where group_id = $1 and relationship = 'follower'`, [
        GROUP,
      ]),
    ).toBe(0)
  })
})

describe.skipIf(!RUNNABLE)('interest tags', () => {
  it('answer nobody signed out', async () => {
    expect(await count(null, `select 1 from public.member_interests`)).toBe(0)
  })

  it("answer no other member, and the member reads their own", async () => {
    expect(await count(STRANGER, `select 1 from public.member_interests where member_id = $1`, [RUNNER])).toBe(0)
    expect(await count(RUNNER, `select 1 from public.member_interests where member_id = $1`, [RUNNER])).toBe(1)
  })
})

// Don, 2026-09-30: whoever is party to an RSVP sees it. Everyone who RSVP'd
// to a gathering, and its organiser, see the others; a one-on-one, the two
// parties. Purchases are deferred: nobody buys in the app yet.
describe.skipIf(!RUNNABLE)('who responded', () => {
  const rsvps = `select responder_member_id as who from public.item_responses where item_id = $1 and response_kind = 'rsvp' order by 1`
  const buyers = `select responder_member_id as who from public.item_responses where item_id = $1 and response_kind = 'purchase'`
  const both = [{ who: MEMBER }, { who: GUEST }].sort((a, b) => a.who.localeCompare(b.who))

  it('answers nobody signed out', async () => {
    expect(await count(null, `select 1 from public.item_responses`)).toBe(0)
  })

  it("everyone who RSVP'd to a gathering sees the others, member of the Page or not", async () => {
    for (const sub of [MEMBER, GUEST]) expect(await as(sub, rsvps, [GATHERING])).toEqual(both)
  })

  it("the gathering's organiser sees who RSVP'd", async () => {
    expect(await as(RUNNER, rsvps, [GATHERING])).toEqual(both)
  })

  it("a member of the Page who did not RSVP, a follower and a stranger see nobody's RSVP", async () => {
    for (const sub of [PLAIN, STRANGER, SELLER]) expect(await count(sub, rsvps, [GATHERING])).toBe(0)
  })

  it('a one-on-one is seen by its two parties only', async () => {
    expect(await as(MEMBER, rsvps, [SOLO])).toEqual([{ who: SELLER }])
    expect(await as(SELLER, rsvps, [SOLO])).toEqual([{ who: SELLER }])
    for (const sub of [RUNNER, GUEST]) expect(await count(sub, rsvps, [SOLO])).toBe(0)
  })

  it('a purchase reaches only its buyer; no seller-side rule is built yet', async () => {
    expect(await as(STRANGER, buyers, [PRODUCT])).toEqual([{ who: STRANGER }])
    for (const sub of [SELLER, RUNNER, MEMBER]) expect(await count(sub, buyers, [PRODUCT])).toBe(0)
  })

  it('a pledge reaches only the member who made it', async () => {
    const q = `select 1 from public.item_responses where response_kind = 'pledge' and item_id = $1`
    expect(await count(SELLER, q, [PRODUCT])).toBe(0)
    expect(await count(MEMBER, q, [PRODUCT])).toBe(1)
  })
})

// Don, 2026-09-30: someone who RSVP'd counts as part of the group and sees
// what a member sees.
describe.skipIf(!RUNNABLE)("inside the house: someone who RSVP'd to a group gathering", () => {
  it("reads the Page's roster, but not its followers", async () => {
    const rows = await as<{ member_id: string }>(
      GUEST,
      `select member_id from public.group_memberships where group_id = $1 order by 1`,
      [GROUP],
    )
    expect(rows.map((r) => r.member_id)).toEqual([RUNNER, MEMBER, PLAIN].sort())
  })

  it('reads a private Page and its items, which a stranger does not', async () => {
    expect(await count(GUEST, `select 1 from public.groups where id = $1`, [PRIV])).toBe(1)
    expect(await count(GUEST, `select 1 from public.items where id = $1`, [PRIV_EVENT])).toBe(1)
    expect(await count(SELLER, `select 1 from public.groups where id = $1`, [PRIV])).toBe(0)
    expect(await count(SELLER, `select 1 from public.items where id = $1`, [PRIV_EVENT])).toBe(0)
  })

  it('stops being inside once the RSVP is withdrawn', async () => {
    await client.query(`update public.item_responses set withdrawn_at = now() where item_id = $1 and responder_member_id = $2`, [PRIV_EVENT, GUEST])
    try {
      expect(await count(GUEST, `select 1 from public.groups where id = $1`, [PRIV])).toBe(0)
    } finally {
      await client.query(`update public.item_responses set withdrawn_at = null where item_id = $1 and responder_member_id = $2`, [PRIV_EVENT, GUEST])
    }
  })
})

describe.skipIf(!RUNNABLE)("a location's owner", () => {
  it('is not readable signed out or by a stranger', async () => {
    for (const sub of [null, STRANGER]) {
      await expect(as(sub, `select member_id from public.locations where id = $1`, [LOCATION])).rejects.toThrow(
        /permission denied/,
      )
    }
  })

  it("every other column of a listed location still answers", async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'locations' and column_name <> 'member_id'`,
    )
    const cols = rows.map((r) => `"${r.column_name}"`).join(', ')
    for (const sub of [null, STRANGER]) {
      expect(await count(sub, `select ${cols} from public.locations where id = $1`, [LOCATION])).toBe(1)
    }
  })

  it('the owner lists their own locations', async () => {
    expect(await as(RUNNER, `select id, label from public.own_locations()`)).toEqual([{ id: LOCATION, label: 'B246 Hall' }])
    expect(await count(STRANGER, `select id from public.own_locations()`)).toBe(0)
  })

  it("a location's events still answer its owner, and do not break an anonymous read", async () => {
    expect(await count(RUNNER, `select 1 from public.location_events where location_id = $1`, [LOCATION])).toBe(1)
    expect(await count(null, `select 1 from public.location_events where location_id = $1`, [LOCATION])).toBe(0)
  })
})
