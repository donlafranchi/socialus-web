// F093 criteria 4, 5, 9 and 10, each checked in one place from the database to
// the screen: seed real rows, ask for them over the wire as an anonymous caller
// with the bundle key, and render what comes back with the real components.
//
// The older checks cover halves of each (the SQL in announcements-signed-out-rest,
// the card in WithheldAnnouncementCard.test.tsx). A half cannot discharge a
// criterion ([guard-proves-itself]), so these run the whole path and claim the
// criterion. Nothing here reads a policy: it calls the endpoint.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { Pool, type PoolClient } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'
import { WithheldAnnouncementCard } from '@/components/browse/WithheldAnnouncementCard'
import { WithheldPagePosts } from '@/components/group/WithheldPagePosts'
import { mapWithheldRow } from '@/lib/feed/withheld-announcements'
import { METRO_WEEK_LABEL } from '@/lib/metro/metro-week'
import type { BrowseResult } from '@/lib/feed/browse-feed'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim: 'the signed-out card carries five things, one per Page, resolves every post link, and links to no body',
  available: safety.safe && Boolean(DATABASE_URL),
  remedy: `${safety.reason} DATABASE_URL must also be set. Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-00000000f094'
const METRO = 'eeeeeeee-0000-4000-8000-00000000f094'
const LOCATION = 'dddddddd-0000-4000-8000-00000000f094'
const WITH_PHOTO = 'cccccccc-0000-4000-8000-00000000f094'
const NO_PHOTO = 'cccccccc-0000-4000-8000-00000001f094'
const POST_A = 'ffffffff-0000-4000-8000-00000000f094'
const POST_B = 'ffffffff-0000-4000-8000-00000001f094'
const POST_C = 'ffffffff-0000-4000-8000-00000002f094'
const PHOTO = 'https://example.test/f094-photo.jpg'
const BODY = 'F094 SECRET BODY meet Thursday at the river'
const PLACE_LABEL = 'F094 River Bank'
const STARTS_AT = new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString()

let pool: Pool
let client: PoolClient
let anon: SupabaseClient

async function withheld(args: Record<string, unknown>): Promise<BrowseResult[]> {
  const { data, error } = await anon.rpc('announcements_withheld', args)
  expect(error).toBeNull()
  return ((data ?? []) as Parameters<typeof mapWithheldRow>[0][]).map(mapWithheldRow)
}

const explore = (extra: Record<string, unknown> = {}) => withheld({ p_metro_id: METRO, p_limit: 50, ...extra })

describe.skipIf(!RUNNABLE)('F093 criteria 4, 5, 9, 10 — from the database to the screen', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f094-owner@test.invalid','x',now(),now(),now())`,
      [OWNER],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,'f094-owner','f094-owner')`, [OWNER])
    await client.query(
      `insert into public.metro_polygons (id, name, slug, csa_code, geography, centroid)
       values ($1,'F094 Metro','f094-metro','99094',
         ST_GeogFromText('POLYGON((-110.1 41.1, -109.9 41.1, -109.9 40.9, -110.1 40.9, -110.1 41.1))'),
         ST_GeogFromText('POINT(-110 41)'))`,
      [METRO],
    )
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography)
       values ($1,$2,'permanent',$3,'f094-river-bank', ST_GeogFromText('POINT(-110 41)'))`,
      [LOCATION, OWNER, PLACE_LABEL],
    )
    for (const [id, name, slug, photo] of [
      [WITH_PHOTO, 'F094 Floaters', 'f094-floaters', PHOTO],
      [NO_PHOTO, 'F094 Quilters', 'f094-quilters', null],
    ] as const) {
      await client.query(
        `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id, photo_url)
         values ($1,'group',$2,$3,'active','listed',$4,$5,$6)`,
        [id, name, slug, OWNER, LOCATION, photo],
      )
    }
    for (const [id, group, age] of [
      [POST_A, WITH_PHOTO, '0 hours'],
      [POST_B, WITH_PHOTO, '1 hour'],
      [POST_C, NO_PHOTO, '0 hours'],
    ] as const) {
      await client.query(
        `insert into public.page_posts (id, group_id, body, starts_at, location_id, lifecycle_state, discoverability, updated_at)
         values ($1,$2,$3,$4,$5,'active','listed', now() - $6::interval)`,
        [id, group, BODY, STARTS_AT, LOCATION, age],
      )
    }
    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    await client.query(`delete from public.page_posts where group_id = any($1)`, [[WITH_PHOTO, NO_PHOTO]])
    await client.query(`delete from public.group_events where group_id = any($1)`, [[WITH_PHOTO, NO_PHOTO]])
    await client.query(`delete from public.groups where id = any($1)`, [[WITH_PHOTO, NO_PHOTO]])
    await client.query(`delete from public.locations where id = $1`, [LOCATION])
    await client.query(`delete from public.metro_polygons where id = $1`, [METRO])
    await client.query(`delete from public.members where id = $1`, [OWNER])
    await client.query(`delete from auth.users where id = $1`, [OWNER])
    client.release()
    await pool.end()
  })

  afterEach(cleanup)

  const cardOf = (result: BrowseResult) => render(<WithheldAnnouncementCard result={result} />).container

  // [guards F093.4]
  it('the card carries exactly five things: photo, name, count with its period, who the details are for, and the call to sign in', async () => {
    const [floaters] = (await explore()).filter((r) => r.name === 'F094 Floaters')
    expect(floaters).toBeDefined()
    const container = cardOf(floaters!)
    const html = container.innerHTML
    const text = container.textContent ?? ''

    // The five things, and only them.
    expect(screen.getByTestId('tile-image').querySelector('img')?.getAttribute('src')).toBe(PHOTO)
    expect(text).toBe(
      `2 posts ${METRO_WEEK_LABEL}F094 FloatersThe details are for members and followers of this Page.Sign in to see what's happening`,
    )
    // Not the body, the time, the place, an excerpt, or the Page's own location.
    for (const secret of [BODY, 'SECRET', 'Thursday', PLACE_LABEL, 'River Bank', STARTS_AT.slice(0, 10), LOCATION]) {
      expect(html, `the card must not carry "${secret}"`).not.toContain(secret)
    }

    // No photo, and a photo a moderator hid, both show the kind's default art.
    cleanup()
    const [quilters] = (await explore()).filter((r) => r.name === 'F094 Quilters')
    expect(cardOf(quilters!).querySelector('[data-testid="default-art"]')).not.toBeNull()
    cleanup()
    await client.query(`update public.groups set photo_hidden_at = now() where id = $1`, [WITH_PHOTO])
    try {
      const [hidden] = (await explore()).filter((r) => r.name === 'F094 Floaters')
      expect(hidden!.photoUrl).toBeNull()
      const c = cardOf(hidden!)
      expect(c.querySelector('[data-testid="default-art"]')).not.toBeNull()
      expect(c.innerHTML).not.toContain(PHOTO)
    } finally {
      await client.query(`update public.groups set photo_hidden_at = null where id = $1`, [WITH_PHOTO])
    }
  })

  // [guards F093.5]
  it('there is one card per Page, carrying that Page\'s count with the period in words, and a Page with none this period keeps its card without a nought', async () => {
    const rows = (await explore()).filter((r) => r.name.startsWith('F094'))
    expect(rows.map((r) => r.name).sort()).toEqual(['F094 Floaters', 'F094 Quilters'])
    const floaters = rows.find((r) => r.name === 'F094 Floaters')!
    expect(floaters.announcementCount).toBe(2)
    render(<WithheldAnnouncementCard result={floaters} />)
    expect(screen.getByTestId('withheld-count').textContent).toBe(`2 posts ${METRO_WEEK_LABEL}`)
    expect(METRO_WEEK_LABEL).toMatch(/[a-z]{3,}/i)
    cleanup()

    // A period nothing falls in: the card is still there, and says no number.
    const quiet = (
      await explore({ p_period_from: '2020-01-01T00:00:00.000Z', p_period_to: '2020-01-08T00:00:00.000Z' })
    ).filter((r) => r.name.startsWith('F094'))
    expect(quiet).toHaveLength(2)
    for (const r of quiet) {
      expect(r.announcementCount).toBe(0)
      const c = cardOf(r)
      expect(c.querySelector('[data-testid="withheld-count"]')?.textContent).toBe('A new post')
      expect(c.textContent).not.toMatch(/\b0\b/)
      cleanup()
    }
  })

  // [guards F093.9]
  it('a visitor who follows the link to ANY of a Page\'s announcements lands on a Page that resolves, its one card marked, with the call to sign in', async () => {
    const [page] = await withheld({ p_group_id: WITH_PHOTO })
    expect(page).toBeDefined()
    expect([...(page!.announcementIds ?? [])].sort()).toEqual([POST_A, POST_B].sort())

    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 0
    })
    try {
      for (const id of [POST_A, POST_B]) {
        window.location.hash = `#announcement-${id}`
        render(<WithheldPagePosts posts={[page!]} />)
        // The section is there, with one card, however many announcements stand behind it.
        expect(screen.getAllByTestId('page-post-withheld')).toHaveLength(1)
        expect(document.getElementById(`announcement-${id}`)).not.toBeNull()
        expect(screen.getByTestId('withheld-cta').textContent).toBe("Sign in to see what's happening")
        // Marked as where they landed.
        await waitFor(() => expect(screen.getByTestId('page-post-withheld').getAttribute('data-highlighted')).toBe('true'))
        cleanup()
      }
    } finally {
      window.location.hash = ''
      vi.unstubAllGlobals()
    }

    // A Page with no announcements renders nothing, which is not a link anyone can follow to it.
    const none = await withheld({ p_group_id: OWNER })
    expect(none).toEqual([])
  })

  // [guards F093.10]
  it('no link on the signed-out Explore card or the Page card goes to a body; every one goes to the Page or to sign in', async () => {
    const rows = (await explore()).filter((r) => r.name.startsWith('F094'))
    const [page] = await withheld({ p_group_id: WITH_PHOTO })
    const hrefs: string[] = []
    for (const r of rows) {
      const c = cardOf(r)
      hrefs.push(...[...c.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''))
      cleanup()
    }
    const pageCard = render(<WithheldPagePosts posts={[page!]} />).container
    hrefs.push(...[...pageCard.querySelectorAll('a')].map((a) => a.getAttribute('href') ?? ''))

    expect(hrefs.length).toBeGreaterThanOrEqual(5)
    for (const href of hrefs) {
      // The Page (and its card anchors) or sign-in. Never a post's own address.
      expect(href, `"${href}" must not be a link to a body`).toMatch(
        /^(\/g\/[a-z0-9]+(#announcement-[0-9a-f-]+)?|\/auth\/login(\?next=.*)?)$/,
      )
      expect(href).not.toMatch(/^\/p\//)
    }
    // The ask comes first: the card's own call is a sign-in link, not the body link.
    expect(screen.getAllByTestId('withheld-cta').every((a) => (a.getAttribute('href') ?? '').startsWith('/auth/login'))).toBe(true)
  })
})
