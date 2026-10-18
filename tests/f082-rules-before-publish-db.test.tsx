// F082 criteria 1, 3, 8 and 9 — the rules before every Page, checked on the real thing:
// the real group.activate against the database, the real schema and grants, the real
// publish step and card components. Each check claims its whole criterion.

import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { Pool, type PoolClient } from 'pg'
import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, refresh: () => {}, back: () => {}, prefetch: () => {} }),
  usePathname: () => '/x',
  useSearchParams: () => new URLSearchParams(),
}))

import { groupActivate } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'
import { DRAFT_NAME_PLACEHOLDER } from '@/actions/group/constants'
import { CREATOR_RULES, RULES_VERSION } from '@/lib/creator-rules'
import { BeforeYouPublish } from '@/components/create/BeforeYouPublish'
import { BrowseResultCard } from '@/components/browse/BrowseResultCard'
import { getBrowseFeed } from '@/lib/feed/browse-feed'
import RulesPage from '@/app/rules/page'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim: 'every new Page asks for the rules, publishing needs its four things but no photo, and no agreement ever reaches another member',
  available: safety.safe && Boolean(DATABASE_URL),
  remedy: `${safety.reason} DATABASE_URL must also be set. Recipe in .env.local.example`,
})

const ROOT = resolve(__dirname, '..')
const OWNER = 'a8000000-0000-4000-8000-000000000082'
const METRO = 'e8000000-0000-4000-8000-000000000082'
const LOCATION = 'd8000000-0000-4000-8000-000000000082'
const FIRST = 'c8000000-0000-4000-8000-000000000001'
const SECOND = 'c8000000-0000-4000-8000-000000000002'
const NO_PHOTO = 'c8000000-0000-4000-8000-000000000003'
const NO_NAME = 'c8000000-0000-4000-8000-000000000004'
const NO_PLACE = 'c8000000-0000-4000-8000-000000000005'
const NO_DESCRIPTION = 'c8000000-0000-4000-8000-000000000006'
const NO_TAG = 'c8000000-0000-4000-8000-000000000007'
const PAGES = [FIRST, SECOND, NO_PHOTO, NO_NAME, NO_PLACE, NO_DESCRIPTION, NO_TAG]
const TAG = 'f082 kites'

let pool: Pool
let client: PoolClient

const ctx = (): ActionContext => ({ actingMemberId: OWNER, viaDelegationId: null, traceId: 'f082', db: {} as never, now: () => new Date() })
const state = async (id: string) => (await client.query(`select lifecycle_state from public.groups where id = $1`, [id])).rows[0].lifecycle_state
const agreements = async (id: string) =>
  (await client.query(`select member_id, rules_version from public.creator_rules_agreements where group_id = $1`, [id])).rows

function srcFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return srcFiles(p)
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : []
  })
}

