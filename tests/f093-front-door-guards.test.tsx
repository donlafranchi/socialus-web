// F093 criteria 6, 8 and 11 — standing guards, each checked on the real thing:
// real rows, read as an anonymous caller with the bundle key, rendered with the
// real Page and card components. A mutant that leaks a location, a tag or the
// founder, that varies the card by reader, or that changes what a member sees,
// has to turn one of these red.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { Pool, type PoolClient } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/g/x',
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND')
  },
}))
vi.mock('@/app/create/actions', () => ({ publishDraftAction: vi.fn() }))
vi.mock('@/app/g/[handle]/edit/actions', () => ({ editPageAction: vi.fn() }))
vi.mock('@/app/_actions/report-actions', () => ({ sendReportAction: vi.fn(), sendPostReportAction: vi.fn() }))
vi.mock('@/app/_actions/page-follow-actions', () => ({ followPageAction: vi.fn(), unfollowPageAction: vi.fn() }))
vi.mock('@/app/_actions/page-post-actions', () => ({
  postToPageAction: vi.fn(),
  editPagePostAction: vi.fn(),
  deletePagePostAction: vi.fn(),
}))

import { ShopPublicPage } from '@/components/group/ShopPublicPage'
import { WithheldAnnouncementCard } from '@/components/browse/WithheldAnnouncementCard'
import { resolvePageById } from '@/lib/groups/resolve-page-address'
import { loadPageView } from '@/lib/groups/load-page-view'
import { getWithheldAnnouncements } from '@/lib/feed/withheld-announcements'
import { getBrowseFeed } from '@/lib/feed/browse-feed'
import { BrowseResultCard } from '@/components/browse/BrowseResultCard'
import robots, { TRAINING_CRAWLERS, PRIVATE_PATHS } from '@/app/robots'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim: "a signed-out visitor gets a Page's front door and no location, tags or founder, and the same card as everyone",
  available: safety.safe && Boolean(DATABASE_URL),
  remedy: `${safety.reason} DATABASE_URL must also be set. Recipe in .env.local.example`,
})

const OWNER = 'a3000000-0000-4000-8000-000000000931'
const PAGE = 'c3000000-0000-4000-8000-000000000931'
const LOCATION = 'd3000000-0000-4000-8000-000000000931'
const TAG = 'e3000000-0000-4000-8000-000000000931'
const POST = 'f3000000-0000-4000-8000-000000000931'
const POST_SOON = 'f3000000-0000-4000-8000-000000000932'
const BODY_SOON = 'F931 EARLIER BODY first Tuesday at nine'
const METRO_SLUG = 'sacramento-roseville-ca'
const PLACE_TEXT = '12 Broadway Oak Park'
const TAG_TEXT = 'F931Running'
const FOUNDER_TEXT = 'f931founder'
const BODY = 'F931 SECRET BODY come Thursday at six'
const DESCRIPTION = 'We run together every week.'

let pool: Pool
let client: PoolClient
let anon: SupabaseClient
let member: SupabaseClient
let readerId: string
const READER_EMAIL = 'f931-reader@test.invalid'
const READER_PASSWORD = 'f931-reader-password-not-a-secret'
let publicId: string
let metroId: string

async function pageAs(supabase: SupabaseClient) {
  const shop = await resolvePageById(supabase, publicId)
  expect(shop).not.toBeNull()
  const view = await loadPageView(supabase, shop!)
  return render(
    <ShopPublicPage
      shop={shop!}
      items={view.items}
      badge={view.badge}
      loggedIn={view.loggedIn}
      ownerClaim={view.ownerClaim}
      viewerOwnsPage={view.viewerOwnsPage}
      viewerFollows={view.viewerFollows}
      viewerIsMember={view.viewerIsMember}
      posts={view.posts}
      withheldPosts={view.withheldPosts}
      followerCount={view.followerCount}
      viewerMemberId={view.viewerMemberId}
      contactOn={view.contactOn}
      productsOn={view.productsOn}
      draftTagCount={view.draftTagCount}
      tags={view.tags}
      contact={view.contact}
      where={view.where}
      pagePath={`/g/${publicId}`}
    />,
  )
}

