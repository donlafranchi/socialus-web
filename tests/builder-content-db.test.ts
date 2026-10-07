import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #388 — Delete all builder content removes every row a builder made and never
// a member's: their Page, its post, and their own follow of another member's
// Page all survive. The builder accounts survive too. Run inside one
// transaction and rolled back, because the delete is global and other suites
// keep builder fixtures of their own.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'deleting builder content removes what builders made and nothing a member made',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const BUILDER = 'a4000000-0000-4000-8000-000000000388'
const MEMBER = 'b4000000-0000-4000-8000-000000000388'
const MEMBER2 = 'b4000000-0000-4000-8000-000000000389'
const B_PAGE = 'c4000000-0000-4000-8000-000000000388'
const M_PAGE = 'c4000000-0000-4000-8000-000000000389'
const B_POST = 'd4000000-0000-4000-8000-000000000388'
const M_POST = 'd4000000-0000-4000-8000-000000000389'

let pool: Pool
let client: PoolClient

const count = async (sql: string, params: unknown[]) => Number((await client.query(sql, params)).rows[0].n)

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
})

afterAll(async () => {
  if (!RUNNABLE) return
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#388 delete all builder content', () => {
  it('removes what builders made and nothing a member made', async () => {
    await client.query('begin')
    try {
      for (const [id, h] of [[BUILDER, 'd388-builder'], [MEMBER, 'd388-member'], [MEMBER2, 'd388-member-two']]) {
        await client.query(
          `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
           values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
          [id, `${h}@test.invalid`],
        )
        await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
      }
      await client.query(`insert into public.builders (member_id, persona) values ($1,'d388')`, [BUILDER])
      await client.query(
        `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id) values
           ($1,'interest','D388 Builder','d388-builder-page','B.','active','listed',$2),
           ($3,'interest','D388 Member','d388-member-page','M.','active','listed',$4)`,
        [B_PAGE, BUILDER, M_PAGE, MEMBER],
      )
      await client.query(
        `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability) values
           ($1,$2,'builder post','active','listed'), ($3,$4,'member post','active','listed')`,
        [B_POST, B_PAGE, M_POST, M_PAGE],
      )
      await client.query(
        `insert into public.group_memberships (group_id, member_id, role, source, relationship) values
           ($1,$2,'member','soft_via_follow','follower'),
           ($3,$4,'member','soft_via_follow','follower'),
           ($5,$4,'member','soft_via_follow','follower')`,
        [M_PAGE, BUILDER, M_PAGE, MEMBER2, B_PAGE],
      )

      const deleted = (await client.query(`select public.delete_builder_content() as d`)).rows[0].d
      expect(deleted.pages).toBeGreaterThanOrEqual(1)

      expect(await count(`select count(*) as n from public.groups where id = $1`, [B_PAGE])).toBe(0)
      expect(await count(`select count(*) as n from public.page_posts where id = $1`, [B_POST])).toBe(0)
      expect(await count(`select count(*) as n from public.group_memberships where member_id = $1`, [BUILDER])).toBe(0)

      expect(await count(`select count(*) as n from public.groups where id = $1`, [M_PAGE])).toBe(1)
      expect(await count(`select count(*) as n from public.page_posts where id = $1`, [M_POST])).toBe(1)
      expect(
        await count(`select count(*) as n from public.group_memberships where group_id = $1 and member_id = $2`, [M_PAGE, MEMBER2]),
      ).toBe(1)
      expect(await count(`select count(*) as n from public.builders where member_id = $1`, [BUILDER])).toBe(1)
      expect(await count(`select count(*) as n from public.members where id = $1`, [BUILDER])).toBe(1)
    } finally {
      await client.query('rollback')
    }
  })

  it('no member or visitor can run it or read the switch', async () => {
    for (const role of ['anon', 'authenticated']) {
      await client.query('begin')
      try {
        await client.query(`set local role ${role}`)
        await expect(client.query(`select public.delete_builder_content()`)).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('rollback')
      }
      await client.query('begin')
      try {
        await client.query(`set local role ${role}`)
        await expect(client.query(`select visible from public.builder_content`)).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('rollback')
      }
    }
  })
})
