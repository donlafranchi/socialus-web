import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { memberInterestsAdd, memberInterestsRemove } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// #892 — "My interests": a member adds and removes their own interest tags through the action layer,
// and nobody else (another member, a signed-out visitor) can read or write them.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a member adds and removes their own interests, and nobody else reads them',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const ME = 'a1000000-0000-4000-8000-000000000892'
const OTHER = 'b1000000-0000-4000-8000-000000000892'

let pool: Pool
let client: PoolClient

const ctx = (actingMemberId: string): ActionContext => ({
  actingMemberId,
  viaDelegationId: null,
  traceId: 'i892',
  db: {} as never,
  now: () => new Date(),
})

const tagsOf = async (member: string) =>
  (await client.query<{ tag: string }>(`select tag from public.member_interests where member_id = $1 order by tag`, [member])).rows.map((r) => r.tag)
const events = async (member: string, kind: string) =>
  (
    await client.query<{ tag: string }>(
      `select payload->>'tag' as tag from public.member_events where member_id = $1 and event_kind = $2 order by created_at`,
      [member, kind],
    )
  ).rows.map((r) => r.tag)

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

/** A direct write as `sub`: how many rows it touched, or 'denied' when the database refused it outright. */
async function writeAs(sub: string, sql: string, params: unknown[] = []): Promise<number | 'denied'> {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role authenticated`)
    return (await client.query(sql, params)).rowCount ?? 0
  } catch {
    return 'denied'
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[ME, 'i892-me'], [OTHER, 'i892-other']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  const ids = [ME, OTHER]
  await client.query(`delete from public.member_events where member_id = any($1)`, [ids])
  await client.query(`delete from public.member_interests where member_id = any($1)`, [ids])
  await client.query(`delete from public.members where id = any($1)`, [ids])
  await client.query(`delete from auth.users where id = any($1)`, [ids])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#892 — a member adds and removes their interests', () => {
  it('adds tags, once each, with one event per new tag', async () => {
    await memberInterestsAdd(ctx(ME), { tags: ['live-music', 'gardening'] })
    const again = await memberInterestsAdd(ctx(ME), { tags: ['gardening'] })
    expect(again.addedTags).toEqual([])
    expect(await tagsOf(ME)).toEqual(['gardening', 'live-music'])
    expect(await events(ME, 'member.interest_added')).toEqual(['live-music', 'gardening'])
  })

  it('removes a tag with one event, and removing it again is a quiet no-op', async () => {
    const first = await memberInterestsRemove(ctx(ME), { tags: ['gardening'] })
    expect(first.removedTags).toEqual(['gardening'])
    const again = await memberInterestsRemove(ctx(ME), { tags: ['gardening'] })
    expect(again.removedTags).toEqual([])
    expect(await tagsOf(ME)).toEqual(['live-music'])
    expect(await events(ME, 'member.interest_removed')).toEqual(['gardening'])
  })

  it("removes only the acting member's own tag", async () => {
    await memberInterestsAdd(ctx(OTHER), { tags: ['live-music'] })
    await memberInterestsRemove(ctx(ME), { tags: ['live-music'] })
    expect(await tagsOf(ME)).toEqual([])
    expect(await tagsOf(OTHER)).toEqual(['live-music'])
  })

  it('refuses a tag outside the 12 interests', async () => {
    await expect(memberInterestsAdd(ctx(ME), { tags: ['running'] })).rejects.toThrow()
    expect(await tagsOf(ME)).toEqual([])
  })
})

// Ruling 2026-09-30 (product/systems/member.md): a member's interest tags are not public.
describe.skipIf(!RUNNABLE)('#892 — interests are private to the member', () => {
  it('another member and a signed-out visitor read none; the member reads their own', async () => {
    await memberInterestsAdd(ctx(ME), { tags: ['arts'] })
    const read = `select tag from public.member_interests where member_id = $1`
    expect(await as(OTHER, read, [ME])).toEqual([])
    expect(await as(null, read, [ME])).toEqual([])
    expect(await as(ME, read, [ME])).toEqual([{ tag: 'arts' }])
  })

  it('nobody writes the table directly, not even the member', async () => {
    for (const sub of [ME, OTHER]) {
      expect(await writeAs(sub, `insert into public.member_interests (member_id, tag) values ($1, 'crafts')`, [ME])).toBe('denied')
      expect([0, 'denied']).toContain(await writeAs(sub, `delete from public.member_interests where member_id = $1`, [ME]))
    }
    expect(await tagsOf(ME)).toEqual(['arts'])
  })
})
