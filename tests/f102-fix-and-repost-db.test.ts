import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { reportCreate, groupPostEdit } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'

// #649 — F102 criterion 2 (and 14): fix and repost shows the post again at once, its reports stay on the row, a second
// hide offers no second repost, and it is not offered for severity 1.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a poster\'s edit puts a hidden post back once, never twice and never for the most serious kind',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const OWNER = 'a9000000-0000-4000-8000-000000000649'
const R1 = 'b9000000-0000-4000-8000-000000000649'
const R2 = 'b9000000-0000-4000-8000-000000000650'
const PAGE = 'c9000000-0000-4000-8000-000000000649'
const POST_A = 'd9000000-0000-4000-8000-000000000001'
const POST_B = 'd9000000-0000-4000-8000-000000000002'

let pool: Pool
let client: PoolClient
const ctx = (id: string): ActionContext => ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => new Date() }) as ActionContext
const state = async (id: string) => (await client.query(`select discoverability, hidden_at, repost_used from public.page_posts where id = $1`, [id])).rows[0]

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, h] of [[OWNER, 'b649o'], [R1, 'b649a'], [R2, 'b649b']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${h}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
  }
  await client.query(
    `insert into public.groups (id, kind, name, slug, description, lifecycle_state, discoverability, founder_member_id)
     values ($1,'interest','B649 Hall','b649-hall','Here.','active','listed',$2)`,
    [PAGE, OWNER],
  )
  await client.query(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [PAGE, OWNER])
  for (const p of [POST_A, POST_B]) {
    await client.query(`insert into public.page_posts (id, group_id, body, lifecycle_state, discoverability) values ($1,$2,'A post','active','listed')`, [p, PAGE])
  }
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.report_answers where notice_id in (select id from public.member_notices where member_id = $1)`, [OWNER])
  await client.query(`delete from public.member_notices where member_id = $1`, [OWNER])
  await client.query(`delete from public.reports where subject_id = any($1)`, [[POST_A, POST_B]])
  await client.query(`delete from public.page_posts where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[OWNER, R1, R2]])
  await client.query(`delete from auth.users where id = any($1)`, [[OWNER, R1, R2]])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#649 — F102.2 fix and repost', () => {
  // [guards F102.2]
  it('shows an ordinary hide again at once with its reports kept, offers no second repost, and never offers one for severity 1', async () => {
    // Two members report the post: the second report hides it (#626).
    await reportCreate(ctx(R1), { subjectKind: 'post', category: 'spam', subjectId: POST_A, body: 'Looks like an ad.' })
    await reportCreate(ctx(R2), { subjectKind: 'post', category: 'spam', subjectId: POST_A, body: 'Same here.' })
    expect((await state(POST_A)).discoverability).toBe('private')

    const first = await groupPostEdit(ctx(OWNER), { postId: POST_A, body: 'Fixed words.' })
    expect(first.reposted).toBe(true)
    expect(await state(POST_A)).toMatchObject({ discoverability: 'listed', hidden_at: null, repost_used: true })
    expect((await client.query(`select count(*)::int as n from public.reports where subject_id = $1`, [POST_A])).rows[0].n).toBe(2)

    // A second hide on the same post offers no second repost.
    await client.query(`update public.page_posts set hidden_at = now(), hidden_prior_discoverability = discoverability, discoverability = 'private' where id = $1`, [POST_A])
    const second = await groupPostEdit(ctx(OWNER), { postId: POST_A, body: 'Fixed again.' })
    expect(second.reposted).toBe(false)
    expect((await state(POST_A)).discoverability).toBe('private')

    // Severity 1: hidden at once on Sensitive content, and no edit puts it back.
    await reportCreate(ctx(R1), { subjectKind: 'post', category: 'sensitive_content', subjectId: POST_B, body: 'x' })
    expect((await state(POST_B)).discoverability).toBe('private')
    const edited = await groupPostEdit(ctx(OWNER), { postId: POST_B, body: 'Changed words.' })
    expect(edited.reposted).toBe(false)
    expect(await state(POST_B)).toMatchObject({ discoverability: 'private', repost_used: false })
    expect((await client.query(`select count(*)::int as n from public.member_notices where subject_id = $1`, [POST_B])).rows[0].n).toBe(0)
  })
})