describe.skipIf(!RUNNABLE)('F082 — the rules before every Page', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f082-owner@test.invalid','x',now(),now(),now())`,
      [OWNER],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,'f082-owner','f082-owner')`, [OWNER])
    await client.query(
      `insert into public.metro_polygons (id, name, slug, csa_code, geography, centroid)
       values ($1,'F082 Metro','f082-metro','99082',
         ST_GeogFromText('POLYGON((-112.1 43.1, -111.9 43.1, -111.9 42.9, -112.1 42.9, -112.1 43.1))'),
         ST_GeogFromText('POINT(-112 43)'))`,
      [METRO],
    )
    await client.query(
      `insert into public.locations (id, member_id, kind, label, slug, geography)
       values ($1,$2,'permanent','F082 Field','f082-field', ST_GeogFromText('POINT(-112 43)'))`,
      [LOCATION, OWNER],
    )
    const drafts: [string, string, string | null, string][] = [
      [FIRST, 'F082 First Kite Club', LOCATION, 'Kites on Sundays.'],
      [SECOND, 'F082 Second Kite Club', LOCATION, 'Kites on Mondays.'],
      [NO_PHOTO, 'F082 Photoless Kite Club', LOCATION, 'Kites, no photo.'],
      [NO_NAME, DRAFT_NAME_PLACEHOLDER, LOCATION, 'Kites, no name.'],
      [NO_PLACE, 'F082 Placeless Kite Club', null, 'Kites, nowhere.'],
      [NO_DESCRIPTION, 'F082 Wordless Kite Club', LOCATION, ''],
      [NO_TAG, 'F082 Tagless Kite Club', LOCATION, 'Kites, no tag.'],
    ]
    for (const [id, name, loc, description] of drafts) {
      await client.query(
        `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
         values ($1,'group',$2,$3,$4,'draft','listed',$5,$6)`,
        [id, name, `f082-${id.slice(-4)}`, description, OWNER, loc],
      )
    }
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    await client.query(`delete from public.creator_rules_agreements where group_id = any($1)`, [PAGES])
    await client.query(`delete from public.page_tags where group_id = any($1)`, [PAGES])
    await client.query(`delete from public.group_events where group_id = any($1)`, [PAGES])
    await client.query(`delete from public.groups where id = any($1)`, [PAGES])
    await client.query(`delete from public.tags where normalized = 'f082-kites' or created_by = $1`, [OWNER])
    await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
    await client.query(`delete from public.locations where id = $1`, [LOCATION])
    await client.query(`delete from public.metro_polygons where id = $1`, [METRO])
    await client.query(`delete from public.members where id = $1`, [OWNER])
    await client.query(`delete from auth.users where id = $1`, [OWNER])
    client.release()
    await pool.end()
  })

  afterEach(cleanup)

  // [guards F082.1]
  it('every new Page asks for the agreement again, the publish step always starts unagreed, and creator status is the record, never a role, account type or mode column', async () => {
    // The first Page: agreed, published, recorded for that Page.
    await groupActivate(ctx(), { groupId: FIRST, tags: [TAG], rulesVersion: RULES_VERSION })
    expect(await state(FIRST)).toBe('active')
    expect(await agreements(FIRST)).toEqual([{ member_id: OWNER, rules_version: RULES_VERSION }])

    // The second Page: the earlier agreement does not carry over.
    await expect(groupActivate(ctx(), { groupId: SECOND, tags: [TAG] })).rejects.toThrow(/agreement to the current rules/)
    expect(await state(SECOND)).toBe('draft')
    expect(await agreements(SECOND)).toEqual([])
    await groupActivate(ctx(), { groupId: SECOND, tags: [TAG], rulesVersion: RULES_VERSION })
    expect(await agreements(SECOND)).toEqual([{ member_id: OWNER, rules_version: RULES_VERSION }])

    // The publish step asks every time: nothing pre-ticks it, and Publish waits for the tick.
    const onPublish = async () => {}
    render(<BeforeYouPublish editPath="/x" hasName hasPlace hasDescription hasTags hasPhoto={false} onPublish={onPublish} />)
    expect(screen.getByRole('checkbox', { name: /i agree/i })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree/i }))
    expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled()

    // No stored role, account type or mode flag on a member or a Page.
    const columns = await client.query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name in ('members', 'groups')
          and column_name ~* '(role|account_?type|creator|maker|seller|producer|vendor|tier|badge|verified|_mode_enabled|^mode$|^is_business)'`,
    )
    expect(columns.rows, 'a creator role, type or mode column').toEqual([])
  })

  // [guards F082.3]
  it('no agreement reaches another member: no client grant or policy, nothing in the database projects it, and the app only writes it', async () => {
    const table = (await client.query(`select relrowsecurity from pg_class where oid = 'public.creator_rules_agreements'::regclass`)).rows[0]
    expect(table.relrowsecurity).toBe(true)
    const policies = await client.query(`select polname from pg_policy where polrelid = 'public.creator_rules_agreements'::regclass`)
    expect(policies.rows, 'a policy on the agreements').toEqual([])
    const grants = await client.query(
      `select grantee, privilege_type from information_schema.role_table_grants
        where table_schema = 'public' and table_name = 'creator_rules_agreements' and grantee in ('anon', 'authenticated', 'PUBLIC')`,
    )
    expect(grants.rows, 'a client grant on the agreements').toEqual([])
    for (const role of ['anon', 'authenticated']) {
      await client.query('begin')
      try {
        await client.query(`set local role ${role}`)
        await expect(client.query(`select * from public.creator_rules_agreements`)).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('rollback')
      }
    }
    // No view or function carries it to a reader.
    const projections = await client.query(
      `select viewname as name from pg_views where schemaname = 'public' and definition ilike '%creator_rules_agreements%'
       union all
       select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosrc ilike '%creator_rules_agreements%'`,
    )
    expect(projections.rows, 'a view or function reading the agreements').toEqual([])

    // In the app: only the publish touches the table, and only to insert.
    const files = srcFiles(join(ROOT, 'src'))
    const touching = files.filter((f) => readFileSync(f, 'utf8').includes('creator_rules_agreements')).map((f) => relative(ROOT, f))
    expect(touching).toEqual(['src/actions/group/activate.ts'])
    const activate = readFileSync(join(ROOT, 'src/actions/group/activate.ts'), 'utf8')
    expect(activate).not.toMatch(/(select|from|join)[\s\S]{0,80}public\.creator_rules_agreements/i)
    expect(activate).toMatch(/insert into public\.creator_rules_agreements/)
    // The rules text itself is the only thing a peer surface may show; no agreement or version reaches one.
    const peerSurfaces = /^src\/(components\/(browse|cards|group|feed|member|map)|app\/(g|p|m|explore|feed))\//
    const versionReaders = files
      .map((f) => relative(ROOT, f))
      .filter((f) => peerSurfaces.test(f) && /RULES_VERSION|rules_version|rulesAgreed|agreedAt/.test(readFileSync(join(ROOT, f), 'utf8')))
    expect(versionReaders, 'a peer surface reading an agreement').toEqual([])
  })

  // [guards F082.8]
  it('publishing needs a name, a place, a description, the agreement and a tag; a Page with no photo publishes and shows its kind’s default art', async () => {
    const refused: [string, Parameters<typeof groupActivate>[1], RegExp][] = [
      [NO_NAME, { groupId: NO_NAME, tags: [TAG], rulesVersion: RULES_VERSION }, /requires name/],
      [NO_PLACE, { groupId: NO_PLACE, tags: [TAG], rulesVersion: RULES_VERSION }, /requires where it is/],
      [NO_DESCRIPTION, { groupId: NO_DESCRIPTION, tags: [TAG], rulesVersion: RULES_VERSION }, /requires a description/],
      [NO_TAG, { groupId: NO_TAG, rulesVersion: RULES_VERSION }, /at least one tag/],
      [NO_PHOTO, { groupId: NO_PHOTO, tags: [TAG] }, /agreement to the current rules/],
    ]
    for (const [id, input, reason] of refused) {
      await expect(groupActivate(ctx(), input), id).rejects.toThrow(reason)
      expect(await state(id)).toBe('draft')
    }

    // The same draft, agreed: no photo, and it publishes.
    expect((await client.query(`select photo_url from public.groups where id = $1`, [NO_PHOTO])).rows[0].photo_url).toBeNull()
    await groupActivate(ctx(), { groupId: NO_PHOTO, tags: [TAG], rulesVersion: RULES_VERSION })
    expect(await state(NO_PHOTO)).toBe('active')

    // Read back as anyone reads Explore: its card shows the group kind's default art.
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const rows = await getBrowseFeed(anon, { scope: { metroId: METRO }, resultKinds: ['page'], limit: 50 })
    const row = rows.find((r) => r.resultId === NO_PHOTO)
    expect(row, 'the photoless Page is on Explore').toBeDefined()
    const { container } = render(<BrowseResultCard result={row!} />)
    expect(container.querySelector('[data-testid="default-art"]')?.getAttribute('data-kind')).toBe('group')
    cleanup()

    // The publish step says the photo is optional and lets a photoless Page through.
    render(<BeforeYouPublish editPath="/x" hasName hasPlace hasDescription hasTags hasPhoto={false} onPublish={async () => {}} />)
    expect(screen.getByTestId('publish-item-photo').textContent).toMatch(/optional/i)
    fireEvent.click(screen.getByRole('checkbox', { name: /i agree/i }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Publish' })).toBeEnabled())
  })

  // [guards F082.9]
  it('one of the rules is the photo rule, with its reason, on the publish step and on the rules page', () => {
    const plain = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
    // The scenario's draft wording (F082 criterion 9).
    const RULE = 'No pictures of children.'
    const REASON = "Please don't post a photo that shows a child. We can't check every photo, so we count on you."
    const photoRule = CREATOR_RULES.find((r) => plain(r.rule) === RULE)
    expect(photoRule, 'the photo rule').toBeDefined()
    expect(plain(photoRule!.reason)).toBe(REASON)

    render(<BeforeYouPublish editPath="/x" hasName={false} hasPlace={false} hasDescription={false} hasTags={false} hasPhoto={false} onPublish={async () => {}} />)
    const step = plain(screen.getByTestId('creator-rules').textContent ?? '')
    expect(step).toContain(RULE)
    expect(step).toContain(REASON)
    cleanup()

    const { container } = render(<RulesPage />)
    const page = plain(container.textContent ?? '')
    expect(page).toContain(RULE)
    expect(page).toContain(REASON)
  })
})
