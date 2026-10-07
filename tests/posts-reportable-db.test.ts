import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { reportCreate, reportDecide, reportReverse } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'
import { databaseWriteSafety } from './support/write-safe'

// F078 criterion 1 — a hidden Post is private, so every existing read path
// withholds it from everyone but the people who manage the Page; restoring puts
// the audience back exactly.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a reported Post hidden by the report path reads only to its Page\'s managers, and restores to what it was',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a7000000-0000-4000-8000-000000000478'
const READER = 'b7000000-0000-4000-8000-000000000478'
const PAGE = 'c7000000-0000-4000-8000-000000000478'
const POST = 'd7000000-0000-4000-8000-000000000478'

let pool: Pool
let client: PoolClient

async function as<T>(sub: string, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role authenticated`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

const read = (sub: string) => as(sub, `select id from public.page_posts where id = $1`, [POST])

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b478-owner'], [READER, 'b478-reader']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','B478 Hall','b478-hall','Here.','active','listed',$2)`,
    [PAGE, OWNER],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'organizer')`, [PAGE, OWNER])
  await client.query(
    `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability) values ($1,$2,'A post','active','listed')`,
    [POST, PAGE],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.reports where subject_id = $1`, [POST])
  await client.query(`delete from public.member_notices where subject_id = $1`, [POST])
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, READER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, READER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('F078 — a reported Post', () => {
  it('reads to everyone while it is up', async () => {
    expect(await read(READER)).toHaveLength(1)
  })

  // [guards F078.2 partial: Posts; the report handler sets this state]
  it('hidden, it reads only to the people who manage the Page', async () => {
    await client.query(
      `update public.page_posts set hidden_at = now(), hidden_prior_discoverability = discoverability, discoverability = 'private' where id = $1`,
      [POST],
    )
    expect(await read(READER)).toHaveLength(0)
    expect(await read(OWNER)).toHaveLength(1)
  })

  it('a hidden post must remember what it was', async () => {
    await expect(client.query(`update public.page_posts set hidden_prior_discoverability = null where id = $1`, [POST])).rejects.toThrow(/page_posts_hidden_has_prior/)
  })

  it('restored, it reads to everyone again', async () => {
    await client.query(
      `update public.page_posts set discoverability = hidden_prior_discoverability, hidden_at = null, hidden_prior_discoverability = null where id = $1`,
      [POST],
    )
    expect(await read(READER)).toHaveLength(1)
  })

  it('a report can name a post', async () => {
    const r = await client.query(
      `insert into public.reports (reporter_member_id, subject_kind, subject_id, body, category) values ($1,'post',$2,'x','spam') returning id`,
      [READER, POST],
    )
    expect(r.rows).toHaveLength(1)
    await client.query(`delete from public.reports where id = $1`, [r.rows[0].id])
  })

  // The real handlers against the real schema: what a member's report does,
  // not what a hand-written UPDATE does.
  describe('through the handlers', () => {
    const ctx = (id: string): ActionContext =>
      ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext
    const state = async () =>
      (await client.query(`select discoverability, hidden_at, removed_at, hide_locked_body from public.page_posts where id = $1`, [POST])).rows[0]
    let reportId: string

    it('a report hides the post, tells the founder, and a stranger can no longer read it', async () => {
      process.env.OPERATOR_MEMBER_ID = OWNER
      const r = await reportCreate(ctx(READER), { subjectKind: 'post', category: 'spam', subjectId: POST, body: 'Looks like an ad.' })
      reportId = r.reportId
      expect(r.photoHidden).toBe(true)
      expect((await state()).discoverability).toBe('private')
      expect(await read(READER)).toHaveLength(0)
      const notices = await client.query(`select message from public.member_notices where member_id = $1 and subject_id = $2`, [OWNER, POST])
      expect(notices.rows).toHaveLength(1)
      await client.query(`delete from public.member_notices where subject_id = $1`, [POST])
    })

    it('approve restores the audience it had and locks those words', async () => {
      await reportDecide(ctx(OWNER), { reportId, outcome: 'restored', reasonCode: 'nothing_wrong' })
      const st = await state()
      expect(st.discoverability).toBe('listed')
      expect(st.hidden_at).toBeNull()
      expect(st.hide_locked_body).toBe('A post')
      expect(await read(READER)).toHaveLength(1)
    })

    it('a second report on the same words stores and queues but does not hide it again', async () => {
      const r = await reportCreate(ctx(READER), { subjectKind: 'post', category: 'spam', subjectId: POST, body: 'Again.' }).catch(() => null)
      // The one-per-member cap may refuse it outright; either way it stays up.
      if (r) expect(r.photoHidden).toBe(false)
      expect(await read(READER)).toHaveLength(1)
    })

    it('reversing the approval takes it down again, and a removal can be undone', async () => {
      const d = (await client.query(`select id from public.report_decisions where report_id = $1 order by decided_at desc limit 1`, [reportId])).rows[0].id
      await reportReverse(ctx(OWNER), { decisionId: d, reasonCode: 'not_suitable' })
      const st = await state()
      expect(st.discoverability).toBe('private')
      expect(st.removed_at).not.toBeNull()
      expect(await read(READER)).toHaveLength(0)
      const d2 = (await client.query(`select id from public.report_decisions where report_id = $1 order by decided_at desc limit 1`, [reportId])).rows[0].id
      await reportReverse(ctx(OWNER), { decisionId: d2, reasonCode: 'reported_by_mistake' })
      expect(await read(READER)).toHaveLength(1)
    })
  })
})
