import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// Don, 2026-10-31 (B, #1126): a shared post's link preview is fetched signed out and shows the headline, the lead
// line KIND · WHEN · WHERE and the photo; the body stays for members (F093). shared_post_preview is that read: its
// return type has no body, and it answers only for a post the Page shows the public.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'signed out, a shared post reads as its headline, lead-line fields and photo, never its body',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a4000000-0000-4000-8000-000000001126'
const PAGE = 'c4000000-0000-4000-8000-000000001126'
const DRAFT_PAGE = 'c4000000-0000-4000-8000-000000011126'
const PLACE = 'd4000000-0000-4000-8000-000000001126'
const BODY = 'u1126 SECRET BODY bring a chair'

let pool: Pool
let client: PoolClient
const ids: Record<string, string> = {}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','u1126-owner@test.invalid','x',now(),now(),now())`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'u1126-owner','u1126-owner')`, [OWNER])
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','Midtown','u1126-midtown', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [PLACE, OWNER],
  )
  for (const [id, state, slug] of [[PAGE, 'active', 'u1126-page'], [DRAFT_PAGE, 'draft', 'u1126-draft']]) {
    await client.query(
      `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
       values ($1,'business','U1126 Bakery',$2,$3,'listed',$4,$5)`,
      [id, slug, state, OWNER, PLACE],
    )
  }
  const add = async (key: string, group: string, cols: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      group_id: group,
      body: BODY,
      kind: 'event',
      headline: 'Pizza night',
      starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
      location_id: PLACE,
      photo_url: 'https://cdn.example/u1126.webp',
      lifecycle_state: 'active',
      discoverability: 'listed',
      ...cols,
    }
    const keys = Object.keys(row)
    const { rows } = await client.query<{ id: string }>(
      `insert into public.page_posts (${keys.join(',')}) values (${keys.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      Object.values(row),
    )
    ids[key] = rows[0]!.id
  }
  await add('shown', PAGE)
  await add('photo hidden', PAGE, { photo_hidden_at: new Date().toISOString() })
  await add('draft', PAGE, { lifecycle_state: 'draft' })
  await add('unlisted', PAGE, { discoverability: 'unlisted' })
  await add('hidden', PAGE, { discoverability: 'unlisted', hidden_at: new Date().toISOString(), hidden_prior_discoverability: 'listed' })
  await add('removed', PAGE, { removed_at: new Date().toISOString() })
  await add('on a draft Page', DRAFT_PAGE)
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = any($1)`, [[PAGE, DRAFT_PAGE]])
  await client.query(`delete from public.group_events where group_id = any($1)`, [[PAGE, DRAFT_PAGE]])
  await client.query(`delete from public.groups where id = any($1)`, [[PAGE, DRAFT_PAGE]])
  await client.query(`delete from public.locations where id = $1`, [PLACE])
  await client.query(`delete from public.members where id = $1`, [OWNER])
  await client.query(`delete from auth.users where id = $1`, [OWNER])
  client.release()
  await pool.end()
})

async function asAnon(group: string, post: string) {
  await client.query('begin')
  try {
    await client.query('set local role anon')
    const { rows } = await client.query(`select * from public.shared_post_preview($1, $2)`, [group, post])
    return rows as Record<string, unknown>[]
  } finally {
    await client.query('rollback')
  }
}

describe.skipIf(!RUNNABLE)('#1126 — a shared post previews signed out without its body', () => {
  it('signed out: the headline, lead-line fields and photo of a post the Page shows, and no body', async () => {
    const [row, ...rest] = await asAnon(PAGE, ids.shown!)
    expect(rest).toHaveLength(0)
    expect(row).toMatchObject({ id: ids.shown, kind: 'event', headline: 'Pizza night', location_label: 'Midtown', photo_url: 'https://cdn.example/u1126.webp' })
    expect(Object.keys(row!)).not.toContain('body')
    expect(JSON.stringify(row)).not.toContain('SECRET')
  })

  it('a hidden photo is not previewed', async () => {
    const [row] = await asAnon(PAGE, ids['photo hidden']!)
    expect(row?.photo_url).toBeNull()
  })

  it.each(['draft', 'unlisted', 'hidden', 'removed', 'on a draft Page'])('nothing for a post that is %s', async (key) => {
    expect(await asAnon(key === 'on a draft Page' ? DRAFT_PAGE : PAGE, ids[key]!)).toEqual([])
  })

  it('nothing for a post asked for under another Page', async () => {
    expect(await asAnon(DRAFT_PAGE, ids.shown!)).toEqual([])
  })
})
