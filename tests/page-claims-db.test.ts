import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupClaimStart, groupClaimVerify, groupClaimProof, groupClaimDecide, CLAIM_REFUSED } from '@/actions/group'
import { resolveActionContext } from '@/lib/action-context'
import { SYSTEM_MEMBER_ID } from '@/lib/system-member'
import { CLAIM_LIMITS } from '@/lib/claims/verify'
import { loadUnclaimed } from '@/lib/unclaimed/load'
import type { PlannedPage } from '@/lib/unclaimed/plan'
import { saturatedTowns, TOWN_SATURATION } from '@/lib/unclaimed/saturation'

// #987 — a claim completes self-serve: the right code makes the claimant the owner at once, samples come off,
// a second claimant is refused, a Page with no domain or phone goes to an operator, and nobody else reads a claim.
// Through the handlers, not the seed.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'an unclaimed Page is claimed self-serve and only its claimant reads the claim',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const ROSA = 'a9870000-0000-4000-8000-000000000987'
const SECOND = 'b9870000-0000-4000-8000-000000000987'
const OPERATOR = 'c9870000-0000-4000-8000-000000000987'
const BAKERY = 'd9870000-0000-4000-8000-000000000987'
const DARK = 'e9870000-0000-4000-8000-000000000987'
const OTHER = 'f9870000-0000-4000-8000-000000000987'
const PEOPLE = [ROSA, SECOND, OPERATOR]
const PAGES = [BAKERY, DARK, OTHER]

let pool: Pool
let client: PoolClient
const as = (m: string) => resolveActionContext({ actingMemberId: m })

async function read<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

