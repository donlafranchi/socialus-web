import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { reportDecide, reportReverse } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// #636 — F101 criterion 11: a decision on a row writes one report_decisions row per open report it closes,
// attributed and reversible as today.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'deciding a row with three open reports writes three attributed decisions, one per report, and each can be undone',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OP = 'a8000000-0000-4000-8000-000000000636'
const R1 = 'b8000000-0000-4000-8000-000000000636'
const R2 = 'b8000000-0000-4000-8000-000000000637'
const R3 = 'b8000000-0000-4000-8000-000000000638'
const PAGE = 'c8000000-0000-4000-8000-000000000636'
const POST = 'd8000000-0000-4000-8000-000000000636'
const REPORTS = ['e8000000-0000-4000-8000-000000000001', 'e8000000-0000-4000-8000-000000000002', 'e8000000-0000-4000-8000-000000000003']

let pool: Pool
let client: PoolClient
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext

beforeAll(async () => {
  if (!RUNNABLE) return
  process.env.OPERATOR_MEMBER_ID = OP
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OP, 'b636op'], [R1, 'b636r1'], [R2, 'b636r2'], [R3, 'b636r3']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','B636 Hall','b636-hall','Here.','active','listed',$2)`,
    [PAGE, R1],
  )
  await client.query(
    `insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability, hidden_at, hidden_prior_discoverability)
     values ($1,$2,'A post','active','private', now(), 'listed')`,
    [POST, PAGE],
  )
  for (const [i, r] of [R1, R2, R3].entries()) {
    await client.query(
      `insert into public.reports (id, reporter_member_id, subject_kind, subject_id, body, category) values ($1,$2,'post',$3,'x','spam')`,
      [REPORTS[i], r, POST],
    )
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.report_decisions where report_id = any($1)`, [REPORTS])
  await client.query(`delete from public.reports where id = any($1)`, [REPORTS])
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OP, R1, R2, R3]])
  await client.query(`delete from auth.users where id = any($1)`, [[OP, R1, R2, R3]])
  client.release()
  await pool.end()
})

const decisions = async () =>
  (await client.query(`select report_id, outcome, reason_code, decided_by_member_id, reverses_decision_id from public.report_decisions where report_id = any($1) order by decided_at`, [REPORTS])).rows

describe.skipIf(!RUNNABLE)('#636 — F101.11 one decision per open report', () => {
  // [guards F101.11]
  it('deciding the row closes each of its three open reports with its own attributed decision, and every one can be undone', async () => {
    // What the page does for a row: one decision per open report, with the row's default reason.
    for (const id of REPORTS) await reportDecide(ctx(OP), { reportId: id, outcome: 'removed', reasonCode: 'not_suitable' })
    const made = await decisions()
    expect(made).toHaveLength(3)
    expect(made.map((d) => d.report_id).sort()).toEqual([...REPORTS].sort())
    for (const d of made) expect(d).toMatchObject({ outcome: 'removed', reason_code: 'not_suitable', decided_by_member_id: OP, reverses_decision_id: null })
    // Reversible, as today: each decision takes its own reversal.
    const ids = (await client.query(`select id, report_id from public.report_decisions where report_id = any($1) and reverses_decision_id is null`, [REPORTS])).rows
    for (const d of ids) await reportReverse(ctx(OP), { decisionId: d.id, reasonCode: 'reported_by_mistake' })
    const all = await decisions()
    expect(all).toHaveLength(6)
    expect(all.filter((d) => d.reverses_decision_id !== null)).toHaveLength(3)
  })
})
