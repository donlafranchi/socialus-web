import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupFollow, groupUnfollow, groupPostCreate } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// #267 — a Page's owner tapping "Following" on their own Page ran
// group.unfollow, which soft-left their membership row: the row that holds
// their authority. Reproduced here against the real handlers and database.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "unfollowing their own Page never ends an owner's ownership",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a5000000-0000-4000-8000-000000000267'
const STEWARD = 'b5000000-0000-4000-8000-000000000267'
const SHOP = 'c5000000-0000-4000-8000-000000000267'
const CLUB = 'd5000000-0000-4000-8000-000000000267'

let pool: Pool
let client: PoolClient

const ctx = (actingMemberId: string): ActionContext => ({
  actingMemberId,
  viaDelegationId: null,
  traceId: 'b267',
  db: {} as never,
  now: () => new Date(),
})

const row = async (group: string, member: string) =>
  (
    await client.query<{ role: string; relationship: string; left_at: Date | null }>(
      `select role, relationship, left_at from public.group_memberships where group_id = $1 and member_id = $2`,
      [group, member],
    )
  ).rows[0]

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b267-owner'], [STEWARD, 'b267-steward']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id) values
       ($1,'business','B267 Bakery','b267-bakery','active','listed',$3),
       ($2,'interest','B267 Club','b267-club','active','listed',$4)`,
    [SHOP, CLUB, OWNER, STEWARD],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
       ($1,$2,'owner','explicit','member'), ($3,$4,'steward','explicit','member')`,
    [SHOP, OWNER, CLUB, STEWARD],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_posts where group_id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.group_events where group_id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.group_memberships where group_id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.groups where id = any($1)`, [[SHOP, CLUB]])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, STEWARD]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, STEWARD]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('an owner and their own Page’s follow control', () => {
  it.each([
    ['a business owner', OWNER, SHOP],
    ['a club steward', STEWARD, CLUB],
  ])('%s who unfollows their own Page still runs it', async (_who, member, group) => {
    await groupUnfollow(ctx(member), { groupId: group })
    const r = await row(group, member)
    expect(r.left_at).toBeNull()
    await expect(groupPostCreate(ctx(member), { groupId: group, body: 'Still here.' })).resolves.toMatchObject({
      groupId: group,
    })
  })

  it('following their own Page leaves their membership as it was', async () => {
    await groupFollow(ctx(OWNER), { groupId: SHOP })
    expect(await row(SHOP, OWNER)).toMatchObject({ role: 'owner', relationship: 'member', left_at: null })
  })
})
