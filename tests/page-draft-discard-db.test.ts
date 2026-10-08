// #463 — owners delete their own unpublished drafts, against a real database.
//
// The draft here is made by the Create handler, not inserted: a seeded draft is
// assembled by someone who knew what it should contain (supabase/seeds/README.md).
// Committed rather than rolled back because the handlers open their own
// transaction; cleaned up after.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { groupCreate, groupDiscardDraft, AuthorizationError, ValidationError } from '../src/actions'
import type { ActionContext } from '../src/actions'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'an owner deletes their own unpublished draft, and nobody else, and nothing live',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-000000000463'
const OUTSIDER = 'bbbbbbbb-0000-4000-8000-000000000463'

let pool: Pool
let client: PoolClient
const made: string[] = []

const ctx = (id: string): ActionContext => ({
  actingMemberId: id,
  viaDelegationId: null,
  traceId: 't463',
  db: {} as never,
  now: () => new Date(),
})

const count = async (sql: string, p: unknown[]) => Number((await client.query(sql, p)).rows[0].n)

async function newDraft() {
  const r = await groupCreate(ctx(OWNER), { kind: 'group', purpose: 'create', founderMemberId: OWNER })
  made.push(r.groupId)
  return r.groupId
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'f463-owner'], [OUTSIDER, 'f463-outsider']]) {
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
  for (const id of made) {
    await client.query(`delete from public.page_posts where group_id = $1`, [id])
    await client.query(`delete from public.groups where id = $1`, [id])
  }
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, OUTSIDER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, OUTSIDER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('discarding an unpublished draft', () => {
  it('removes the draft, its membership and its events, for the owner who started it', async () => {
    const id = await newDraft()
    expect(await count(`select count(*) n from public.groups where id = $1 and lifecycle_state = 'draft'`, [id])).toBe(1)
    expect(await count(`select count(*) n from public.group_memberships where group_id = $1`, [id])).toBeGreaterThan(0)
    await groupDiscardDraft(ctx(OWNER), { groupId: id })
    expect(await count(`select count(*) n from public.groups where id = $1`, [id])).toBe(0)
    expect(await count(`select count(*) n from public.group_memberships where group_id = $1`, [id])).toBe(0)
    expect(await count(`select count(*) n from public.group_events where group_id = $1`, [id])).toBe(0)
  })

  it("refuses someone else's draft, and it stays", async () => {
    const id = await newDraft()
    await expect(groupDiscardDraft(ctx(OUTSIDER), { groupId: id })).rejects.toBeInstanceOf(AuthorizationError)
    expect(await count(`select count(*) n from public.groups where id = $1`, [id])).toBe(1)
  })

  it('refuses a Page that has been published: that goes through Delete, with its grace', async () => {
    const id = await newDraft()
    await client.query(`update public.groups set lifecycle_state = 'active', name = 'F463 Club' where id = $1`, [id])
    await expect(groupDiscardDraft(ctx(OWNER), { groupId: id })).rejects.toBeInstanceOf(ValidationError)
    expect(await count(`select count(*) n from public.groups where id = $1`, [id])).toBe(1)
  })
})
