// #1139 — readable addresses (Don, 2026-11-01), against a real database: the slug generator, place slugs, a Page a
// member makes through the real handlers (not a seed, bug #175), the frozen pair, post slugs, and the reads the
// routes and the /g/ forward use.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupCreate, groupActivate } from '../src/actions'
import type { ActionContext } from '../src/actions'
import { RULES_VERSION } from '../src/lib/creator-rules'
import { RESERVED_WORDS } from '../src/lib/addresses/reserved'

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a Page made through the handlers gets a readable address, frozen, and its posts get theirs',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a1139000-0000-4000-8000-000000001139'
const LOCATION = 'd1139000-0000-4000-8000-000000001139'
const NAME = 'Readable Kite Club 1139'
let pool: Pool
let client: PoolClient
const made: string[] = []
const placesMade: string[] = []

const ctx = (): ActionContext => ({ actingMemberId: OWNER, viaDelegationId: null, traceId: 'readable-urls', db: null as never, now: () => new Date() })
const one = async <T,>(sql: string, args: unknown[] = []) => (await client.query(sql, args)).rows[0] as T

async function publish(name: string): Promise<{ id: string; place_url_slug: string | null; page_url_slug: string | null }> {
  const { groupId } = await groupCreate(ctx(), { kind: 'group', founderMemberId: OWNER, name, anchorLocationId: LOCATION, description: 'Kites on Sundays.' })
  made.push(groupId)
  await groupActivate(ctx(), { groupId, tags: ['readable kites'], rulesVersion: RULES_VERSION })
  return one(`select id, place_url_slug, page_url_slug from public.groups where id = $1`, [groupId])
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','readable-1139@test.invalid','x',now(),now(),now())`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1, 'readable-1139', 'Robin Example')`, [OWNER])
  // A pin inside Sacramento's Oak Park, so the place is the city and the neighbourhood is there to tell twins apart.
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     select $1, $2, 'permanent', 'Readable Field', 'readable-field-1139', st_pointonsurface(n.geography::geometry)::geography
       from public.places n join public.places c on c.id = n.parent_id
      where n.kind = 'neighborhood' and n.slug = 'oak-park' and c.slug = 'sacramento' and n.deleted_at is null
        and st_covers(c.geography, st_pointonsurface(n.geography::geometry)::geography)
      limit 1`,
    [LOCATION, OWNER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = any($1)`, [made])
  await client.query(`delete from public.creator_rules_agreements where group_id = any($1)`, [made])
  await client.query(`delete from public.page_tags where group_id = any($1)`, [made])
  await client.query(`delete from public.group_events where group_id = any($1)`, [made])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [made])
  await client.query(`delete from public.groups where id = any($1)`, [made])
  await client.query(`delete from public.tags where created_by = $1`, [OWNER])
  await client.query(`delete from public.places where id = any($1)`, [placesMade])
  await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.member_events where member_id = $1`, [OWNER])
  await client.query(`delete from public.members where id = $1`, [OWNER])
  await client.query(`delete from auth.users where id = $1`, [OWNER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#1139 — readable addresses, for real', () => {
  it('turns a name into a slug: lower case, accents folded, & as and, apostrophes dropped, cut at a word', async () => {
    const r = await one<Record<string, string | null>>(
      `select public.url_slugify('The Plant Foundry Nursery & Store') a, public.url_slugify('Joe’s Café — Pizza!!') b,
              public.url_slugify(repeat('word ', 30)) c, public.url_slugify(' --- ') d`,
    )
    expect(r).toEqual({ a: 'the-plant-foundry-nursery-and-store', b: 'joes-cafe-pizza', c: Array(12).fill('word').join('-'), d: null })
  })

  // Review of #1146: an email or phone in older or loaded text never becomes a permanent public URL.
  it('drops email addresses and phone numbers before making a slug', async () => {
    const r = await one<Record<string, string | null>>(
      `select public.url_slugify('Call (916) 555-1212 today') a, public.url_slugify('Bread by jane.doe@example.com') b,
              public.url_slugify('Text +1 916.555.1212') c`,
    )
    expect(r).toEqual({ a: 'call-today', b: 'bread-by', c: 'text' })
  })

  it('reserves the same words as the app, and every top-level route is one of them', async () => {
    const app = resolve(__dirname, '../src/app')
    const routes = readdirSync(app).filter((d) => statSync(join(app, d)).isDirectory() && !/^[_(\[]/.test(d))
    const dev = readdirSync(join(app, '(dev)')).filter((d) => statSync(join(app, '(dev)', d)).isDirectory())
    for (const r of [...routes, ...dev]) expect(RESERVED_WORDS).toContain(r)
    const { rows } = await client.query<{ w: string; r: boolean }>(`select w, public.url_reserved(w) r from unnest($1::text[]) w`, [RESERVED_WORDS])
    expect(rows.filter((x) => !x.r)).toEqual([])
    expect((await one<{ r: boolean }>(`select public.url_reserved('plant-foundry') r`)).r).toBe(false)
  })

  it('gives every city and county a state-suffixed slug; a second of the same name in the state adds its county', async () => {
    expect((await one<{ u: string }>(`select url_slug u from public.places where kind = 'city' and slug = 'sacramento'`)).u).toBe('sacramento-ca')
    expect((await one<{ u: string }>(`select url_slug u from public.places where kind = 'county' and slug = 'placer'`)).u).toBe('placer-county-ca')
    // Another place already holds lakeside-ca (through an override), so a new Lakeside takes its county.
    const a = await one<{ id: string }>(
      `with p as (insert into public.places (parent_id, slug, display_name, kind)
                  select id, 'lakeside-a-1139', 'Lakeside', 'city' from public.places where kind = 'county' and slug = 'yolo' returning id)
       select id from p`,
    )
    placesMade.push(a.id)
    await client.query(`update public.places set url_slug = 'lakeside-ca' where id = $1`, [a.id])
    const b = await one<{ id: string; url_slug: string }>(
      `insert into public.places (parent_id, slug, display_name, kind)
       select id, 'lakeside', 'Lakeside', 'city' from public.places where kind = 'county' and slug = 'placer' returning id, url_slug`,
    )
    placesMade.push(b.id)
    expect(b.url_slug).toBe('lakeside-placer-ca')
  })

  // [bug #175 is the reason: a Page a member made through the handlers, not a seed]
  it('a Page a member makes through group.create and group.activate gets its home town and its name, and resolves by them', async () => {
    const draft = await groupCreate(ctx(), { kind: 'group', founderMemberId: OWNER, name: NAME, anchorLocationId: LOCATION, description: 'Kites.' })
    made.push(draft.groupId)
    expect(await one(`select place_url_slug, page_url_slug from public.groups where id = $1`, [draft.groupId])).toEqual({ place_url_slug: null, page_url_slug: null })
    await groupActivate(ctx(), { groupId: draft.groupId, tags: ['readable kites'], rulesVersion: RULES_VERSION })
    const g = await one<{ place_url_slug: string; page_url_slug: string; public_id: string }>(
      `select place_url_slug, page_url_slug, public_id from public.groups where id = $1`, [draft.groupId])
    expect(g).toMatchObject({ place_url_slug: 'sacramento-ca', page_url_slug: 'readable-kite-club-1139' })
    expect(await one(`select * from public.page_address($1)`, [g.public_id])).toEqual({ place_url_slug: 'sacramento-ca', page_url_slug: 'readable-kite-club-1139', post_url_slug: null })
  })

  it('a second Page of the same name in the same town takes its neighbourhood, a third takes -2', async () => {
    expect((await publish(NAME)).page_url_slug).toBe('readable-kite-club-1139-oak-park')
    expect((await publish(NAME)).page_url_slug).toBe('readable-kite-club-1139-2')
  })

  it('freezes the pair: a rename or a move changes nothing, and a direct write is refused', async () => {
    const id = made[0]
    await client.query(`update public.groups set name = 'Renamed Kites', anchor_location_id = null where id = $1`, [id])
    expect(await one(`select place_url_slug, page_url_slug from public.groups where id = $1`, [id])).toEqual({ place_url_slug: 'sacramento-ca', page_url_slug: 'readable-kite-club-1139' })
    await expect(client.query(`update public.groups set page_url_slug = 'other' where id = $1`, [id])).rejects.toThrow(/frozen/)
    await expect(client.query(`update public.places set url_slug = 'sacramento-2-ca' where kind = 'city' and slug = 'sacramento'`)).rejects.toThrow(/foreign key|violates/)
  })

  it('a post gets its slug from the headline when it goes live, -2 when the headline repeats, and the kind and day without one', async () => {
    const page = made[0]
    const ins = (headline: string | null, state = 'active', kind = 'news', startsAt: string | null = null) =>
      one<{ id: string; url_slug: string | null }>(
        `insert into public.page_posts (group_id, body, headline, kind, starts_at, lifecycle_state, discoverability)
         values ($1, 'Body words stay out of the address.', $2, $3, $4, $5, 'listed') returning id, url_slug`,
        [page, headline, kind, startsAt, state],
      )
    expect((await ins('Fall plant sale!')).url_slug).toBe('fall-plant-sale')
    expect((await ins('Fall Plant Sale')).url_slug).toBe('fall-plant-sale-2')
    expect((await ins(null, 'active', 'event', '2026-11-03T19:00:00Z')).url_slug).toBe('event-nov-3')
    expect((await ins('Edit')).url_slug).toBe('edit-2')
    const draft = await ins('Not yet', 'draft')
    expect(draft.url_slug).toBeNull()
    await client.query(`update public.page_posts set lifecycle_state = 'active' where id = $1`, [draft.id])
    expect((await one<{ u: string }>(`select url_slug u from public.page_posts where id = $1`, [draft.id])).u).toBe('not-yet')
    await client.query(`update public.page_posts set headline = 'Changed' where id = $1`, [draft.id])
    expect((await one<{ u: string }>(`select url_slug u from public.page_posts where id = $1`, [draft.id])).u).toBe('not-yet')

    const pid = (await one<{ public_id: string }>(`select public_id from public.groups where id = $1`, [page])).public_id
    expect(await one(`select * from public.page_address($1, $2)`, [pid, draft.id])).toEqual({ place_url_slug: 'sacramento-ca', page_url_slug: 'readable-kite-club-1139', post_url_slug: 'not-yet' })
    expect((await one<{ id: string }>(`select public.page_post_id_by_slug($1, 'not-yet') id`, [page])).id).toBe(draft.id)
  })

  // Review of #1146: no read hands out an address the reader could not otherwise reach.
  it('forwards and answers for nothing whose words are hidden, that is hidden unclaimed, or unlisted', async () => {
    const page = made[0]
    const pid = (await one<{ public_id: string }>(`select public_id from public.groups where id = $1`, [page])).public_id
    const post = (await one<{ id: string }>(`select id from public.page_posts where group_id = $1 and url_slug = 'fall-plant-sale'`, [page])).id
    const forwards = async () => (await client.query(`select * from public.page_address($1)`, [pid])).rowCount
    const slugs = async () => (await client.query(`select * from public.post_url_slugs($1)`, [[post]])).rowCount
    const bySlug = async () => (await one<{ id: string | null }>(`select public.page_post_id_by_slug($1, 'fall-plant-sale') id`, [page])).id
    expect([await forwards(), await slugs(), await bySlug()]).toEqual([1, 1, post])
    for (const set of [`words_hidden_at = now()`, `unclaimed_at = now(), unclaimed_hidden_at = now()`, `discoverability = 'unlisted'`]) {
      await client.query(`update public.groups set ${set} where id = $1`, [page])
      expect([await forwards(), await slugs(), await bySlug()]).toEqual([0, 0, null])
      await client.query(`update public.groups set words_hidden_at = null, unclaimed_hidden_at = null, unclaimed_at = null, discoverability = 'listed' where id = $1`, [page])
    }
  })

  it('lets an operator re-mint a frozen address on purpose, and nobody else', async () => {
    const id = made[0]
    await client.query('begin')
    try {
      await client.query(`set local app.address_override = 'on'`)
      await client.query(`update public.groups set page_url_slug = 'readable-kites-renamed' where id = $1`, [id])
      expect((await one<{ s: string }>(`select page_url_slug s from public.groups where id = $1`, [id])).s).toBe('readable-kites-renamed')
    } finally {
      await client.query('rollback')
    }
    await expect(client.query(`update public.groups set page_url_slug = 'other' where id = $1`, [id])).rejects.toThrow(/frozen/)
  })

  it('a draft Page has no address and no forward, and an unclaimed Page added as active gets one at once', async () => {
    const d = await groupCreate(ctx(), { kind: 'group', founderMemberId: OWNER, name: 'Readable Draft 1139', anchorLocationId: LOCATION })
    made.push(d.groupId)
    const pid = (await one<{ public_id: string }>(`select public_id from public.groups where id = $1`, [d.groupId])).public_id
    expect((await client.query(`select * from public.page_address($1)`, [pid])).rowCount).toBe(0)
    const u = await one<{ id: string; place_url_slug: string; page_url_slug: string }>(
      `insert into public.groups (kind, purpose, founder_member_id, name, slug, lifecycle_state, discoverability, anchor_location_id, unclaimed_at)
       values ('business', 'sell', $1, 'Readable Nursery & Store 1139', 'readable-nursery-1139', 'active', 'listed', $2, now())
       returning id, place_url_slug, page_url_slug`,
      [OWNER, LOCATION],
    )
    made.push(u.id)
    expect(u).toMatchObject({ place_url_slug: 'sacramento-ca', page_url_slug: 'readable-nursery-and-store-1139' })
  })
})
