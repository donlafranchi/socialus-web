// F134 — visitors without an account read what a signed-in stranger reads, and write nothing. Asked of the
// database over the wire, with the publishable key from the bundle, exactly as an outside caller would: the
// criteria say "checked by calling the endpoint, not by reading the policy or the component".
//
// THE ROWS ARE A MEMBER'S, MADE THROUGH THE HANDLERS (CLAUDE.md § The seeds are privileged). The Page is created,
// published and given its phone and hours by group.create / group.activate / group.update, its posts by
// group.post_create, the neighbour post by member_post.create and the Wonder answer by wonder.join — the path a
// member's taps take. Only what no handler makes is written directly: the two people, the metro, the places, the
// Location they pick, and the two states a member reaches through moderation or settings this suite does not drive
// (a private Page, an unlisted post).
//
// THE COMPARISON IS THE GUARD. Criterion 1 is "exactly what a signed-in member with no relation to that Page sees",
// so each read is made twice — as `anon` and as a signed-in stranger who follows nothing — and the two answers are
// compared field by field. A visitor who reads less fails it as surely as one who reads more.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'
import { groupCreate, groupActivate, groupUpdate, groupPostCreate, memberPostCreate, memberHeartSet, wonderJoin } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'
import { RULES_VERSION } from '@/lib/creator-rules'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim:
    'a signed-out caller reads exactly what a signed-in stranger reads, no member names, nothing private, and writes nothing',
  available: safety.safe && Boolean(DATABASE_URL) && Boolean(SERVICE_ROLE_KEY),
  remedy: `${safety.reason} DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY must also be set. Recipe in .env.local.example`,
})

const OWNER = 'a1340000-0000-4000-8000-000000000134'
const OWNER_NAME = 'Rosa F134owner'
const STRANGER_EMAIL = 'f134-stranger@test.invalid'
const STRANGER_PASSWORD = 'f134-stranger-password-not-a-secret'
const STRANGER_NAME = 'Sam F134stranger'
const METRO = 'e1340000-0000-4000-8000-000000000134'
const HOOD = 'b1340000-0000-4000-8000-000000000134'
const LOCATION = 'd1340000-0000-4000-8000-000000000134'
// A label off the list, as the publish step only offers those.
const TAG = 'Crafts & makers'
const PHONE = '(916) 555-0134'
const PHONE_DIGITS = '5550134'

const BODY = 'F134 PUBLIC BODY kites at the levee Thursday at 2'
const UNLISTED_BODY = 'F134 UNLISTED BODY only the owner chose who sees this'
const PRIVATE_BODY = 'F134 PRIVATE PAGE BODY members of the club only'
const NEIGHBOUR_BODY = 'F134 neighbour post: has anyone seen a red kite?'
const STARTS_AT = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString()

let pool: Pool
let client: PoolClient
let anon: SupabaseClient
let stranger: SupabaseClient
let strangerId: string
let page: string
let privatePage: string
let post: string
let unlistedPost: string
let privatePost: string
let wonder: string
let neighbourPost: string

const ctx = (who: string): ActionContext =>
  ({ actingMemberId: who, viaDelegationId: null, traceId: 'f134', db: {} as never, now: () => new Date() }) as ActionContext

/** A published Page, made the way a member makes one. */
async function publishPage(name: string): Promise<string> {
  const { groupId } = await groupCreate(ctx(OWNER), {
    kind: 'group',
    founderMemberId: OWNER,
    name,
    description: `${name} flies kites on the levee.`,
    anchorLocationId: LOCATION,
  })
  await groupActivate(ctx(OWNER), { groupId, tags: [TAG], rulesVersion: RULES_VERSION })
  return groupId
}

/** The same read as both callers; `[anon, stranger]`. A refusal reads as an empty answer. */
async function both<T>(read: (c: SupabaseClient) => PromiseLike<{ data: T | null; error: unknown }>): Promise<[T | null, T | null]> {
  const [a, s] = await Promise.all([read(anon), read(stranger)])
  return [a.error ? null : a.data, s.error ? null : s.data]
}

