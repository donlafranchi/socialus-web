import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'
import { reportDecide } from '@/actions'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { shareMetadata } from '@/lib/groups/share-metadata'
import { visiblePhotoUrl } from '@/lib/groups/visible-photo-url'
import { getBrowseFeed } from '@/lib/feed/browse-feed'
import { rowsToMapPages, type MapPageRow } from '@/hooks/useMapPages'
import type { ActionContext } from '@/actions/_lib/context'

// #833 — F058 criterion 4: removing a photo stops every surface serving it (the Page, its share card, Browse and
// the map, each read as the app reads it) and writes a decision row naming who, when and why; the listing and its
// photo_url survive, which is what keeps the removal reversible.

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim: 'a removed photo is gone from the Page, its share card, Browse and the map, and the decision names who, when and why',
  available: safety.safe && Boolean(DATABASE_URL && ANON_KEY && SERVICE_ROLE_KEY),
  remedy: `${safety.reason} DATABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must also be set. Recipe in .env.local.example`,
})

const OP = 'a7000000-0000-4000-8000-000000000833'
const OWNER = 'b7000000-0000-4000-8000-000000000833'
const REPORTER = 'b7000000-0000-4000-8000-000000000834'
const PAGE = 'c7000000-0000-4000-8000-000000000833'
const ANCHOR = 'd7000000-0000-4000-8000-000000000833'
const REPORT = 'e7000000-0000-4000-8000-000000000833'
const PHOTO = 'https://example.test/b833-storefront.webp'
const READER_EMAIL = 'b833-reader@test.invalid'
const READER_PASSWORD = 'b833-reader-password-not-a-secret'
const MAP_SELECT = readFileSync(resolve(__dirname, '../src/hooks/useMapPages.ts'), 'utf8').match(/const SELECT =\s*'([^']*)' \+\s*'([^']*)'/)!.slice(1).join('')

let pool: Pool
let client: PoolClient
let reader: SupabaseClient
let readerId: string
let publicId: string
let metroId: string
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext

beforeAll(async () => {
  if (!RUNNABLE) return
  process.env.OPERATOR_MEMBER_ID = OP
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  // A signed-in member reads the surfaces: signed out, the database withholds a Page's row (F093).
  const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const created = await admin.auth.admin.createUser({ email: READER_EMAIL, password: READER_PASSWORD, email_confirm: true })
  if (created.error) throw created.error
  readerId = created.data.user!.id
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b833reader','b833reader') on conflict (id) do nothing`, [readerId])
  reader = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  const signedIn = await reader.auth.signInWithPassword({ email: READER_EMAIL, password: READER_PASSWORD })
  if (signedIn.error) throw signedIn.error
  for (const [id, h] of [[OP, 'b833op'], [OWNER, 'b833o'], [REPORTER, 'b833r']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','B833 Storefront','b833-storefront', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [ANCHOR, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id, photo_url)
     values ($1,'business','B833 Bakery','b833-bakery','Bread.','active','listed',$2,$3,$4)`,
    [PAGE, OWNER, ANCHOR, PHOTO],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [PAGE, OWNER])
  await client.query(`insert into public.reports (id, reporter_member_id, subject_kind, subject_id, body, category) values ($1,$2,'group',$3,'Not their photo','other')`, [REPORT, REPORTER, PAGE])
  publicId = (await client.query(`select public_id from public.groups where id = $1`, [PAGE])).rows[0].public_id
  metroId = (await client.query(`select id from public.metro_polygons where slug = 'sacramento-roseville-ca'`)).rows[0].id
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.report_decisions where report_id = $1`, [REPORT])
  await client.query(`delete from public.reports where id = $1`, [REPORT])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.locations where id = $1`, [ANCHOR])
  await client.query(`delete from public.members where id = any($1)`, [[OP, OWNER, REPORTER, readerId]])
  await client.query(`delete from auth.users where id = any($1)`, [[OP, OWNER, REPORTER, readerId]])
  client.release()
  await pool.end()
})

/** What each surface serves for this Page's photo, read the way the app reads it. */
async function surfaces() {
  const shop = (await resolvePageById(reader, publicId))!
  const page = visiblePhotoUrl({ photo_url: shop.photoUrl, photo_hidden_at: shop.photoHiddenAt, photo_removed_at: shop.photoRemovedAt })
  const og = shareMetadata(shop).openGraph as { images: { url: string }[] }
  const browse = (await getBrowseFeed(reader, { scope: { metroId }, resultKinds: ['page'], sort: 'newest', limit: 200 })).find((r) => r.groupId === PAGE)
  const { data, error } = await reader.from('groups').select(MAP_SELECT).eq('id', PAGE).eq('lifecycle_state', 'active').eq('discoverability', 'listed')
  if (error) throw error
  const [pin] = rowsToMapPages(data as unknown as MapPageRow[])
  return { page, share: og.images[0]!.url, browse: browse?.photoUrl, map: pin?.photoUrl, listed: Boolean(browse && pin) }
}

describe.skipIf(!RUNNABLE)('#833 — F058.4 a removal stops every surface and is a recorded decision', () => {
  // [guards F058.4]
  it('after the operator removes the photo, the Page, its share card, Browse and the map serve none; the decision names who, when and why; the listing and photo_url survive', async () => {
    // Every surface serves it first, so the check below cannot pass by reading nothing.
    expect(await surfaces()).toEqual({ page: PHOTO, share: PHOTO, browse: PHOTO, map: PHOTO, listed: true })

    const before = Date.now()
    await reportDecide(ctx(OP), { reportId: REPORT, outcome: 'removed', reasonCode: 'other', reasonNote: 'Not the owner\'s photo.' })

    const after = await surfaces()
    expect(after.page).toBeNull()
    expect(after.share).not.toBe(PHOTO)
    expect(after.share).toMatch(/\/og-default$/)
    expect(after.browse).toBeNull()
    expect(after.map).toBeNull()
    // The listing itself survives untouched, still on Browse and the map.
    expect(after.listed).toBe(true)

    const d = (await client.query(`select decided_by_member_id, decided_by_ai, decided_at, outcome, reason_code, reason_note from public.report_decisions where report_id = $1`, [REPORT])).rows
    expect(d).toHaveLength(1)
    expect(d[0]).toMatchObject({ decided_by_member_id: OP, decided_by_ai: false, outcome: 'removed', reason_code: 'other', reason_note: 'Not the owner\'s photo.' })
    expect(new Date(d[0].decided_at).getTime()).toBeGreaterThanOrEqual(before - 1000)

    const g = (await client.query(`select lifecycle_state, discoverability, name, photo_url, photo_removed_at from public.groups where id = $1`, [PAGE])).rows[0]
    expect(g).toMatchObject({ lifecycle_state: 'active', discoverability: 'listed', name: 'B833 Bakery', photo_url: PHOTO })
    expect(g.photo_removed_at).not.toBeNull()
  })
})
