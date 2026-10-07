import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupUpdate, groupUpdateDraft } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// Bug #410 — a business Page keeps its name and description on two rows,
// groups (read by Explore and the feed) and group_businesses (read by the
// Page). Renaming a published Page wrote only the first, so the Page kept its
// old name. Whichever row is written, both must say the same thing.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a renamed business Page shows its new name on the Page as well as on Explore',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a5000000-0000-4000-8000-000000000410'
const LIVE = 'c5000000-0000-4000-8000-000000000410'
const DRAFT = 'd5000000-0000-4000-8000-000000000410'

let pool: Pool
let client: PoolClient

const ctx = (): ActionContext => ({
  actingMemberId: OWNER,
  viaDelegationId: null,
  traceId: 'b410',
  db: {} as never,
  now: () => new Date(),
})

const both = async (id: string) =>
  (
    await client.query<{ name: string; description: string | null; display_name: string; public_description: string | null }>(
      `select g.name, g.description, b.display_name, b.public_description
         from public.groups g join public.group_businesses b on b.group_id = g.id where g.id = $1`,
      [id],
    )
  ).rows[0]

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b410@test.invalid','x',now(),now(),now())`,
    [OWNER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b410-owner','b410-owner')`, [OWNER])
  await client.query(
    `insert into public.groups (id, kind, name, description, slug, lifecycle_state, discoverability, founder_member_id) values
       ($1,'business','Hella Awesome Widgets','Widgets.','b410-widgets','active','listed',$3),
       ($2,'business','untitled-draft','','b410-draft','draft','listed',$3)`,
    [LIVE, DRAFT, OWNER],
  )
  await client.query(
    `insert into public.group_businesses (group_id, display_name, public_description) values
       ($1,'Hella Awesome Widgets','Widgets.'), ($2,'untitled-draft','')`,
    [LIVE, DRAFT],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
       ($1,$3,'owner','explicit','member'), ($2,$3,'owner','explicit','member')`,
    [LIVE, DRAFT, OWNER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.group_events where group_id = any($1)`, [[LIVE, DRAFT]])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [[LIVE, DRAFT]])
  await client.query(`delete from public.group_businesses where group_id = any($1)`, [[LIVE, DRAFT]])
  await client.query(`delete from public.groups where id = any($1)`, [[LIVE, DRAFT]])
  await client.query(`delete from public.members where id = $1`, [OWNER])
  await client.query(`delete from auth.users where id = $1`, [OWNER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('bug #410 — one name for a business Page', () => {
  it('renaming a published Page renames it everywhere', async () => {
    await groupUpdate(ctx(), { groupId: LIVE, name: 'Lil Mouse House', description: 'Mouse Motels.' })
    expect(await both(LIVE)).toEqual({
      name: 'Lil Mouse House',
      description: 'Mouse Motels.',
      display_name: 'Lil Mouse House',
      public_description: 'Mouse Motels.',
    })
  })

  it('naming a draft through the business row names the Page too', async () => {
    await groupUpdateDraft(ctx(), { groupId: DRAFT, businessDisplayName: 'Oak Park Sourdough', businessPublicDescription: 'Bread.' })
    expect(await both(DRAFT)).toEqual({
      name: 'Oak Park Sourdough',
      description: 'Bread.',
      display_name: 'Oak Park Sourdough',
      public_description: 'Bread.',
    })
  })
})
