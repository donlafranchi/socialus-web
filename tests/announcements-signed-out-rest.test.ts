// F093 — the withholding, asked of the database over the wire.
//
// THIS SUITE EXISTS BECAUSE A COMPONENT TEST CANNOT DISCHARGE F093 CRITERION 1,
// AND THE SCENARIO SAYS SO. The rows behind Explore are also served by
// PostgREST on a `*.supabase.co` origin with a publishable key that ships
// inside our own JavaScript — an origin no robots.txt and no Vercel firewall
// sits in front of, and the one #178 counted our tables through. A hide in
// React is an inert guard under `[guard-proves-itself]`: green on every run,
// absent the moment anyone asks the database directly.
//
// So this asks the database directly, with the anon key, exactly as an outside
// agent would. It does not read the policy text — criterion 1 is explicit that
// the check is made by CALLING the endpoint. A test that greps a migration for
// `to authenticated` proves someone typed the words (lesson 28).
//
// Seeded through `pg` as the table owner and torn down after, the same shape
// tests/page-post-db.test.ts uses.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim:
    'an anonymous caller cannot retrieve an announcement body, time or place from the database, ' +
    'while a signed-in member still can',
  available: safety.safe && Boolean(DATABASE_URL),
  remedy: `${safety.reason} DATABASE_URL must also be set. Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-00000000f093'
const READER_EMAIL = 'f093-reader@test.invalid'
const READER_PASSWORD = 'f093-reader-password-not-a-secret'
const GROUP = 'cccccccc-0000-4000-8000-00000000f093'
const LOCATION = 'dddddddd-0000-4000-8000-00000000f093'
const METRO = 'eeeeeeee-0000-4000-8000-00000000f093'
const POST = 'ffffffff-0000-4000-8000-00000000f093'

/** The exact words the test looks for. If any of these reach anon, it failed. */
const BODY = 'F093 SECRET BODY — we are meeting Thursday at 2pm at the river'

/** Far enough ahead that the past-dated drop-out never reaches it. */
const STARTS_AT = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()

let pool: Pool
let client: PoolClient
let anon: SupabaseClient
let readerId: string

describe.skipIf(!RUNNABLE)('F093 — signed out, over PostgREST, with the bundle key', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()

    // The owner exists only to satisfy foreign keys, so a direct insert is
    // enough. The reader has to hold a real session, so it goes through the
    // admin API — a row written straight into auth.users is not a user GoTrue
    // will mint a token for, and the failure reads as "Database error finding
    // user" rather than as a missing column.
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [OWNER, 'f093-owner@test.invalid'],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$3)`, [
      OWNER,
      'f093-owner',
      'f093-owner',
    ])

    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const created = await admin.auth.admin.createUser({
      email: READER_EMAIL,
      password: READER_PASSWORD,
      email_confirm: true,
    })
    if (created.error) throw created.error
    readerId = created.data.user!.id
    await client.query(
      `insert into public.members (id, handle, display_name) values ($1,$2,$3)
       on conflict (id) do nothing`,
      [readerId, 'f093-reader', 'f093-reader'],
    )

    // A metro polygon around a point nobody else seeds, so the scope test
    // cannot pass on somebody else's rows.
    await client.query(
      `insert into public.metro_polygons (id, name, slug, csa_code, geography, centroid)
       values ($1,'F093 Metro','f093-metro','99093',
         ST_GeogFromText('POLYGON((-100.1 40.1, -99.9 40.1, -99.9 39.9, -100.1 39.9, -100.1 40.1))'),
         ST_GeogFromText('POINT(-100 40)'))`,
      [METRO],
    )
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography)
       values ($1,$2,'permanent','F093 River Bank','f093-river-bank', ST_GeogFromText('POINT(-100 40)'))`,
      [LOCATION, OWNER],
    )
    await client.query(
      `insert into public.groups
         (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'interest','F093 Floaters','f093-floaters','active','listed',$2,$3)`,
      [GROUP, OWNER, LOCATION],
    )
    await client.query(
      `insert into public.page_posts
         (id, group_id, body, starts_at, location_id, lifecycle_state, discoverability)
       values ($1,$2,$3,$4,$5,'active','listed')`,
      [POST, GROUP, BODY, STARTS_AT, LOCATION],
    )

    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    await client.query(`delete from public.page_posts where group_id = $1`, [GROUP])
    await client.query(`delete from public.group_events where group_id = $1`, [GROUP])
    await client.query(`delete from public.groups where id = $1`, [GROUP])
    await client.query(`delete from public.locations where id = $1`, [LOCATION])
    await client.query(`delete from public.metro_polygons where id = $1`, [METRO])
    await client.query(`delete from public.members where id = any($1)`, [[OWNER, readerId]])
    await client.query(`delete from auth.users where id = any($1)`, [[OWNER, readerId]])
    client.release()
    await pool.end()
  })

  // ---------------------------------------------------------------
  // Criterion 1 — the body
  // ---------------------------------------------------------------

  it('returns no announcement row at all to an anonymous select on page_posts', async () => {
    const { data, error } = await anon.from('page_posts').select('*').eq('id', POST)
    // A refusal and an empty set are both acceptable answers; a row is not.
    expect(error ? [] : (data ?? [])).toHaveLength(0)
  })

  // [guards F093.1]
  it('does not leak the body through an anonymous select that names the column', async () => {
    const { data, error } = await anon.from('page_posts').select('id, body').eq('group_id', GROUP)
    const rows = error ? [] : (data ?? [])
    expect(JSON.stringify(rows)).not.toContain('SECRET BODY')
  })

  // ---------------------------------------------------------------
  // Criterion 2 — the time and the place go with it
  // ---------------------------------------------------------------

  // [guards F093.2]
  it('does not leak starts_at or location_id to an anonymous caller', async () => {
    const { data, error } = await anon
      .from('page_posts')
      .select('id, starts_at, location_id')
      .eq('group_id', GROUP)
    const rows = error ? [] : (data ?? [])
    expect(rows).toHaveLength(0)
  })

  it('returns no post-kind rows from browse_feed to an anonymous caller', async () => {
    const { data, error } = await anon.rpc('browse_feed', {
      p_metro_id: METRO,
      p_result_kinds: ['post'],
      p_limit: 50,
    })
    const rows = error ? [] : ((data ?? []) as unknown[])
    expect(rows).toHaveLength(0)
  })

  // ---------------------------------------------------------------
  // Criteria 3, 4, 7 — the withheld read path
  // ---------------------------------------------------------------

  it('serves the withheld card to an anonymous caller, scoped to the metro', async () => {
    const { data, error } = await anon.rpc('announcements_withheld', {
      p_metro_id: METRO,
      p_limit: 50,
    })
    expect(error).toBeNull()
    const rows = (data ?? []) as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]!.result_id).toBe(POST)
    expect(rows[0]!.name).toBe('F093 Floaters')
  })

  // [guards F093.3]
  it('projects no body, no time and no place — the shape is the guarantee', async () => {
    const { data } = await anon.rpc('announcements_withheld', { p_metro_id: METRO, p_limit: 50 })
    const row = ((data ?? []) as Record<string, unknown>[])[0]!
    // Asserted as ABSENT KEYS rather than null values. A null column is a
    // filter someone can stop applying; a column that does not exist in the
    // function's signature cannot be un-withheld by a later caller.
    for (const withheld of [
      'body',
      'starts_at',
      'location_id',
      'location_label',
      'location_geography',
      'description',
    ]) {
      expect(Object.keys(row)).not.toContain(withheld)
    }
    expect(JSON.stringify(row)).not.toContain('SECRET BODY')
  })

  // [guards F093.4] [guards F093.5]
  it('carries the Page name and a count of that Page for the period', async () => {
    const { data } = await anon.rpc('announcements_withheld', {
      p_metro_id: METRO,
      p_period_from: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      p_period_to: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      p_limit: 50,
    })
    const row = ((data ?? []) as Record<string, unknown>[])[0]!
    expect(row.name).toBe('F093 Floaters')
    expect(row.announcement_count).toBe(1)
  })

  it('counts nothing for a period the announcement is outside of', async () => {
    const { data } = await anon.rpc('announcements_withheld', {
      p_metro_id: METRO,
      p_period_from: '2020-01-01T00:00:00.000Z',
      p_period_to: '2020-01-08T00:00:00.000Z',
      p_limit: 50,
    })
    const row = ((data ?? []) as Record<string, unknown>[])[0]!
    // The card still exists — that something is happening is public. Only the
    // count is scoped to the period.
    expect(row.announcement_count).toBe(0)
  })

  it('withholds a draft announcement from the withheld path too', async () => {
    await client.query(`update public.page_posts set discoverability = 'unlisted' where id = $1`, [
      POST,
    ])
    try {
      const { data } = await anon.rpc('announcements_withheld', { p_metro_id: METRO, p_limit: 50 })
      expect((data ?? []) as unknown[]).toHaveLength(0)
    } finally {
      await client.query(`update public.page_posts set discoverability = 'listed' where id = $1`, [
        POST,
      ])
    }
  })

  // ---------------------------------------------------------------
  // Criterion 9 — the anchor a signed-out visitor follows
  // ---------------------------------------------------------------

  // [guards F093.9]
  it('serves the withheld card for one Page, so an announcement anchor resolves', async () => {
    const { data, error } = await anon.rpc('announcements_withheld', { p_group_id: GROUP })
    expect(error).toBeNull()
    const rows = (data ?? []) as Record<string, unknown>[]
    expect(rows.map((r) => r.result_id)).toContain(POST)
  })

  // ---------------------------------------------------------------
  // Criterion 6 — a signed-in member sees no change
  // ---------------------------------------------------------------

  // [guards F093.6]
  it('still returns the body to a signed-in member', async () => {
    // The service-role key bypasses RLS, so it cannot answer this. This asks
    // as a real `authenticated` caller — the role the policy actually judges.
    const member = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const signedIn = await member.auth.signInWithPassword({
      email: READER_EMAIL,
      password: READER_PASSWORD,
    })
    expect(signedIn.error).toBeNull()
    const { data, error } = await member.from('page_posts').select('id, body').eq('id', POST)
    expect(error).toBeNull()
    expect((data ?? [])[0]?.body).toBe(BODY)
  })
})

