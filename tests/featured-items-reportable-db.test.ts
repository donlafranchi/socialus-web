import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { reportCreate, reportDecide, featuredItemSave } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'
import { fetchReviewQueue } from '@/lib/admin/reports-queue'
import { databaseWriteSafety } from './support/write-safe'

// #909 — a Page's featured product or service, reported through the real handlers: a repeat hides just that
// item from everyone but the member who added it, the queue shows its words, a restore puts it back, and the
// owner's edit to its words shows a hidden one again.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a reported featured item hides from everyone but its owner, is queued with its words, and restores",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a7000000-0000-4000-8000-000000000909'
const READER = 'b7000000-0000-4000-8000-000000000909'
const OTHER = 'e7000000-0000-4000-8000-000000000909'
const PAGE = 'c7000000-0000-4000-8000-000000000909'

let pool: Pool
let client: PoolClient
let itemId: string

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
      await client.query(`set local role authenticated`)
    } else {
      await client.query(`set local role anon`)
    }
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}
const read = (sub: string | null) => as(sub, `select id from public.items where id = $1`, [itemId])
const ctx = (id: string): ActionContext =>
  ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'i909-owner'], [READER, 'i909-reader'], [OTHER, 'i909-other']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'business','I909 Seeds','i909-seeds','Seeds.','active','listed',$2)`,
    [PAGE, OWNER],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'owner')`, [PAGE, OWNER])
  itemId = (await featuredItemSave(ctx(OWNER), { groupId: PAGE, kind: 'product', name: 'Milkweed seed', details: 'Local.' })).itemId
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.report_decisions where report_id in (select id from public.reports where subject_id = $1)`, [itemId])
  await client.query(`delete from public.reports where subject_id = $1`, [itemId])
  await client.query(`delete from public.member_notices where subject_id = $1`, [itemId])
  await client.query(`delete from public.items where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, READER, OTHER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, READER, OTHER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#909 — a reported featured item', () => {
  let reportId: string

  it('reads to everyone while it is up', async () => {
    expect(await read(null)).toHaveLength(1)
    expect(await read(READER)).toHaveLength(1)
  })

  it('a first report sends a courtesy notice and leaves it up', async () => {
    process.env.OPERATOR_MEMBER_ID = OWNER
    const r = await reportCreate(ctx(OTHER), { subjectKind: 'page_item', category: 'spam', subjectId: itemId, body: 'Ad.' })
    expect(r.photoHidden).toBe(false)
    expect(await read(READER)).toHaveLength(1)
    const n = await client.query(`select kind from public.member_notices where member_id = $1 and subject_id = $2`, [OWNER, itemId])
    expect(n.rows).toEqual([{ kind: 'courtesy' }])
  })

  // [guards F078.1 partial: a Page's featured products and services]
  it('a repeat from someone else hides it from everyone but its owner', async () => {
    const r = await reportCreate(ctx(READER), { subjectKind: 'page_item', category: 'spam', subjectId: itemId, body: 'Still an ad.' })
    reportId = r.reportId
    expect(r.photoHidden).toBe(true)
    expect(await read(null)).toHaveLength(0)
    expect(await read(READER)).toHaveLength(0)
    expect(await read(OWNER)).toHaveLength(1)
    const ev = await client.query(`select 1 from public.group_events where group_id = $1 and event_kind = 'group.item_hidden'`, [PAGE])
    expect(ev.rows).toHaveLength(1)
  })

  it('the queue lists it with its words', async () => {
    const q = (await fetchReviewQueue(200, { includeBuilders: true })).find((x) => x.reportId === reportId)
    expect(q).toMatchObject({ subjectKind: 'page_item', groupId: PAGE, contentText: 'Milkweed seed\nLocal.' })
    expect(q!.hiddenAt).not.toBeNull()
  })

  it('a restore puts it back for everyone', async () => {
    await reportDecide(ctx(OWNER), { reportId, outcome: 'restored', reasonCode: 'nothing_wrong' })
    expect(await read(null)).toHaveLength(1)
    const it = (await client.query(`select hide_locked_text from public.items where id = $1`, [itemId])).rows[0]
    expect(it.hide_locked_text).toBe('Milkweed seed\nLocal.')
  })

  it("the owner's edit to its words shows a hidden one again", async () => {
    await client.query(`update public.items set hidden_at = now() where id = $1`, [itemId])
    expect(await read(READER)).toHaveLength(0)
    await featuredItemSave(ctx(OWNER), { groupId: PAGE, itemId, kind: 'product', name: 'Milkweed seed, 1 oz', details: 'Local.' })
    expect(await read(READER)).toHaveLength(1)
  })
})
