// F093 criterion 7 — signed-out Explore still carries post-kind rows, in withheld
// form, on the screen. Real rows, read as an anonymous caller with the bundle key,
// through the real loader, rendered by the real surface: the default view (#876,
// everything mixed) and the posts-only view (?view=updates).

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { Pool, type PoolClient } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim: 'a signed-out visitor sees a withheld card for a Page that posted, on Explore and in its posts-only view',
  available: safety.safe && Boolean(DATABASE_URL),
  remedy: `${safety.reason} DATABASE_URL must also be set. Recipe in .env.local.example`,
})

let anon: SupabaseClient
let search = ''
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => anon }))
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined, set: () => {} }) }))
vi.mock('@/lib/metro/waitlist-counts', () => ({ waitingCountByMetro: async () => new Map() }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/explore',
  useSearchParams: () => new URLSearchParams(search),
}))
vi.mock('@/hooks/useScrollRestoration', () => ({ useScrollRestoration: () => {} }))
vi.mock('@/app/explore/actions', async () => {
  const { loadBrowse } = await import('@/app/explore/load')
  return {
    browseFeedAction: (slug: string | null, area: string | null, filters: never) => loadBrowse(slug, area, { withMap: false, filters }),
    browseMapAction: async () => [],
    searchAreasAction: async () => [],
    markLeadSeenAction: async () => {},
  }
})

import { loadBrowse } from '@/app/explore/load'
import { BrowseSurface } from '@/components/browse/BrowseSurface'
import { parseBrowseFilters } from '@/lib/browse/filters'

const OWNER = 'a7000000-0000-4000-8000-000000000937'
const METRO = 'e7000000-0000-4000-8000-000000000937'
const METRO_SLUG = 'f937-metro'
const LOCATION = 'd7000000-0000-4000-8000-000000000937'
const PAGE = 'c7000000-0000-4000-8000-000000000937'
const POST = 'f7000000-0000-4000-8000-000000000937'
const PAGE_NAME = 'F937 Kite Club'
const BODY = 'F937 SECRET BODY kites at the levee Saturday'

let pool: Pool
let client: PoolClient

describe.skipIf(!RUNNABLE)('F093 criterion 7 — signed-out Explore, on the screen', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f937-owner@test.invalid','x',now(),now(),now())`,
      [OWNER],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,'f937-owner','f937-owner')`, [OWNER])
    await client.query(
      `insert into public.metro_polygons (id, name, slug, csa_code, geography, centroid)
       values ($1,'F937 Metro',$2,'99937',
         ST_GeogFromText('POLYGON((-111.1 42.1, -110.9 42.1, -110.9 41.9, -111.1 41.9, -111.1 42.1))'),
         ST_GeogFromText('POINT(-111 42)'))`,
      [METRO, METRO_SLUG],
    )
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography)
       values ($1,$2,'permanent','F937 Levee','f937-levee', ST_GeogFromText('POINT(-111 42)'))`,
      [LOCATION, OWNER],
    )
    await client.query(
      `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'group',$2,'f937-kite-club','active','listed',$3,$4)`,
      [PAGE, PAGE_NAME, OWNER, LOCATION],
    )
    // Two days old: not in the signed-out "today" row, so only the Explore list can carry it.
    await client.query(
      `insert into public.page_posts (id, group_id, body, starts_at, location_id, lifecycle_state, discoverability, created_at, updated_at)
       values ($1,$2,$3, now() + interval '4 days', $4, 'active', 'listed', now() - interval '2 days', now() - interval '2 days')`,
      [POST, PAGE, BODY, LOCATION],
    )
    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
    await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
    await client.query(`delete from public.groups where id = $1`, [PAGE])
    await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
    await client.query(`delete from public.locations where id = $1`, [LOCATION])
    await client.query(`delete from public.metro_polygons where id = $1`, [METRO])
    await client.query(`delete from public.members where id = $1`, [OWNER])
    await client.query(`delete from auth.users where id = $1`, [OWNER])
    client.release()
    await pool.end()
  })

  afterEach(() => {
    cleanup()
    search = ''
  })

  // As the page does it: the URL's filters go to the loader, the snapshot to the surface.
  async function explore(params: string) {
    search = params
    const filters = parseBrowseFilters(new URLSearchParams(params))
    const snapshot = await loadBrowse(METRO_SLUG, null, { withMap: false, filters })
    expect(snapshot.signedIn).toBe(false)
    expect(snapshot.failed).toBe(false)
    render(<BrowseSurface initial={snapshot} />)
  }

  async function expectWithheldCard() {
    // Reachable: in the first look above the list, or in the list itself.
    await waitFor(() => expect(screen.getAllByTestId('withheld-card').length).toBeGreaterThan(0))
    const card = screen.getAllByTestId('withheld-card').find((c) => c.textContent?.includes(PAGE_NAME))
    expect(card, `a withheld card for ${PAGE_NAME}`).toBeDefined()
    expect(card!.querySelector('[data-testid="withheld-cta"]')).not.toBeNull()
    expect(document.body.innerHTML).not.toContain(BODY)
  }

  // [guards F093.7]
  it('the default view and the posts-only view each show the Page that posted as a withheld card, never its body', async () => {
    await explore('')
    await expectWithheldCard()
    cleanup()

    await explore('view=updates')
    await expectWithheldCard()
  })
})
