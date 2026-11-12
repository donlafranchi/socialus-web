// F118 criteria 4–6 against a real database: a neighbour adds a maker, the event and the credit land
// in the same transaction, the same site typed another way is offered back, a claim counts the maker,
// and a hidden name leaves the board. The unit tests mock the transaction; this is the one that doesn't.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { townMakerAdd, townCreditSet } from '../src/actions'
import type { ActionContext } from '../src/actions'

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a neighbour adds a maker for real; a claim counts it and credits them',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const ADDER = 'aaaaaaaa-0000-4000-8000-00000000f118'
const SITE = 'https://f118-bluebird.example'
let pool: Pool
let client: PoolClient
let town: string | undefined

const ctx = (actingMemberId: string): ActionContext => ({ actingMemberId, viaDelegationId: null, traceId: 'f118-db', db: null as never, now: () => new Date() })

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  // A town of the test's own over a county with a shape that no other town names, so the counts are ours alone.
  const county = (
    await client.query<{ display_name: string }>(
      `select p.display_name from public.places p where p.kind = 'county' and p.deleted_at is null and p.geography is not null
          and not exists (select 1 from public.towns t where p.display_name = any (t.county_names)) order by p.display_name limit 1`,
    )
  ).rows[0]?.display_name
  if (county) {
    await client.query(`insert into public.towns (slug, market_key, name, county_names) values ('f118-test', 'f118-test', 'F118 Test', array[$1])`, [county])
    town = 'f118-test'
  }
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','f118@test.invalid','x',now(),now(),now())`,
    [ADDER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1, 'f118-adder', 'Robin Example')`, [ADDER])
})

afterAll(async () => {
  if (!RUNNABLE) return
  const ids = (await client.query<{ id: string }>(`select group_id as id from public.town_adds where member_id = $1`, [ADDER])).rows.map((r) => r.id)
  await client.query(`delete from public.group_events where group_id = any($1)`, [ids])
  await client.query(`delete from public.groups where id = any($1)`, [ids])
  await client.query(`delete from public.member_events where member_id = $1`, [ADDER])
  await client.query(`delete from public.members where id = $1`, [ADDER])
  await client.query(`delete from auth.users where id = $1`, [ADDER])
  await client.query(`delete from public.towns where slug = 'f118-test'`)
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('F118 — open your town, for real', () => {
  it('adds an unclaimed Page with its event and the credit, and offers it back for the same site typed another way', async () => {
    expect(town).toBeDefined()
    const added = await townMakerAdd(ctx(ADDER), { townSlug: town!, name: 'F118 Bluebird Bakery', link: SITE, kind: 'food' })
    expect(added.kind).toBe('added')
    const g = (await client.query(`select id, unclaimed_at, founder_member_id from public.groups where public_id = $1`, [added.publicId])).rows[0]
    expect(g.unclaimed_at).not.toBeNull()
    expect((await client.query(`select 1 from public.group_events where group_id = $1 and event_kind = 'group.created'`, [g.id])).rowCount).toBe(1)
    expect((await client.query(`select maker_kind from public.town_adds where group_id = $1`, [g.id])).rows).toEqual([{ maker_kind: 'food' }])

    const again = await townMakerAdd(ctx(ADDER), { townSlug: town!, name: 'Something else', link: 'http://www.F118-bluebird.example/', kind: 'shops' })
    expect(again).toEqual({ kind: 'exists', publicId: added.publicId })
  })

  it('a claim counts the maker in the town and credits the adder by first name; hiding the name removes it', async () => {
    const before = (await client.query(`select makers from public.town_board() where slug = $1`, [town])).rows[0].makers
    await client.query(
      `update public.groups set unclaimed_at = null, claimed_at = now(), founder_member_id = $1
        where id = (select group_id from public.town_adds where member_id = $1 limit 1)`,
      [ADDER],
    )
    const after = (await client.query(`select makers, kinds from public.town_board() where slug = $1`, [town])).rows[0]
    expect(after.makers).toBe(before + 1)
    expect(after.kinds.food).toBeGreaterThanOrEqual(1)
    expect((await client.query(`select first_name, brought from public.town_contributors($1)`, [town])).rows).toContainEqual({ first_name: 'Robin', brought: 1 })

    await townCreditSet(ctx(ADDER), { hidden: true })
    expect((await client.query(`select first_name from public.town_contributors($1)`, [town])).rows).not.toContainEqual({ first_name: 'Robin' })
  })
})
