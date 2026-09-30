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
  it('the membership view does not answer an anonymous caller', async () => {
    await expect(
      as('anon', `select member_id from public.member_public_group_memberships where slug = $1`, [SLUG]),
    ).rejects.toThrow(/permission denied/)
  })

  it('groups.founder_member_id does not answer an anonymous caller', async () => {
    await expect(
      as('anon', `select founder_member_id from public.groups where id = $1`, [PAGE]),
    ).rejects.toThrow(/permission denied/)
  })

  it('every other column a signed-out Page reads still answers', async () => {
    const rows = await as(
      'anon',
      `select id, slug, public_id, kind, name, description, lifecycle_state, anchor_location_id,
              category, photo_url, photo_hidden_at, photo_hide_locked_url, social_links,
              discoverability, dissolved_at
         from public.groups where id = $1`,
      [PAGE],
    )
    expect(rows).toHaveLength(1)
  })

  it('a column added to groups later is granted to anon, unless it names a member', async () => {
    const { rows } = await client.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'groups'
          and column_name <> 'founder_member_id'`,
    )
    const cols = rows.map((r) => `"${r.column_name}"`).join(', ')
    await expect(as('anon', `select ${cols} from public.groups where id = $1`, [PAGE])).resolves.toHaveLength(1)
  })

  it("a policy that asks who founded a Page does not break an anonymous read of that Page's posts", async () => {
    await expect(
      as('anon', `select id from public.page_posts where group_id = $1`, [PAGE]),
    ).resolves.toBeDefined()
  })

  // #246 (2026-09-30): a member's Pages are about the member, so they reach
  // nobody but that member. tests/member-reads-db.test.ts covers the owner.
  it("a signed-out caller is not listed a member's Pages", async () => {
    expect(await as('anon', `select * from public.member_public_pages($1)`, [FOUNDER])).toEqual([])
  })

  // #246 (Don, 2026-09-30): the signed-out front door carries no founder.
  // tests/member-reads-db.test.ts covers the signed-in one, by display name.
  it('a signed-out Page names no founder', async () => {
    expect(await as('anon', `select * from public.page_founder_public($1)`, [PAGE])).toEqual([])
  })

  it("a listed Page's roster does not answer an anonymous caller", async () => {
    const rows = await as('anon', `select member_id from public.group_memberships where group_id = $1`, [PAGE])
    expect(rows).toHaveLength(0)
  })

  it('a member signed in still reads their own membership', async () => {
    const rows = await as(
      'authenticated',
      `select role from public.group_memberships where group_id = $1 and member_id = $2`,
      [PAGE, FOUNDER],
    )
    expect(rows).toHaveLength(1)
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
