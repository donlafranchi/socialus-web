import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #486 — F100 criteria 5 and 7: assessments are readable by nobody but the
// operator's server connection, and agreement joins the latest AI read to the
// latest decision.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'no browser client reads an AI assessment, and agreement compares the latest read with the latest decision',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a6000000-0000-4000-8000-000000000486'
const REPORT_A = 'b6000000-0000-4000-8000-000000000486'
const REPORT_B = 'b6000000-0000-4000-8000-000000000487'
const SUBJECT = 'c6000000-0000-4000-8000-000000000486'

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string) {
  await client.query('begin')
  try {
    if (sub) {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    }
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b486@test.invalid','x',now(),now(),now())`,
    [MEMBER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b486','b486')`, [MEMBER])
  for (const r of [REPORT_A, REPORT_B]) {
    await client.query(
      `insert into public.reports (id, reporter_member_id, subject_kind, subject_id, body, category) values ($1,$2,'group',$3,'x','spam')`,
      [r, MEMBER, SUBJECT],
    )
  }
  // A: AI first said approve, then (later read) remove; the person removed it -> agree.
  await client.query(
    `insert into public.report_assessments (report_id, model, prompt_version, category, severity, confidence, outcome, reason, created_at) values
       ($1,'m','v','spam',4,0.5,'approve','r', now() - interval '2 minutes'),
       ($1,'m2','v','spam',4,0.9,'remove','r', now() - interval '1 minute')`,
    [REPORT_A],
  )
  await client.query(`insert into public.report_decisions (report_id, decided_by_member_id, outcome, reason_code) values ($1,$2,'removed','not_suitable')`, [REPORT_A, MEMBER])
  // B: AI said remove; the person restored it -> disagree.
  await client.query(
    `insert into public.report_assessments (report_id, model, prompt_version, category, severity, confidence, outcome, reason) values ($1,'m','v','spam',4,0.9,'remove','r')`,
    [REPORT_B],
  )
  await client.query(`insert into public.report_decisions (report_id, decided_by_member_id, outcome, reason_code) values ($1,$2,'restored','nothing_wrong')`, [REPORT_B, MEMBER])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.reports where id = any($1)`, [[REPORT_A, REPORT_B]])
  await client.query(`delete from public.members where id = $1`, [MEMBER])
  await client.query(`delete from auth.users where id = $1`, [MEMBER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#486 — report assessments', () => {
  it('a signed-in member reads no assessment', async () => {
    expect(await as(MEMBER, `select * from public.report_assessments`)).toHaveLength(0)
  })

  it('signed out, no assessment is returned and the agreement view cannot be read', async () => {
    // RLS with no policy answers an empty set; the view has no grant at all.
    expect(await as(null, `select * from public.report_assessments`)).toHaveLength(0)
    await expect(as(null, `select * from public.report_ai_agreement`)).rejects.toThrow(/permission denied/)
  })

  it('a signed-in member cannot read the agreement view', async () => {
    await expect(as(MEMBER, `select * from public.report_ai_agreement`)).rejects.toThrow(/permission denied/)
  })

  // [guards F100.7]
  it('agreement compares the latest read with the person\'s decision', async () => {
    const rows = await client.query(`select report_id, agree from public.report_ai_agreement where report_id = any($1)`, [[REPORT_A, REPORT_B]])
    const byId = Object.fromEntries(rows.rows.map((r) => [r.report_id, r.agree]))
    expect(byId[REPORT_A]).toBe(true)
    expect(byId[REPORT_B]).toBe(false)
  })
})
