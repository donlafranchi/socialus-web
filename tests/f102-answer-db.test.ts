import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { reportCreate } from '@/actions'
import { fetchReviewQueue } from '@/lib/admin/reports-queue'
import { groupBySubject } from '@/lib/admin/review-subjects'
import type { ActionContext } from '@/actions/_lib/context'

// #838 — F102 criterion 3 (3a): the poster says the report is wrong. One answer per hide; it goes to the AI pass and
// onto the operator's row; the content stays hidden until a person decides. The three reasons and the note are
// retired: the PM's one "This is a mistake" button replaced them (#626, 2026-10-11).

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'the poster\'s one answer reaches the AI and the operator\'s row, and the post stays hidden',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const { signedIn } = vi.hoisted(() => ({ signedIn: { id: '' } }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: signedIn.id } }, error: null }) } }),
}))
import { answerNoticeAction } from '@/app/_actions/report-actions'

const OWNER = 'a9000000-0000-4000-8000-000000000838'
const R1 = 'b9000000-0000-4000-8000-000000000838'
const R2 = 'b9000000-0000-4000-8000-000000000839'
const PAGE = 'c9000000-0000-4000-8000-000000000838'
const POST = 'd9000000-0000-4000-8000-000000000838'

let pool: Pool
let client: PoolClient
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b838o'], [R1, 'b838a'], [R2, 'b838b']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','B838 Hall','b838-hall','Here.','active','listed',$2)`,
    [PAGE, OWNER],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [PAGE, OWNER])
  await client.query(`insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability) values ($1,$2,'Fresh bread today','active','listed')`, [POST, PAGE])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.report_answers where notice_id in (select id from public.member_notices where member_id = $1)`, [OWNER])
  await client.query(`delete from public.member_notices where member_id = $1`, [OWNER])
  await client.query(`delete from public.reports where subject_id = $1`, [POST])
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, R1, R2]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, R1, R2]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#838 — F102.3 the poster says the report is wrong', () => {
  // [guards F102.3]
  it('one answer per hide, read by the AI with the reply and shown on the operator\'s row, and the post stays hidden until a person decides', async () => {
    await reportCreate(ctx(R1), { subjectKind: 'post', category: 'spam', subjectId: POST, body: 'spam' })
    const { reportId } = await reportCreate(ctx(R2), { subjectKind: 'post', category: 'spam', subjectId: POST, body: 'spam again' })
    const hidden = async () => (await client.query(`select hidden_at, discoverability from public.page_posts where id = $1`, [POST])).rows[0]
    expect((await hidden()).hidden_at).not.toBeNull()
    const notice = (await client.query(`select id from public.member_notices where member_id = $1 and kind = 'content_hidden' and subject_id = $2`, [OWNER, POST])).rows[0].id

    // The AI pass: an unsure read (not a restore candidate), so nothing but a person can put it back.
    const bodies: string[] = []
    const verdict = { category: 'spam', severity: 4, confidence: 0.6, outcome: 'approve', reason: 'Looks like an ordinary post.' }
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      bodies.push(init.body)
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'assess', input: verdict }], usage: {} }), { status: 200 })
    }))
    const key = process.env.ANTHROPIC_MODERATION_KEY
    process.env.ANTHROPIC_MODERATION_KEY = 'test-only'
    signedIn.id = OWNER
    try {
      await answerNoticeAction({ noticeId: notice })
      const deadline = Date.now() + 10_000
      while (Date.now() < deadline && (await client.query(`select 1 from public.report_ai_restore_checks where report_id = $1`, [reportId])).rowCount === 0) {
        await new Promise((r) => setTimeout(r, 100))
      }
    } finally {
      if (key === undefined) delete process.env.ANTHROPIC_MODERATION_KEY
      else process.env.ANTHROPIC_MODERATION_KEY = key
      vi.unstubAllGlobals()
    }
    // The reply went to the AI with the item, and its read is stored against the report.
    expect(bodies.length).toBeGreaterThan(0)
    for (const b of bodies) expect(JSON.parse(b).messages[0].content.at(-1).text).toContain("Poster's reply: The owner says this is a mistake.")
    expect((await client.query(`select 1 from public.report_assessments where report_id = $1 and model is not null`, [reportId])).rowCount).toBeGreaterThan(0)

    // One answer per hide: a second is refused and nothing more is written.
    await expect(answerNoticeAction({ noticeId: notice })).rejects.toThrow(/answered already/)
    expect((await client.query(`select kind from public.report_answers where notice_id = $1`, [notice])).rows).toEqual([{ kind: 'mistake' }])

    // Onto the row: the operator sees the answer beside the hidden post, still waiting for a person.
    const row = groupBySubject(await fetchReviewQueue(200, { includeBuilders: true })).find((s) => s.subjectId === POST)!
    expect(row.answer).toMatchObject({ kind: 'mistake' })
    expect(row.status).toBe('hidden')
    expect(row.openReportIds).toContain(reportId)

    // The content stays hidden: no decision, and the post is still down.
    expect((await client.query(`select 1 from public.report_decisions d join public.reports r on r.id = d.report_id where r.subject_id = $1`, [POST])).rowCount).toBe(0)
    expect(await hidden()).toMatchObject({ discoverability: 'private' })
    expect((await hidden()).hidden_at).not.toBeNull()
  })
})
