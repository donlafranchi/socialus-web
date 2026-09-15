// F067 acceptance 2 — an open Page's followers are visible to nobody.
//
// Asserted through RLS against a real database, because the guarantee is a
// property of what a browser client gets back, not of what the DDL says.
//
// The mechanism: `memberships_select_listed_group` returns rows only where
// source = 'explicit'. A follower is written 'soft_via_follow', so it falls
// outside. That is why no new policy was added, and why this test exists —
// the guarantee rests on the handler writing the right source, which a
// migration cannot enforce.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "an open Page's followers cannot be read by anyone through the browser client",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'aaaaaaaa-0000-4000-8000-00000000f067'
const FOLLOWER = 'bbbbbbbb-0000-4000-8000-00000000f067'
const NOSY = 'cccccccc-0000-4000-8000-00000000f067'
const OPEN_PAGE = 'dddddddd-0000-4000-8000-00000000f067'

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query('begin')

  for (const [id, h] of [[OWNER, 'f067-owner'], [FOLLOWER, 'f067-follower'], [NOSY, 'f067-nosy']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(
      `insert into public.members (id, handle, display_name) values ($1,$2,$3)`,
      [id, h, h],
    )
  }

  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','F067 Open Page','f067-open','active','listed',$2)`,
    [OPEN_PAGE, OWNER],
  )
  // The owner, an explicit member. And a follower, the way the handler writes one.
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'steward','explicit','member')`,
    [OPEN_PAGE, OWNER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'member','soft_via_follow','follower')`,
    [OPEN_PAGE, FOLLOWER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query('rollback')
  client.release()
  await pool.end()
})

async function readAs(memberId: string) {
  await client.query(`set local role authenticated`)
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: memberId, role: 'authenticated' }),
  ])
  const { rows } = await client.query<{ member_id: string; relationship: string }>(
    `select member_id, relationship from public.group_memberships where group_id = $1`,
    [OPEN_PAGE],
  )
  await client.query(`set local role postgres`)
  return rows
}

describe.skipIf(!RUNNABLE)('F067 — an open Page hides who follows it', () => {
  it('a stranger cannot see the follower', async () => {
    const rows = await readAs(NOSY)
    expect(rows.map((r) => r.member_id)).not.toContain(FOLLOWER)
  })

  it("the Page's own owner cannot see the follower either", async () => {
    // Acceptance 2 is explicit that this includes the Page's own side.
    const rows = await readAs(OWNER)
    expect(rows.map((r) => r.member_id)).not.toContain(FOLLOWER)
  })

  it('the follower can still see their own row, which is what the button reads', async () => {
    const rows = await readAs(FOLLOWER)
    expect(rows.map((r) => r.member_id)).toContain(FOLLOWER)
    expect(rows.find((r) => r.member_id === FOLLOWER)?.relationship).toBe('follower')
  })

  it('the control: an explicit member of the same listed Page IS visible', async () => {
    // Without this, a policy that returned nothing at all would pass every
    // assertion above while breaking F067 acceptance 3.
    const rows = await readAs(NOSY)
    expect(rows.map((r) => r.member_id)).toContain(OWNER)
  })

  it('a count is still possible server-side, where the operator reads', async () => {
    const { rows } = await client.query<{ n: string }>(
      `select count(*)::text as n from public.group_memberships
        where group_id = $1 and relationship = 'follower' and left_at is null`,
      [OPEN_PAGE],
    )
    expect(Number(rows[0].n)).toBe(1)
  })
})
