import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { reportCreate, reportNcmecRecord } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// #648 / F102 criterion 14 — a Sensitive content report on a Post keeps the words, the poster and where it came
// from for a year; the hold is operator-only, and the daily origin purge leaves a held item's address alone.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a Sensitive content report keeps the item and where it came from for a year, to the operator alone',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a8100000-0000-4000-8000-000000000648'
const REPORTER = 'b8100000-0000-4000-8000-000000000648'
const PAGE = 'c8100000-0000-4000-8000-000000000648'
const POST = 'd8100000-0000-4000-8000-000000000648'
const NOW = new Date()
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => NOW }) as ActionContext

let pool: Pool
let client: PoolClient

async function as<T>(role: 'anon' | 'authenticated', sql: string) {
  await client.query('begin')
  try {
    if (role === 'authenticated') await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: REPORTER, role })])
    await client.query(`set local role ${role}`)
    return (await client.query(sql)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b648-owner'], [REPORTER, 'b648-reporter']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','B648 Hall','b648-hall','Here.','active','listed',$2)`,
    [PAGE, OWNER],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [PAGE, OWNER])
  await client.query(`insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability) values ($1,$2,'A post that was reported','active','listed')`, [POST, PAGE])
  await client.query(
    `insert into public.content_origins (member_id, kind, ref, ip, created_at) values
       ($1,'post',$2,'203.0.113.7', now() - interval '13 months'),
       ($1,'post','b648-unheld','203.0.113.8', now() - interval '13 months')`,
    [OWNER, POST],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.legal_holds where group_id = $1`, [PAGE])
  await client.query(`delete from public.reports where subject_id = $1`, [POST])
  await client.query(`delete from public.member_notices where subject_id = $1`, [POST])
  await client.query(`delete from public.content_origins where member_id = $1`, [OWNER])
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, REPORTER]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, REPORTER]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#648 — child-safety content is preserved', () => {
  it('a Sensitive content report on a Post keeps its words, its poster and where it came from, for a year', async () => {
    await reportCreate(ctx(REPORTER), { subjectKind: 'post', category: 'sensitive_content', subjectId: POST, body: 'x' })
    const { rows } = await client.query(`select * from public.legal_holds where subject_id = $1`, [POST])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ subject_kind: 'post', group_id: PAGE, poster_member_id: OWNER, body: 'A post that was reported', origin_ip: '203.0.113.7' })
    const days = (new Date(rows[0].retain_until).getTime() - new Date(rows[0].held_at).getTime()) / 86_400_000
    expect(days).toBeGreaterThan(364)
  })

  it('a second report on the same item keeps the one hold', async () => {
    await client.query(`delete from public.reports where subject_id = $1 and reporter_member_id = $2`, [POST, REPORTER])
    await reportCreate(ctx(REPORTER), { subjectKind: 'post', category: 'sensitive_content', subjectId: POST, body: 'again' })
    expect((await client.query(`select 1 from public.legal_holds where subject_id = $1`, [POST])).rowCount).toBe(1)
  })

  it('no member, signed in or not, can read it', async () => {
    await expect(as('authenticated', `select id from public.legal_holds`)).rejects.toThrow(/permission denied/)
    await expect(as('anon', `select id from public.legal_holds`)).rejects.toThrow(/permission denied/)
  })

  it('the daily purge of old origins leaves a held item\'s alone and still clears the rest', async () => {
    await client.query(`select public.purge_content_origins()`)
    const left = await client.query(`select ref from public.content_origins where member_id = $1`, [OWNER])
    expect(left.rows.map((r) => r.ref)).toEqual([POST])
  })

  it('the operator records the number NCMEC gave, who and when, and the year restarts from that day', async () => {
    const report = (await client.query(`select id from public.reports where subject_id = $1 limit 1`, [POST])).rows[0].id
    const before = process.env.OPERATOR_MEMBER_ID
    process.env.OPERATOR_MEMBER_ID = REPORTER
    try {
      await expect(reportNcmecRecord(ctx(OWNER), { reportId: report, reportNumber: '555' })).rejects.toThrow(/not permitted/i)
      await reportNcmecRecord(ctx(REPORTER), { reportId: report, reportNumber: ' 987654321 ' })
    } finally {
      if (before === undefined) delete process.env.OPERATOR_MEMBER_ID
      else process.env.OPERATOR_MEMBER_ID = before
    }
    const { rows } = await client.query(`select * from public.legal_holds where subject_id = $1`, [POST])
    expect(rows[0]).toMatchObject({ ncmec_report_number: '987654321', ncmec_reported_by: REPORTER })
    expect(new Date(rows[0].ncmec_reported_at).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect((new Date(rows[0].retain_until).getTime() - Date.now()) / 86_400_000).toBeGreaterThan(364)
  })
})
