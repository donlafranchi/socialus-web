import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { fetchReviewQueue } from '@/lib/admin/reports-queue'

// bug #439 — an archived or deleted Page answers the people who manage it, by
// every path. The persona half is in evals/visibility/matrix.ts; this is the
// half no persona reads directly: the discoverable_items materialized view,
// which definer functions read past RLS, and the operator's review queue.
//
// Operators (well-worn: Facebook and Google moderators work in their own
// review tools, not on the public surface) read an archived or deleted Page on
// the operator page, which reads over the pool. The public Page stays hidden
// from the operator's own account, as from anyone else who doesn't manage it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "an archived or deleted Page's items leave every list, and the operator still reads its reports",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a2000000-0000-4000-8000-000000000439'
const REPORTER = 'b2000000-0000-4000-8000-000000000439'
const PAGE = 'c2000000-0000-4000-8000-000000000439'
const LOCATION = 'd2000000-0000-4000-8000-000000000439'
const ITEM = 'e2000000-0000-4000-8000-000000000439'
const REPORT = 'f2000000-0000-4000-8000-000000000439'

let pool: Pool
let client: PoolClient

const inView = async () =>
  Number((await client.query(`select count(*)::int n from public.discoverable_items where group_id = $1`, [PAGE])).rows[0].n)

async function setState(state: 'active' | 'archived' | 'deleted') {
  await client.query(
    state === 'deleted'
      ? `update public.groups set lifecycle_state = 'dissolved', dissolved_at = now(), delete_after = now() + interval '14 days' where id = $1`
      : `update public.groups set lifecycle_state = $2, dissolved_at = null, delete_after = null where id = $1`,
    state === 'deleted' ? [PAGE] : [PAGE, state],
  )
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b439-owner'], [REPORTER, 'b439-reporter']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.locations (id, member_id, kind, label, slug, geography)
     values ($1,$2,'permanent','B439 spot','b439-spot', ST_GeogFromText('POINT(-121.47 38.54)'))`,
    [LOCATION, OWNER],
  )
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id, anchor_location_id)
     values ($1,'group','B439 Club','b439-club','We meet.','active','listed',$2,$3)`,
    [PAGE, OWNER, LOCATION],
  )
  await client.query(
    `insert into public.items (id, member_id, kind, title, description, state, group_id) values ($1,$2,'product','B439 thing','A thing.','published',$3)`,
    [ITEM, OWNER, PAGE],
  )
  await client.query(
    `insert into public.item_locations (item_id, location_id, schedule_kind, status) values ($1,$2,'permanent','approved')`,
    [ITEM, LOCATION],
  )
  await client.query(
    `insert into public.reports (id, reporter_member_id, subject_kind, subject_id, body) values ($1,$2,'group',$3,'B439 report')`,
    [REPORT, REPORTER, PAGE],
  )
  await client.query('refresh materialized view public.discoverable_items')
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.reports where id = $1`, [REPORT])
  await client.query(`delete from public.item_locations where item_id = $1`, [ITEM])
  await client.query(`delete from public.item_events where item_id = $1`, [ITEM])
  await client.query(`delete from public.items where id = $1`, [ITEM])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.location_events where location_id = $1`, [LOCATION])
  await client.query(`delete from public.locations where id = $1`, [LOCATION])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, REPORTER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, REPORTER]])
  await client.query('refresh materialized view public.discoverable_items')
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)("an archived or deleted Page's items leave the discoverable list (#439)", () => {
  it('a live Page\'s item is listed (the fixture can surface)', async () => {
    expect(await inView()).toBe(1)
  })

  for (const state of ['archived', 'deleted'] as const) {
    it(`once the Page is ${state}, with no refresh asked for`, async () => {
      await setState(state)
      try {
        expect(await inView()).toBe(0)
      } finally {
        await setState('active')
      }
      expect(await inView()).toBe(1)
    })
  }
})

describe.skipIf(!RUNNABLE)('the operator reads an archived or deleted Page on the operator page (#439)', () => {
  for (const state of ['archived', 'deleted'] as const) {
    it(`a report on a ${state} Page stays in the review queue, with its Page`, async () => {
      await setState(state)
      try {
        const row = (await fetchReviewQueue(500, { includeBuilders: true })).find((r) => r.reportId === REPORT)
        expect(row).toMatchObject({ groupId: PAGE, groupName: 'B439 Club' })
      } finally {
        await setState('active')
      }
    })
  }
})
