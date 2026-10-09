import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// #488 — F102 criterion 12: the clearance flag ships false, an AI decision needs
// no member but a person's still needs one, and the AI's restore never counts as
// a person agreeing with it.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the severity-4 restore is off by default and its decisions are attributable',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a8000000-0000-4000-8000-000000000488'
const REPORT = 'b8000000-0000-4000-8000-000000000488'
const REPORT_B = 'b8000000-0000-4000-8000-000000000489'
const SUBJECT = 'c8000000-0000-4000-8000-000000000488'

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b488@test.invalid','x',now(),now(),now())`,
    [MEMBER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b488','b488')`, [MEMBER])
  for (const r of [REPORT, REPORT_B]) {
    await client.query(
      `insert into public.reports (id, reporter_member_id, subject_kind, subject_id, body, category) values ($1,$2,'group',$3,'x','spam')`,
      [r, MEMBER, SUBJECT],
    )
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.reports where id = any($1)`, [[REPORT, REPORT_B]])
  await client.query(`delete from public.members where id = $1`, [MEMBER])
  await client.query(`delete from auth.users where id = $1`, [MEMBER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#488 — severity-4 auto-restore data', () => {
  // [guards F102.12 partial: the data default; the gate is unit-tested]
  it('the clearance flag is false on a fresh row, so nothing is cleared until an operator says so', async () => {
    const { rows } = await client.query(
      `select column_default, is_nullable from information_schema.columns
        where table_schema = 'public' and table_name = 'moderation_settings' and column_name = 'severity4_restore_cleared'`,
    )
    expect(rows[0]).toEqual({ column_default: 'false', is_nullable: 'NO' })
  })

  it('a decision with no member must be marked as the AI\'s, and a member\'s must not be', async () => {
    await expect(
      client.query(`insert into public.report_decisions (report_id, decided_by_member_id, outcome, reason_code) values ($1, null, 'restored', 'nothing_wrong')`, [REPORT]),
    ).rejects.toThrow(/report_decisions_attributed/)
    await expect(
      client.query(`insert into public.report_decisions (report_id, decided_by_member_id, decided_by_ai, outcome, reason_code) values ($1, $2, true, 'restored', 'nothing_wrong')`, [REPORT, MEMBER]),
    ).rejects.toThrow(/report_decisions_attributed/)
    await client.query(
      `insert into public.report_decisions (report_id, decided_by_member_id, decided_by_ai, outcome, reason_code) values ($1, null, true, 'restored', 'nothing_wrong')`,
      [REPORT],
    )
  })

  it('a block must say why, and a restore must not', async () => {
    await expect(client.query(`insert into public.report_ai_restore_checks (report_id, result) values ($1,'blocked')`, [REPORT])).rejects.toThrow(/says_why/)
    await expect(client.query(`insert into public.report_ai_restore_checks (report_id, result, blocked_by) values ($1,'restored','{shadow}')`, [REPORT])).rejects.toThrow(/says_why/)
    await client.query(`insert into public.report_ai_restore_checks (report_id, result, blocked_by) values ($1,'would_restore','{shadow}')`, [REPORT_B])
  })

  it('the AI\'s own restore is not a person agreeing with it; the person\'s later decision is', async () => {
    await client.query(`insert into public.report_ai_restore_checks (report_id, result) values ($1,'restored')`, [REPORT])
    expect((await client.query(`select 1 from public.report_ai_restore_agreement where report_id = $1`, [REPORT])).rows).toHaveLength(0)
    await client.query(
      `insert into public.report_decisions (report_id, decided_by_member_id, decided_at, outcome, reason_code) values ($1,$2, now() + interval '1 minute','removed','spam')`,
      [REPORT, MEMBER],
    )
    const { rows } = await client.query(`select person_decision, agree from public.report_ai_restore_agreement where report_id = $1`, [REPORT])
    expect(rows[0]).toEqual({ person_decision: 'removed', agree: false })
  })

  it('no API role reads the checks or their agreement view', async () => {
    await client.query('begin')
    try {
      await client.query(`set local role authenticated`)
      expect((await client.query(`select * from public.report_ai_restore_checks`)).rows).toHaveLength(0)
      await expect(client.query(`select * from public.report_ai_restore_agreement`)).rejects.toThrow(/permission denied/)
    } finally {
      await client.query('rollback')
    }
  })
})
