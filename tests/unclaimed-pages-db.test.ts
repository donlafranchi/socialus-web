import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupUnclaimedRemove, groupUnclaimedClaim, groupUnclaimedRestore, DAILY_LIMIT_PER_DEVICE } from '@/actions/group'
import { resolveAnonymousActionContext, resolveActionContext } from '@/lib/action-context'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'

// #353 — a removal request hides an unclaimed Page at once, for every member
// and visitor, before anyone reviews it; a device past its daily limit is
// refused; only an operator restores; the source log and the requests are
// readable by no member or visitor. Run through the handlers, not the seed.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a removal request hides an unclaimed Page at once and only an operator restores it',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a3000000-0000-4000-8000-000000000353'
const OPERATOR = 'b3000000-0000-4000-8000-000000000353'
const UNCLAIMED = 'c3000000-0000-4000-8000-000000000353'
const OWNED = 'd3000000-0000-4000-8000-000000000353'
const DEVICE = 'a'.repeat(64)
const OTHER_DEVICE = 'b'.repeat(64)
const PHOTO_DEVICE = 'c'.repeat(64)

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub, role: 'authenticated' }),
      ])
    }
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

const visible = async (sub: string | null) =>
  (await as<{ id: string }>(sub, `select id from public.groups where id = $1`, [UNCLAIMED])).length === 1

const remove = (device = DEVICE) =>
  groupUnclaimedRemove(resolveAnonymousActionContext(), {
    groupId: UNCLAIMED,
    contact: 'owner@example.com',
    confirmed: true,
    deviceHash: device,
  })

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[MEMBER, 'u353-member'], [OPERATOR, 'u353-operator']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, unclaimed_at)
     values ($1,'interest','U353 Bakery','u353-bakery','Bread.','active','listed',$2, now()),
            ($3,'interest','U353 Owned','u353-owned','Mine.','active','listed',$4, null)`,
    [UNCLAIMED, SYSTEM_MEMBER_ID, OWNED, MEMBER],
  )
  await client.query(
    `insert into public.page_sources (group_id, field, url, captured_on, captured_by)
     values ($1,'description','https://example.com/about','2026-10-04','test')`,
    [UNCLAIMED],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  for (const t of ['page_removal_requests', 'page_claim_requests', 'group_events']) {
    await client.query(`delete from public.${t} where group_id = any($1)`, [[UNCLAIMED, OWNED]])
  }
  await client.query(`delete from public.groups where id = any($1)`, [[UNCLAIMED, OWNED]])
  await client.query(`delete from public.members where id = any($1)`, [[MEMBER, OPERATOR]])
  await client.query(`delete from auth.users where id = any($1)`, [[MEMBER, OPERATOR]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#353 unclaimed Pages', () => {
  it('nobody but the server reads the source log or the requests', async () => {
    for (const sub of [null, MEMBER]) {
      for (const t of ['page_sources', 'page_removal_requests', 'page_claim_requests']) {
        await expect(as(sub, `select 1 from public.${t}`)).rejects.toThrow(/permission denied/)
      }
    }
  })

  it('the source log is append-only', async () => {
    await expect(client.query(`delete from public.page_sources where group_id = $1`, [UNCLAIMED])).rejects.toThrow(
      /append-only/,
    )
  })

  it('a claim request is stored and changes nothing visible', async () => {
    await groupUnclaimedClaim(resolveAnonymousActionContext(), {
      groupId: UNCLAIMED,
      name: 'Pat',
      contact: 'pat@example.com',
      deviceHash: OTHER_DEVICE,
    })
    expect(await visible(null)).toBe(true)
  })

  it("claim and remove refuse a member's own Page", async () => {
    await expect(
      groupUnclaimedRemove(resolveAnonymousActionContext(), {
        groupId: OWNED,
        contact: 'x@example.com',
        confirmed: true,
        deviceHash: OTHER_DEVICE,
      }),
    ).rejects.toThrow(/no unclaimed Page/)
  })

  it('a removal request hides the Page at once, for visitors and members, and records it', async () => {
    expect(await visible(null)).toBe(true)
    expect(await visible(MEMBER)).toBe(true)
    await remove()
    expect(await visible(null)).toBe(false)
    expect(await visible(MEMBER)).toBe(false)
    const ev = await client.query(
      `select acting_member_id, payload from public.group_events where group_id = $1 and event_kind = 'group.unclaimed_hidden'`,
      [UNCLAIMED],
    )
    expect(ev.rows).toHaveLength(1)
    expect(ev.rows[0].acting_member_id).toBe(SYSTEM_MEMBER_ID)
  })

  it('a device past its daily limit is refused', async () => {
    for (let i = 1; i < DAILY_LIMIT_PER_DEVICE; i++) await remove()
    await expect(remove()).rejects.toThrow(/daily limit/)
  })

  it('a photo removal hides just the photo, at once, and an operator restores it', async () => {
    const photoHidden = async () =>
      (await client.query(`select photo_hidden_at from public.groups where id = $1`, [UNCLAIMED])).rows[0].photo_hidden_at
    expect(await photoHidden()).toBeNull()
    await groupUnclaimedRemove(resolveAnonymousActionContext(), {
      groupId: UNCLAIMED,
      scope: 'photo',
      contact: 'owner@example.com',
      confirmed: true,
      deviceHash: PHOTO_DEVICE,
    })
    expect(await photoHidden()).not.toBeNull()
    const prev = process.env.OPERATOR_MEMBER_ID
    process.env.OPERATOR_MEMBER_ID = OPERATOR
    try {
      await groupUnclaimedRestore(resolveActionContext({ actingMemberId: OPERATOR }), { groupId: UNCLAIMED, scope: 'photo' })
      expect(await photoHidden()).toBeNull()
    } finally {
      if (prev === undefined) delete process.env.OPERATOR_MEMBER_ID
      else process.env.OPERATOR_MEMBER_ID = prev
    }
  })

  it('only an operator restores', async () => {
    const prev = process.env.OPERATOR_MEMBER_ID
    process.env.OPERATOR_MEMBER_ID = OPERATOR
    try {
      await expect(
        groupUnclaimedRestore(resolveActionContext({ actingMemberId: MEMBER }), { groupId: UNCLAIMED }),
      ).rejects.toThrow(/not permitted/)
      expect(await visible(null)).toBe(false)
      const res = await groupUnclaimedRestore(resolveActionContext({ actingMemberId: OPERATOR }), { groupId: UNCLAIMED })
      expect(res.restored).toBe(true)
      expect(await visible(null)).toBe(true)
    } finally {
      if (prev === undefined) delete process.env.OPERATOR_MEMBER_ID
      else process.env.OPERATOR_MEMBER_ID = prev
    }
  })
})
