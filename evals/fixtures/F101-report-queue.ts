// F101.15 — 50 reported Posts waiting in the operator's queue.
//
// Made through the handlers a member uses (groupPostCreate for the Posts,
// reportCreate for the reports), not by seed SQL. Only the reporters are rows
// written directly: a report is capped at 5 hidden per reporter, so 50 hidden
// Posts need 10 of them.

import { Pool } from 'pg'
import { groupPostCreate, reportCreate } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'
import { persona } from '../personas'

export const COUNT = 50
export const TAG = 'F101-15'
const REPORTERS = 10
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const reporterId = (i: number) => `0a000000-0000-4000-8000-0000000101${String(i).padStart(2, '0')}`
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext

export async function seedReportQueue(): Promise<void> {
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(DATABASE_URL)
  if (!local) throw new Error('F101 fixture writes rows: local database only')
  const pool = new Pool({ connectionString: DATABASE_URL })
  try {
    const owner = persona('ownerBusiness').id!
    const { rows } = await pool.query<{ id: string }>(`select id from public.groups where id = '0b000000-0000-4000-8000-000000000001'`)
    const group = rows[0]!.id
    const old = `(select id from public.page_posts where body like '${TAG} %')`
    await pool.query(`delete from public.report_decisions where report_id in (select id from public.reports where subject_id in ${old})`)
    await pool.query(`delete from public.reports where subject_id in ${old}`)
    await pool.query(`delete from public.member_notices where subject_id in ${old}`)
    await pool.query(`delete from public.page_posts where body like '${TAG} %'`)
    await pool.query(`delete from public.reports where reporter_member_id = any($1)`, [Array.from({ length: REPORTERS }, (_, i) => reporterId(i))])
    for (let i = 0; i < REPORTERS; i++) {
      const id = reporterId(i)
      await pool.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
         values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now()) on conflict do nothing`,
        [id, `f101-15-reporter-${i}@example.test`],
      )
      await pool.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2) on conflict do nothing`, [id, `f101-15-reporter-${i}`])
    }
    for (let n = 0; n < COUNT; n++) {
      const post = await groupPostCreate(ctx(owner), { groupId: group, body: `${TAG} item ${n + 1}: a Post somebody flagged.` })
      await reportCreate(ctx(reporterId(n % REPORTERS)), { subjectKind: 'post', category: 'spam', subjectId: (post as unknown as { postId: string }).postId, body: `${TAG} report ${n + 1}` })
    }
  } finally {
    await pool.end()
  }
}

export async function decidedCount(): Promise<number> {
  const pool = new Pool({ connectionString: DATABASE_URL })
  try {
    const { rows } = await pool.query<{ n: string }>(
      `select count(distinct d.report_id) n from public.report_decisions d join public.reports r on r.id = d.report_id where r.body like '${TAG} report %'`,
    )
    return Number(rows[0]!.n)
  } finally {
    await pool.end()
  }
}
