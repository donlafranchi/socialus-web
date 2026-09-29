import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// A stranger holding a public Page's slug must not be handed the member ids
// behind it: not through the membership view asked the wrong way round, and not
// through groups.founder_member_id. What signed-out pages show today — a
// profile's Pages, a Page's "Founded by" — keeps working through reads that
// carry no member id.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a public Page does not lead an anonymous caller to the member ids behind it',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const FOUNDER = 'aaaaaaaa-0000-4000-8000-0000000000e1'
const PAGE = 'cccccccc-0000-4000-8000-0000000000e1'
const SLUG = 'identity-leak-page'

let pool: Pool
let client: PoolClient

async function as<T>(role: 'anon' | 'authenticated', sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (role === 'authenticated') {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: FOUNDER, role: 'authenticated' }),
      ])
    }
    await client.query(`set local role ${role}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
    [FOUNDER, 'identity-leak@test.invalid'],
  )
  await client.query(
    `insert into public.members (id, handle, display_name, stakeholder_visibility)
     values ($1,'identity-leak','Leak Founder','public')`,
    [FOUNDER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','Identity Leak Page',$2,'active','listed',$3)`,
    [PAGE, SLUG, FOUNDER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship)
     values ($1,$2,'steward','explicit','member')`,
    [PAGE, FOUNDER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = $1`, [FOUNDER])
  await client.query(`delete from auth.users where id = $1`, [FOUNDER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('member identity, signed out', () => {
  it("a signed-out profile still lists the member's Pages, one direction only", async () => {
    const rows = await as<{ slug: string }>('anon', `select * from public.member_public_pages($1)`, [FOUNDER])
    expect(rows.map((r) => r.slug)).toEqual([SLUG])
    expect(Object.keys(rows[0])).not.toContain('member_id')
  })

  it('a signed-out Page still names its founder, without their id', async () => {
    const rows = await as<Record<string, unknown>>(
      'anon',
      `select * from public.page_founder_public($1)`,
      [PAGE],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ handle: 'identity-leak', display_name: 'Leak Founder' })
    expect(Object.keys(rows[0])).not.toContain('id')
    expect(Object.keys(rows[0])).not.toContain('member_id')
  })

  it('a founder signed in still finds their own Pages by founder_member_id', async () => {
    const rows = await as(
      'authenticated',
      `select id from public.groups where founder_member_id = $1`,
      [FOUNDER],
    )
    expect(rows).toHaveLength(1)
  })
})