describe.skipIf(!RUNNABLE)('F134 — signed out, over PostgREST, with the bundle key', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()

    await client.query(
      // A confirmed phone: member_post.create asks for one.
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, phone_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f134-owner@test.invalid','x',now(),now(),now(),now())`,
      [OWNER],
    )
    await client.query(`insert into public.members (id, handle, display_name, avatar_url) values ($1,'f134-owner',$2,'https://example.test/rosa.webp')`, [OWNER, OWNER_NAME])

    // The stranger holds a real session, so GoTrue mints the token PostgREST checks.
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const created = await admin.auth.admin.createUser({ email: STRANGER_EMAIL, password: STRANGER_PASSWORD, email_confirm: true })
    if (created.error) throw created.error
    strangerId = created.data.user!.id
    await client.query(
      `insert into public.members (id, handle, display_name) values ($1,'f134-stranger',$2)
       on conflict (id) do update set display_name = excluded.display_name`,
      [strangerId, STRANGER_NAME],
    )

    await client.query(
      `insert into public.metro_polygons (id, name, slug, csa_code, geography, centroid)
       values ($1,'F134 Metro','f134-metro','99134',
         ST_GeogFromText('POLYGON((-113.1 44.1, -112.9 44.1, -112.9 43.9, -113.1 43.9, -113.1 44.1))'),
         ST_GeogFromText('POINT(-113 44)'))`,
      [METRO],
    )
    await client.query(
      `insert into public.places (id, slug, display_name, kind, geography, centroid) values
       ($1, 'f134-hood', 'F134 Levee District', 'neighborhood',
        ST_GeogFromText('MULTIPOLYGON(((-113.05 43.95, -112.95 43.95, -112.95 44.05, -113.05 44.05, -113.05 43.95)))'),
        ST_GeogFromText('POINT(-113 44)'))`,
      [HOOD],
    )
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography, place_id)
       values ($1,$2,'permanent','F134 Levee','f134-levee', ST_GeogFromText('POINT(-113 44)'), $3)`,
      [LOCATION, OWNER, HOOD],
    )

    page = await publishPage('F134 Kite Club')
    await groupUpdate(ctx(OWNER), { groupId: page, contactPhone: PHONE })
    post = (await groupPostCreate(ctx(OWNER), { groupId: page, body: BODY, startsAt: STARTS_AT, locationId: LOCATION })).postId
    unlistedPost = (await groupPostCreate(ctx(OWNER), { groupId: page, body: UNLISTED_BODY })).postId
    await client.query(`update public.page_posts set discoverability = 'unlisted' where id = $1`, [unlistedPost])
    wonder = (await groupPostCreate(ctx(OWNER), { groupId: page, body: 'F134 a kite-building night?', kind: 'wonder', wonder: { threshold: 5 } })).postId
    await wonderJoin(ctx(strangerId), { postId: wonder })
    // A heart from the stranger, so a heart read has a name it could leak.
    await memberHeartSet(ctx(strangerId), { postId: post, on: true })

    privatePage = await publishPage('F134 Secret Kite Society')
    privatePost = (await groupPostCreate(ctx(OWNER), { groupId: privatePage, body: PRIVATE_BODY })).postId
    await client.query(`update public.groups set discoverability = 'private' where id = $1`, [privatePage])

    neighbourPost = (await memberPostCreate(ctx(OWNER), { kind: 'ask', body: NEIGHBOUR_BODY, placeId: HOOD })).postId

    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    stranger = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const signedIn = await stranger.auth.signInWithPassword({ email: STRANGER_EMAIL, password: STRANGER_PASSWORD })
    if (signedIn.error) throw signedIn.error
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    const pages = [page, privatePage].filter(Boolean)
    await client.query(`delete from public.wonder_interest where post_id = $1`, [wonder])
    await client.query(`delete from public.hearts where post_id = $1`, [post])
    await client.query(`delete from public.member_post_tags where post_id = $1`, [neighbourPost])
    await client.query(`delete from public.member_posts where member_id = $1`, [OWNER])
    await client.query(`delete from public.post_tags where post_id in (select id from public.page_posts where group_id = any($1))`, [pages])
    await client.query(`delete from public.page_posts where group_id = any($1)`, [pages])
    await client.query(`delete from public.creator_rules_agreements where group_id = any($1)`, [pages])
    await client.query(`delete from public.page_tags where group_id = any($1)`, [pages])
    await client.query(`delete from public.group_events where group_id = any($1)`, [pages])
    await client.query(`delete from public.group_memberships where group_id = any($1)`, [pages])
    await client.query(`delete from public.groups where id = any($1)`, [pages])
    await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
    await client.query(`delete from public.locations where id = $1`, [LOCATION])
    await client.query(`delete from public.places where id = $1`, [HOOD])
    await client.query(`delete from public.metro_polygons where id = $1`, [METRO])
    await client.query(`delete from public.members where id = any($1)`, [[OWNER, strangerId]])
    await client.query(`delete from auth.users where id = any($1)`, [[OWNER, strangerId]])
    client.release()
    await pool.end()
  })

  // ---------------------------------------------------------------
  // Criterion 1 — the same answer, field by field
  // ---------------------------------------------------------------

  // [guards F134.1]
  it("reads a Page, its place, its tags and its public posts exactly as a signed-in stranger does", async () => {
    const pageCols = 'id, name, description, anchor_location_id, where_mode, how_to_find, usually_around, opening_hours, photo_url, discoverability'
    const [aPage, sPage] = await both((c) => c.from('groups').select(pageCols).eq('id', page))
    expect(sPage).toHaveLength(1)
    expect(aPage).toEqual(sPage)

    const [aPlace, sPlace] = await both((c) => c.from('locations').select('id, label, kind, geography, place_id').eq('id', LOCATION))
    expect(sPlace).toHaveLength(1)
    expect(aPlace).toEqual(sPlace)

    const [aTags, sTags] = await both((c) => c.from('page_tags').select('tags(label)').eq('group_id', page))
    expect(sTags).toHaveLength(1)
    expect(aTags).toEqual(sTags)

    const [aPosts, sPosts] = await both((c) =>
      c.from('page_posts').select('id, body, starts_at, location_id, photo_url, kind, wonder_in_count').eq('group_id', page).order('id'),
    )
    expect((sPosts ?? []).map((p) => p.id).sort()).toEqual([post, wonder].sort())
    expect(aPosts).toEqual(sPosts)

    const [aFeed, sFeed] = await both((c) => c.rpc('browse_feed', { p_metro_id: METRO, p_limit: 50 }))
    const ours = (rows: unknown) =>
      ((rows ?? []) as { result_id: string }[]).filter((r) => [page, post, wonder].includes(r.result_id)).sort((x, y) => x.result_id.localeCompare(y.result_id))
    expect(ours(sFeed).length).toBe(3)
    expect(ours(aFeed)).toEqual(ours(sFeed))

    const [aWonder, sWonder] = await both((c) => c.rpc('wonder_view', { p_post_id: wonder }))
    expect((aWonder as { total: number }).total).toBe((sWonder as { total: number }).total)
  })

  // ---------------------------------------------------------------
  // Criterion 2 — Explore's rows and the map's pins
  // ---------------------------------------------------------------

  // [guards F134.2 partial: the database's answer; the screen is guarded in the Explore surface tests]
  it("returns posts and pins to an anonymous Explore read, as it does signed in", async () => {
    const { data, error } = await anon.rpc('browse_feed', { p_metro_id: METRO, p_result_kinds: ['post'], p_limit: 50 })
    expect(error).toBeNull()
    const row = ((data ?? []) as { result_id: string; body: string; location_geography: unknown }[]).find((r) => r.result_id === post)
    expect(row?.body).toBe(BODY)
    expect(row?.location_geography).not.toBeNull()
  })

  // ---------------------------------------------------------------
  // Criterion 3 — the pin at the owner's precision, never closer
  // ---------------------------------------------------------------

  // [guards F134.3]
  it("puts a signed-out pin where a signed-in stranger's pin is, never closer", async () => {
    const pin = (rows: unknown, id: string) => ((rows ?? []) as { result_id: string; location_geography: unknown }[]).find((r) => r.result_id === id)?.location_geography
    const [aFeed, sFeed] = await both((c) => c.rpc('browse_feed', { p_metro_id: METRO, p_limit: 50 }))
    for (const id of [page, post]) {
      expect(pin(sFeed, id)).toBeTruthy()
      expect(pin(aFeed, id)).toEqual(pin(sFeed, id))
    }
  })

  // ---------------------------------------------------------------
  // Criterion 5 — reads come back; every write is refused
  // ---------------------------------------------------------------

  // [guards F134.5]
  it('returns public posts with body, starts_at and location, and refuses every insert, update and delete on every table', async () => {
    const { data: read } = await anon.from('page_posts').select('body, starts_at, location_id').eq('id', post)
    expect(read).toEqual([{ body: BODY, starts_at: expect.any(String), location_id: LOCATION }])

    const { rows: tables } = await client.query<{ table_name: string; column_name: string }>(
      `select c.relname as table_name, a.attname as column_name
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
         join lateral (select attname from pg_attribute where attrelid = c.oid and attnum > 0 and not attisdropped order by attnum limit 1) a on true
        where c.relkind in ('r', 'p')
          and not c.relispartition
          and c.relname not in ('spatial_ref_sys')
        order by 1`,
    )
    expect(tables.length).toBeGreaterThan(50)
    const allowed: string[] = []
    for (const { table_name: t, column_name: col } of tables) {
      const ins = await anon.from(t).insert({})
      // `is null` matches nothing in any column type, so an error here is the refusal, never a bad comparison.
      const upd = await anon.from(t).update({ [col]: null }).is(col, null)
      const del = await anon.from(t).delete().is(col, null)
      // A write the database answers without an error is a write it would have run on a row that matched.
      for (const [verb, r] of [['insert', ins], ['update', upd], ['delete', del]] as const) if (!r.error) allowed.push(`${verb} ${t}`)
    }
    expect(allowed).toEqual([])
  })

  // ---------------------------------------------------------------
  // Criterion 6 — what stays private stays private
  // ---------------------------------------------------------------

  // [guards F134.6]
  it("gets nothing a stranger cannot read: no unlisted post, no private Page's posts, no phone, no member row", async () => {
    const { data: posts } = await anon.from('page_posts').select('id, body').in('id', [unlistedPost, privatePost])
    expect(posts ?? []).toEqual([])
    const { data: feed } = await anon.rpc('browse_feed', { p_metro_id: METRO, p_limit: 50 })
    const text = JSON.stringify(feed ?? [])
    expect(text).not.toContain('UNLISTED BODY')
    expect(text).not.toContain('PRIVATE PAGE BODY')

    const phone = await anon.from('groups').select('contact_phone').eq('id', page)
    expect(JSON.stringify(phone.data ?? [])).not.toContain(PHONE_DIGITS)
    const all = await anon.from('groups').select('*').eq('id', page)
    expect(JSON.stringify(all.data ?? [])).not.toContain(PHONE_DIGITS)
    // The stranger, signed in, does read it: the phone is for members.
    const { data: theirs } = await stranger.from('groups').select('contact_phone').eq('id', page)
    expect(JSON.stringify(theirs)).toContain(PHONE_DIGITS)

    for (const t of ['members', 'member_interests', 'member_follows', 'hearts', 'saves', 'wonder_interest', 'member_posts']) {
      const { data } = await anon.from(t).select('*').limit(1)
      expect(data ?? [], t).toEqual([])
    }
    const founder = await anon.from('groups').select('founder_member_id').eq('id', page)
    expect(JSON.stringify(founder.data ?? [])).not.toContain(OWNER)
  })

  // ---------------------------------------------------------------
  // Criterion 7 — names stay between members; counts show
  // ---------------------------------------------------------------

  // [guards F134.7]
  it("shows counts without names signed out, and names to a signed-in member as before", async () => {
    const [aWonder, sWonder] = await both((c) => c.rpc('wonder_view', { p_post_id: wonder }))
    expect(aWonder).toMatchObject({ total: 1, inNames: [] })
    expect(JSON.stringify(aWonder)).not.toContain(STRANGER_NAME)
    expect((sWonder as { inNames: string[] }).inNames).toContain(STRANGER_NAME)

    const [aNeighbour, sNeighbour] = await both((c) => c.rpc('member_posts_read', { p_post_id: neighbourPost }))
    const one = (v: unknown) => ((v ?? []) as { body: string; displayName: string | null; avatarUrl: string | null }[])[0]
    expect(one(aNeighbour)).toMatchObject({ body: NEIGHBOUR_BODY, displayName: null, avatarUrl: null })
    expect(one(sNeighbour)).toMatchObject({ body: NEIGHBOUR_BODY, displayName: OWNER_NAME })

    // The stranger's heart is on the post: signed out, no name comes back with it.
    const { data: hearts, error: heartsError } = await anon.rpc('heart_view', { p_group_id: page })
    expect(heartsError).toBeNull()
    expect(JSON.stringify(hearts ?? null)).not.toContain(STRANGER_NAME)
  })

  // ---------------------------------------------------------------
  // Criterion 8 — the withheld read is gone
  // ---------------------------------------------------------------

  // [guards F134.8 partial: the database's withheld projections are gone; the screens are guarded in the component tests]
  it('no longer offers the bodiless F093 projections', async () => {
    const withheld = await anon.rpc('announcements_withheld', { p_metro_id: METRO })
    const preview = await anon.rpc('shared_post_preview', { p_group_id: page, p_post_id: post })
    expect(withheld.error).not.toBeNull()
    expect(preview.error).not.toBeNull()
  })

  // ---------------------------------------------------------------
  // Criterion 9 — a signed-in member sees no change
  // ---------------------------------------------------------------

  // [guards F134.9 partial: what a signed-in stranger reads of a Page and its posts; the order and the follow rows are unchanged code]
  it('still gives a signed-in stranger the posts, places and names it gave before', async () => {
    const { data } = await stranger.from('page_posts').select('id, body, starts_at, location_id').eq('id', post)
    expect(data).toEqual([{ id: post, body: BODY, starts_at: expect.any(String), location_id: LOCATION }])
  })
})