const one = async <T>(sql: string, params: unknown[]) => (await client.query(sql, params)).rows[0] as T
const events = async (groupId: string) =>
  (await client.query(`select event_kind from public.page_claim_events where group_id = $1 order by created_at, event_kind`, [groupId])).rows.map((r) => r.event_kind)

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[ROSA, 'u987-rosa'], [SECOND, 'u987-second'], [OPERATOR, 'u987-operator']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, unclaimed_at, public_info_url, contact_phone)
     values ($1,'business','U987 Bakery','u987-bakery','Bread.','active','listed',$4, now(), 'https://www.u987bakery.com', '+19165550100'),
            ($2,'business','U987 Dark','u987-dark','Shop.','active','listed',$4, now(), null, '+19165550101'),
            ($3,'business','U987 Other','u987-other','Shop.','active','listed',$4, now(), 'https://u987other.com', null)`,
    [BAKERY, DARK, OTHER, SYSTEM_MEMBER_ID],
  )
  for (const kind of ['event', 'deal', 'last_minute']) {
    await client.query(
      `insert into public.page_posts (group_id, body, lifecycle_state, discoverability, sample_kind) values ($1, 'Sample: hello', 'active', 'listed', $2)`,
      [BAKERY, kind],
    )
  }
  await client.query(
    `insert into public.items (member_id, kind, group_id, title, state, sample_source_url) values ($1, 'product', $2, 'Sample loaf', 'published', 'https://www.u987bakery.com/loaf')`,
    [SYSTEM_MEMBER_ID, BAKERY],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.page_claims where group_id = any($1)`, [PAGES])
  const town = (await client.query(`select id from public.groups where slug like 'u987-town-%'`)).rows.map((r) => r.id)
  for (const t of ['page_posts', 'items', 'group_events', 'group_memberships']) await client.query(`delete from public.${t} where group_id = any($1)`, [[...PAGES, ...town]])
  await client.query(`delete from public.groups where id = any($1) or slug like 'u987-town-%'`, [PAGES])
  await client.query(`delete from public.locations where slug like 'u987-town-%'`)
  await client.query(`delete from public.members where id = any($1)`, [PEOPLE])
  await client.query(`delete from auth.users where id = any($1)`, [PEOPLE])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#987 self-serve Page claims', () => {
  it('an email code goes only to an address at the business’s own domain', async () => {
    await expect(groupClaimStart(as(ROSA), { groupId: BAKERY, method: 'email', email: 'rosa@gmail.com' })).rejects.toThrow(/must be at u987bakery\.com/)
    await expect(groupClaimStart(as(ROSA), { groupId: BAKERY, method: 'phone' })).rejects.toThrow(/no phone/) // CLAIM_BY_PHONE is off
  })

  it('a wrong code is counted and logged; the right one makes the claimant the owner at once', async () => {
    const started = await groupClaimStart(as(ROSA), { groupId: BAKERY, method: 'email', email: 'Rosa@u987bakery.com' })
    expect(started.target).toBe('rosa@u987bakery.com')
    const wrong = started.code === '000000' ? '111111' : '000000'
    await expect(groupClaimVerify(as(ROSA), { claimId: started.claimId, code: wrong })).rejects.toThrow(CLAIM_REFUSED.wrongCode)
    await expect(groupClaimVerify(as(SECOND), { claimId: started.claimId, code: started.code })).rejects.toThrow(/no claim/)

    await groupClaimVerify(as(ROSA), { claimId: started.claimId, code: started.code })

    const g = await one<{ unclaimed_at: Date | null; claimed_at: Date | null; founder_member_id: string }>(
      `select unclaimed_at, claimed_at, founder_member_id from public.groups where id = $1`, [BAKERY])
    expect(g.unclaimed_at).toBeNull()
    expect(g.claimed_at).not.toBeNull()
    expect(g.founder_member_id).toBe(ROSA)
    expect(await one(`select role, source, left_at from public.group_memberships where group_id = $1 and member_id = $2`, [BAKERY, ROSA]))
      .toEqual({ role: 'owner', source: 'explicit', left_at: null })
    expect(await events(BAKERY)).toEqual(['claim.started', 'claim.code_failed', 'claim.verified'])
    expect((await client.query(`select 1 from public.group_events where group_id = $1 and event_kind = 'group.claimed'`, [BAKERY])).rows).toHaveLength(1)
  })

  it('the moment it is claimed, its samples are gone for everyone', async () => {
    expect(await read(null, `select id from public.page_posts where group_id = $1 and sample_kind is not null`, [BAKERY])).toHaveLength(0)
    expect((await client.query(`select 1 from public.page_posts where group_id = $1 and dissolved_at is not null`, [BAKERY])).rows).toHaveLength(3)
    expect((await client.query(`select 1 from public.items where group_id = $1 and deleted_at is null`, [BAKERY])).rows).toHaveLength(0)
  })

  it('a second claimant is refused and sent to the report path', async () => {
    await expect(groupClaimStart(as(SECOND), { groupId: BAKERY, method: 'email', email: 'x@u987bakery.com' })).rejects.toThrow(CLAIM_REFUSED.claimed)
  })

  it('a code dies after its attempts or its time', async () => {
    const s = await groupClaimStart(as(SECOND), { groupId: OTHER, method: 'email', email: 'me@u987other.com' })
    const wrong = s.code === '000000' ? '111111' : '000000'
    for (let i = 0; i < CLAIM_LIMITS.attempts; i++) {
      await expect(groupClaimVerify(as(SECOND), { claimId: s.claimId, code: wrong })).rejects.toThrow(CLAIM_REFUSED.wrongCode)
    }
    await expect(groupClaimVerify(as(SECOND), { claimId: s.claimId, code: s.code })).rejects.toThrow(CLAIM_REFUSED.expired)

    const late = await groupClaimStart(as(SECOND), { groupId: OTHER, method: 'email', email: 'me@u987other.com' })
    await client.query(`update public.page_claims set expires_at = now() - interval '1 minute' where id = $1`, [late.claimId])
    await expect(groupClaimVerify(as(SECOND), { claimId: late.claimId, code: late.code })).rejects.toThrow(CLAIM_REFUSED.expired)
    expect((await one<{ unclaimed_at: Date | null }>(`select unclaimed_at from public.groups where id = $1`, [OTHER])).unclaimed_at).not.toBeNull()
  })

  it('a member is limited per day', async () => {
    await client.query(`delete from public.page_claims where claimant_member_id = $1`, [SECOND])
    for (let i = 0; i < CLAIM_LIMITS.startsPerMemberPerDay; i++) {
      await groupClaimStart(as(SECOND), { groupId: OTHER, method: 'email', email: 'me@u987other.com' })
    }
    await expect(groupClaimStart(as(SECOND), { groupId: OTHER, method: 'email', email: 'me@u987other.com' })).rejects.toThrow(CLAIM_REFUSED.limit)
  })

  it('only a claimant reads their claim, never its code; nobody reads the log', async () => {
    const mine = await read<Record<string, unknown>>(ROSA, `select id, group_id, method, status from public.page_claims`)
    expect(mine.map((r) => r.group_id)).toEqual([BAKERY])
    await expect(read(ROSA, `select code_hash from public.page_claims`)).rejects.toThrow(/permission denied/)
    await expect(read(ROSA, `select target from public.page_claims`)).rejects.toThrow(/permission denied/)
    expect(await read(OPERATOR, `select id from public.page_claims`)).toHaveLength(0)
    await expect(read(null, `select id from public.page_claims`)).rejects.toThrow(/permission denied/)
    for (const sub of [null, ROSA]) await expect(read(sub, `select 1 from public.page_claim_events`)).rejects.toThrow(/permission denied/)
    await expect(read(ROSA, `insert into public.page_claims (group_id, claimant_member_id, method, proof_url) values ('${OTHER}', '${ROSA}', 'proof', 'https://x.com')`)).rejects.toThrow(/permission denied/)
  })

  it('with no domain and no phone, a claim with proof waits for an operator, the only staff step', async () => {
    await expect(groupClaimProof(as(ROSA), { groupId: OTHER, proofUrl: 'https://instagram.com/u987' })).rejects.toThrow(/claimed with a code/)
    const { claimId } = await groupClaimProof(as(ROSA), { groupId: DARK, proofUrl: 'https://instagram.com/u987dark', note: 'I run it' })
    expect((await one<{ unclaimed_at: Date | null }>(`select unclaimed_at from public.groups where id = $1`, [DARK])).unclaimed_at).not.toBeNull()

    await expect(groupClaimDecide(as(SECOND), { claimId, approve: true })).rejects.toThrow()
    const prev = process.env.OPERATOR_MEMBER_ID
    process.env.OPERATOR_MEMBER_ID = OPERATOR
    try {
      expect(await groupClaimDecide(as(OPERATOR), { claimId, approve: true })).toEqual({ status: 'approved' })
    } finally {
      if (prev === undefined) delete process.env.OPERATOR_MEMBER_ID
      else process.env.OPERATOR_MEMBER_ID = prev
    }
    expect(await one(`select role from public.group_memberships where group_id = $1 and member_id = $2`, [DARK, ROSA])).toEqual({ role: 'owner' })
    expect(await events(DARK)).toEqual(['claim.proof_submitted', 'claim.approved'])
  })

  it('the seeder never makes a claimed Page again', async () => {
    const page = { name: 'U987 Bakery', publicInfoUrl: 'https://www.u987bakery.com' } as PlannedPage
    expect(await loadUnclaimed(client, [page])).toMatchObject({ created: 0, existing: 1 })
  })

  it('a town with 5 claimed Pages posting within 30 days is full; older or fewer posts are not', async () => {
    const city = (await client.query(`select id, display_name from public.places where kind = 'city' and deleted_at is null and display_name = 'Davis' limit 1`)).rows[0]
    expect(city).toBeTruthy()
    const loc = (await client.query(
      `insert into public.locations (member_id, kind, label, slug, geography, place_id, discoverability)
       values ($1, 'area', 'Davis', 'u987-town-davis', (select coalesce(centroid, st_centroid(geography::geometry)::geography) from public.places where id = $2), $2, 'listed') returning id`,
      [SYSTEM_MEMBER_ID, city.id])).rows[0].id
    const ids: string[] = []
    for (let i = 0; i < TOWN_SATURATION.claimedPages; i++) {
      const g = (await client.query(
        `insert into public.groups (kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, claimed_at, anchor_location_id)
         values ('business', $1, $1, 'x', 'active', 'listed', $2, now(), $3) returning id`, [`u987-town-${i}`, ROSA, loc])).rows[0].id
      ids.push(g)
      await client.query(`insert into public.page_posts (group_id, body, lifecycle_state, discoverability, created_at) values ($1, 'Open late', 'active', 'listed', now() - interval '40 days')`, [g])
    }
    expect((await saturatedTowns(client)).has('Davis')).toBe(false)
    for (const g of ids.slice(0, -1)) await client.query(`insert into public.page_posts (group_id, body, lifecycle_state, discoverability) values ($1, 'New today', 'active', 'listed')`, [g])
    expect((await saturatedTowns(client)).has('Davis')).toBe(false)
    await client.query(`insert into public.page_posts (group_id, body, lifecycle_state, discoverability) values ($1, 'New today', 'active', 'listed')`, [ids.at(-1)])
    expect((await saturatedTowns(client)).has('Davis')).toBe(true)
  })
})