describe.skipIf(!RUNNABLE)("F093 — a Page's front door, signed out", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()
    metroId = (await client.query(`select id from public.metro_polygons where slug = $1`, [METRO_SLUG])).rows[0].id
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f931-owner@test.invalid','x',now(),now(),now())`,
      [OWNER],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,'F931 Founder')`, [OWNER, FOUNDER_TEXT])
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography)
       values ($1,$2,'permanent',$3,'f931-12-broadway', ST_GeogFromText('POINT(-121.4702 38.5412)'))`,
      [LOCATION, OWNER, PLACE_TEXT],
    )
    await client.query(
      `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'group','F931 Run Club','f931-run-club',$4,'active','listed',$2,$3)`,
      [PAGE, OWNER, LOCATION, DESCRIPTION],
    )
    publicId = (await client.query(`select public_id from public.groups where id = $1`, [PAGE])).rows[0].public_id
    await client.query(`insert into public.tags (id, label, normalized, status, created_by) values ($1,$2,'f931-running','visible',$3)`, [TAG, TAG_TEXT, OWNER])
    await client.query(`insert into public.page_tags (group_id, tag_id) values ($1,$2)`, [PAGE, TAG])
    await client.query(
      `insert into public.page_posts (id, group_id, body, starts_at, location_id, lifecycle_state, discoverability)
       values ($1,$2,$3, now() + interval '3 days', $4, 'active', 'listed')`,
      [POST, PAGE, BODY, LOCATION],
    )
    await client.query(
      `insert into public.page_posts (id, group_id, body, starts_at, location_id, lifecycle_state, discoverability, updated_at)
       values ($1,$2,$3, now() + interval '1 day', $4, 'active', 'listed', now() - interval '1 hour')`,
      [POST_SOON, PAGE, BODY_SOON, LOCATION],
    )
    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    const created = await admin.auth.admin.createUser({ email: READER_EMAIL, password: READER_PASSWORD, email_confirm: true })
    if (created.error) throw created.error
    readerId = created.data.user!.id
    await client.query(`insert into public.members (id, handle, display_name) values ($1,'f931-reader','f931-reader') on conflict (id) do nothing`, [readerId])
    member = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const signedIn = await member.auth.signInWithPassword({ email: READER_EMAIL, password: READER_PASSWORD })
    expect(signedIn.error).toBeNull()
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
    await client.query(`delete from public.page_tags where group_id = $1`, [PAGE])
    await client.query(`delete from public.tags where id = $1`, [TAG])
    await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
    await client.query(`delete from public.groups where id = $1`, [PAGE])
    await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
    await client.query(`delete from public.locations where id = $1`, [LOCATION])
    await client.query(`delete from public.members where id = any($1)`, [[OWNER, readerId]])
    await client.query(`delete from auth.users where id = any($1)`, [[OWNER, readerId]])
    client.release()
    await pool.end()
  })

  afterEach(cleanup)

  const metroOpts = () => ({ scope: { metroId } })
  const exploreCard = async (supabase: SupabaseClient) => {
    const rows = await getBrowseFeed(supabase, { ...metroOpts(), resultKinds: ['page'], limit: 100 })
    const row = rows.find((r) => r.name === 'F931 Run Club')
    expect(row, 'the Page is in Explore').toBeDefined()
    return render(<BrowseResultCard result={row!} />).container
  }

  // [guards F093.8]
  it('a signed-out Page shows its name, description and the withheld card, and no location, tag, founder or body; Explore the same; and crawlers are admitted to the Page', async () => {
    const { container } = await pageAs(anon)
    const html = container.innerHTML
    const text = container.textContent ?? ''
    expect(text).toContain('F931 Run Club')
    expect(text).toContain(DESCRIPTION)
    expect(container.querySelector('[data-testid="page-post-withheld"]')).not.toBeNull()
    const secrets = [BODY_SOON, PLACE_TEXT, '12 Broadway', TAG_TEXT, FOUNDER_TEXT, 'F931 Founder', BODY, 'SECRET BODY', LOCATION, OWNER]
    for (const secret of secrets) {
      expect(html, `a signed-out Page must not carry "${secret}"`).not.toContain(secret)
    }
    cleanup()

    const card = await exploreCard(anon)
    expect(card.textContent).toContain('F931 Run Club')
    for (const secret of secrets) {
      expect(card.innerHTML, `a signed-out Explore card must not carry "${secret}"`).not.toContain(secret)
    }

    // Indexable, front door only: search crawlers are admitted to Pages, training crawlers are not.
    const rules = robots().rules as { userAgent: string | string[]; allow?: string | string[]; disallow?: string | string[] }[]
    const asList = (v?: string | string[]) => (v === undefined ? [] : Array.isArray(v) ? v : [v])
    const everyone = rules.find((r) => asList(r.userAgent).includes('*'))!
    expect(asList(everyone.allow)).toContain('/')
    expect(asList(everyone.disallow).some((d) => d === '/g/' || d === '/g' || d === '/')).toBe(false)
    for (const bot of ['Googlebot', 'Bingbot']) expect(TRAINING_CRAWLERS as readonly string[]).not.toContain(bot)
    expect(PRIVATE_PATHS as readonly string[]).not.toContain('/g/')
    const trainers = rules.filter((r) => asList(r.userAgent).some((u) => (TRAINING_CRAWLERS as readonly string[]).includes(u)))
    expect(trainers.length).toBeGreaterThan(0)
  })

  // [guards F093.6]
  it('a signed-in member sees the bodies, times, places and tags as before, in the same order, on a Page and on Explore, and never a withheld card', async () => {
    const { container } = await pageAs(member)
    const text = container.textContent ?? ''
    expect(text).toContain(BODY)
    expect(text).toContain(TAG_TEXT)
    expect(text).toMatch(/12 Broadway|Oak Park|Sacramento/)
    expect(container.querySelector('[data-testid="page-post-withheld"]')).toBeNull()
    expect(container.querySelector('[data-testid="withheld-cta"]')).toBeNull()
    cleanup()

    const view = await loadPageView(member, (await resolvePageById(member, publicId))!)
    expect(view.withheldPosts).toEqual([])
    expect(view.posts.map((p) => p.body).sort()).toEqual([BODY, BODY_SOON].sort())
    expect(view.tags).toContain(TAG_TEXT)

    // Explore: the post row carries its body, time and place; the Page row its place and tags.
    const rows = await getBrowseFeed(member, { ...metroOpts(), limit: 100 })
    const post = rows.find((r) => r.resultKind === 'post' && r.body === BODY)
    expect(post, 'the announcement reaches a member with its body').toBeDefined()
    expect(post!.startsAt).toBeTruthy()
    expect(post!.withheld).toBeFalsy()
    const pageRow = rows.find((r) => r.name === 'F931 Run Club' && r.resultKind === 'page')!
    expect(pageRow.locationLabel).toBe(PLACE_TEXT)
    expect(pageRow.tags).toContain(TAG_TEXT)
    // Ordering: soonest first, by the time each announcement says it starts.
    const soonest = await getBrowseFeed(member, { ...metroOpts(), resultKinds: ['post'], sort: 'soonest', limit: 100 })
    expect(soonest.filter((r) => r.body === BODY_SOON || r.body === BODY).map((r) => r.body)).toEqual([BODY_SOON, BODY])
  })

  // [guards F093.11]
  it('the card is the same for every anonymous reader: nothing on the withheld path reads the request, a cookie, storage, a clock or a place', async () => {
    const readers = [
      createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } }),
      createClient(SUPABASE_URL!, ANON_KEY!, {
        auth: { persistSession: false },
        global: { headers: { 'x-forwarded-for': '203.0.113.9', 'accept-language': 'ja-JP', 'x-vercel-ip-city': 'Tokyo', cookie: 'seen=1' } },
      }),
    ]
    const period = { from: new Date(Date.now() - 86400000).toISOString(), to: new Date(Date.now() + 86400000).toISOString() }
    const rows = await Promise.all(readers.map((r) => getWithheldAnnouncements(r, { scope: { metroId }, period, now: new Date().toISOString() })))
    const ours = rows.map((list) => list.filter((r) => r.name === 'F931 Run Club'))
    expect(ours[0]!.length).toBe(1)
    expect(ours[1]).toEqual(ours[0])

    const htmls: string[] = []
    const tz = process.env.TZ
    for (const [i, row] of [ours[0]![0]!, ours[1]![0]!].entries()) {
      process.env.TZ = i === 0 ? 'America/Los_Angeles' : 'Asia/Tokyo'
      document.cookie = `seen=${i}`
      window.localStorage.setItem('prior-visit', String(i))
      htmls.push(render(<WithheldAnnouncementCard result={row} />).container.innerHTML)
      cleanup()
    }
    process.env.TZ = tz
    expect(htmls[1]).toBe(htmls[0])

    // The files that make the card read nothing from the reader.
    const FILES = [
      'src/lib/feed/withheld-announcements.ts',
      'src/components/browse/WithheldAnnouncementCard.tsx',
      'src/components/browse/withheld-copy.ts',
      'src/components/group/WithheldPagePosts.tsx',
    ]
    const PER_READER =
      /\bcookies\s*\(|\bheaders\s*\(|document\.cookie|localStorage|sessionStorage|\bnavigator\b|geolocation|x-vercel-ip|x-forwarded|Math\.random|Intl\.|toLocale|getTimezoneOffset|auth\.getUser|getSession/
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const offenders = FILES.filter((f) => PER_READER.test(strip(readFileSync(resolve(__dirname, '..', f), 'utf8'))))
    expect(offenders).toEqual([])
  })
})
