import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { memberPostCreate, memberPostWithdraw, memberPostAnswer, reportCreate, reportDecide } from '@/actions'
import type { ActionContext } from '@/actions/_lib/context'
import { fetchReviewQueue } from '@/lib/admin/reports-queue'
import { METRO_TIME_ZONE, metroWallTimeToInstant } from '@/lib/metro/metro-time'
import { metroDate, shiftDays } from '@/lib/metro/metro-week'

// #1183 — a member posts without a Page (plan #270 B), through the real handlers and the one read path: the phone
// check first, a life of its own, a few live at once, signed with display name and neighborhood only, answered
// without comments, and reportable on the courtesy-first path.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a member posts without a Page, signed with name and neighborhood, and it expires, caps and reports',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const POSTER = 'a8000000-0000-4000-8000-000000001183'
const READER = 'b8000000-0000-4000-8000-000000001183'
const OTHER = 'c8000000-0000-4000-8000-000000001183'
const NO_PHONE = 'd8000000-0000-4000-8000-000000001183'
const OPERATOR = 'e8000000-0000-4000-8000-000000001183'
const HOOD = 'f8000000-0000-4000-8000-000000001183'
const CITY = 'f8000000-0000-4000-8000-000000001184'
const MEMBERS = [POSTER, READER, OTHER, NO_PHONE, OPERATOR]

const NOW = new Date()
const DAY = 86_400_000
const TODAY = metroDate(NOW, METRO_TIME_ZONE)
const SALE_DAY = shiftDays(TODAY, 2)

let pool: Pool
let client: PoolClient
const ctx = (id: string, now = NOW): ActionContext =>
  ({ actingMemberId: id, viaDelegationId: null, traceId: 't', db: {} as never, now: () => now }) as ActionContext

type Read = Record<string, unknown> & { id: string }
async function read(sub: string | null, args: { place?: string; post?: string; search?: string } = { place: HOOD }): Promise<Read[]> {
  await client.query('begin')
  try {
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: sub ? 'authenticated' : 'anon' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    const r = await client.query<{ j: Read[] }>(`select public.member_posts_read(p_place_id => $1, p_post_id => $2, p_search => $3) as j`, [
      args.place ?? null,
      args.post ?? null,
      args.search ?? null,
    ])
    return r.rows[0]!.j
  } finally {
    await client.query('rollback')
  }
}

const post = (who: string, input: Partial<Parameters<typeof memberPostCreate>[1]> = {}, now = NOW) =>
  memberPostCreate(ctx(who, now), { kind: 'lost_found', body: 'Grey cat, white paws, answers to Miso.', placeId: HOOD, ...input })

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [i, id] of MEMBERS.entries()) {
    const h = `m1183-${id.slice(0, 2)}`
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, phone, phone_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),$3,$4,now(),now())`,
      [id, `${h}@test.invalid`, id === NO_PHONE ? null : `191655511${i}3`, id === NO_PHONE ? null : new Date()],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$3)`, [id, h, id === POSTER ? 'Rosa P' : h])
  }
  await client.query(
    `insert into public.places (id, slug, display_name, kind, geography, centroid) values
       ($1, 'm1183-hood', 'Curtis Park', 'neighborhood',
        ST_GeogFromText('MULTIPOLYGON(((-121.50 38.55, -121.48 38.55, -121.48 38.56, -121.50 38.56, -121.50 38.55)))'),
        ST_GeogFromText('POINT(-121.49 38.555)')),
       ($2, 'm1183-city', 'Elsewhere', 'region', null, null)`,
    [HOOD, CITY],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  const posts = `(select id from public.member_posts where member_id = any($1))`
  await client.query(`delete from public.report_decisions where report_id in (select id from public.reports where subject_id in ${posts})`, [MEMBERS])
  await client.query(`delete from public.member_notices where member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.reports where reporter_member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.member_posts where member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.member_events where member_id = any($1)`, [MEMBERS])
  await client.query(`delete from public.places where id = any($1)`, [[HOOD, CITY]])
  // List labels this file was first to use: dropped when nothing else holds them, else handed to another member.
  await client.query(
    `delete from public.tags t where t.created_by = any($1)
       and not exists (select 1 from public.page_tags x where x.tag_id = t.id)
       and not exists (select 1 from public.post_tags x where x.tag_id = t.id)
       and not exists (select 1 from public.member_post_tags x where x.tag_id = t.id)`,
    [MEMBERS],
  )
  await client.query(`update public.tags set created_by = (select id from public.members where id <> all($1) limit 1) where created_by = any($1)`, [MEMBERS])
  await client.query(`delete from public.members where id = any($1)`, [MEMBERS])
  await client.query(`delete from auth.users where id = any($1)`, [MEMBERS])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#1183 — posting without a Page', () => {
  let lost: string

  it('asks for a confirmed phone first, every time', async () => {
    await expect(post(NO_PHONE)).rejects.toThrow('Confirm your phone number before you post.')
  })

  it('posts a kind, in a neighborhood, listed under the shared list', async () => {
    lost = (await post(POSTER)).postId
    const row = (await client.query(`select kind, expires_at, labels_pinned from public.member_posts where id = $1`, [lost])).rows[0]
    expect(row.kind).toBe('lost_found')
    expect(new Date(row.expires_at).getTime()).toBe(NOW.getTime() + 7 * DAY)
    const labels = (await client.query(`select t.label from public.member_post_tags x join public.tags t on t.id = x.tag_id where x.post_id = $1`, [lost])).rows
    expect(labels.length).toBeGreaterThan(0)
  })

  it('a neighborhood only, never a city or a free-typed place', async () => {
    await expect(post(POSTER, { placeId: CITY })).rejects.toThrow('Pick a neighborhood.')
  })

  it('a label off the list is refused', async () => {
    await expect(post(POSTER, { tags: ['sourdough'] })).rejects.toThrow('Pick where it’s listed from the list.')
  })

  it('a street only on a yard sale with its day, and the sale ends with its day', async () => {
    await expect(post(POSTER, { kind: 'lost_found', street: '2700 Portola Way' })).rejects.toThrow('A street goes only on a sale with its day.')
    await expect(post(POSTER, { kind: 'free_sale', street: '2700 Portola Way' })).rejects.toThrow('A street goes only on a sale with its day.')
    await expect(post(POSTER, { kind: 'free_sale', saleOn: shiftDays(TODAY, 20) })).rejects.toThrow('Pick a day in the next two weeks.')
    const sale = (await post(POSTER, { kind: 'free_sale', body: 'Yard sale: tools, books, a crib.', saleOn: SALE_DAY, street: '2700 Portola Way' })).postId
    const row = (await client.query(`select expires_at from public.member_posts where id = $1`, [sale])).rows[0]
    // The end of the sale's day, in the metro's time.
    expect(new Date(row.expires_at).getTime()).toBe(Date.parse(metroWallTimeToInstant(shiftDays(SALE_DAY, 1), '00:00', METRO_TIME_ZONE)!))
    const seen = (await read(READER, { post: sale }))[0]!
    expect(seen.street).toBe('2700 Portola Way')
  })

  it('a few live at once: the fourth waits until one comes down', async () => {
    await post(POSTER, { kind: 'ask', body: 'Who fixes old bikes around here?' })
    await expect(post(POSTER, { kind: 'ask', body: 'A good tailor?' })).rejects.toThrow('You have 3 posts up. Take one down to post another.')
  })

  it('signed with display name and neighborhood, never a member id, to signed-in readers only', async () => {
    const seen = (await read(READER)).find((p) => p.id === lost)!
    expect(seen).toMatchObject({ kind: 'lost_found', displayName: 'Rosa P', placeName: 'Curtis Park', mine: false, answers: null })
    expect(JSON.stringify(seen)).not.toContain(POSTER)
    expect(await read(null)).toEqual([])
  })

  it('search finds it by its words', async () => {
    expect((await read(READER, { place: HOOD, search: 'miso' })).map((p) => p.id)).toContain(lost)
    expect((await read(READER, { place: HOOD, search: 'zzqx' }))).toEqual([])
  })

  it('answered without comments; only the poster sees who, by display name', async () => {
    await memberPostAnswer(ctx(READER), { postId: lost, on: true })
    expect((await read(READER, { post: lost }))[0]).toMatchObject({ answered: true, answers: null })
    const mine = (await read(POSTER, { post: lost }))[0]!
    expect(mine.mine).toBe(true)
    expect((mine.answers as { displayName: string }[]).map((a) => a.displayName)).toEqual(['m1183-b8'])
    await expect(memberPostAnswer(ctx(POSTER), { postId: lost, on: true })).rejects.toThrow()
  })

  it('fades on its own: gone from everyone but its poster once it expires', async () => {
    const old = (await post(OTHER, { body: 'Found keys on 4th Ave.' })).postId
    await client.query(`update public.member_posts set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1`, [old])
    expect((await read(READER)).map((p) => p.id)).not.toContain(old)
    expect((await read(OTHER, { post: old }))[0]).toMatchObject({ ended: true })
  })

  it('the poster takes it down, which frees a place under the cap', async () => {
    await memberPostWithdraw(ctx(POSTER), { postId: lost })
    expect((await read(READER)).map((p) => p.id)).not.toContain(lost)
    await expect(memberPostWithdraw(ctx(READER), { postId: lost })).rejects.toThrow()
    await post(POSTER, { kind: 'ask', body: 'A good tailor?' })
  })
})

describe.skipIf(!RUNNABLE)('#1183 — reporting a post from a member', () => {
  let id: string

  beforeAll(async () => {
    if (!RUNNABLE) return
    id = (await post(OTHER, { kind: 'free_sale', body: 'Free couch, curb alert.' })).postId
  })

  it('a first report sends the poster a courtesy notice and the post stays up', async () => {
    await reportCreate(ctx(READER), { subjectKind: 'member_post', subjectId: id, category: 'spam', body: 'Spam.' })
    const n = (await client.query(`select kind, page_id from public.member_notices where member_id = $1 and subject_id = $2`, [OTHER, id])).rows
    expect(n).toEqual([{ kind: 'courtesy', page_id: null }])
    expect((await read(READER)).map((p) => p.id)).toContain(id)
  })

  it('a second report from someone else hides it, and the operator sees it queued with its words', async () => {
    await reportCreate(ctx(POSTER), { subjectKind: 'member_post', subjectId: id, category: 'spam', body: 'Spam again.' })
    expect((await read(READER)).map((p) => p.id)).not.toContain(id)
    const queued = (await fetchReviewQueue(200, { includeBuilders: true })).filter((q) => q.subjectId === id)
    expect(queued.length).toBeGreaterThan(0)
    expect(queued[0]).toMatchObject({ subjectKind: 'member_post', groupId: null, ownerDisplayName: 'm1183-c8' })
  })

  it('a restore puts it back', async () => {
    const reportId = (await client.query(`select id from public.reports where subject_id = $1 order by created_at limit 1`, [id])).rows[0].id
    process.env.OPERATOR_MEMBER_ID = OPERATOR
    await reportDecide(ctx(OPERATOR), { reportId, outcome: 'restored', reasonCode: 'nothing_wrong' })
    expect((await read(READER)).map((p) => p.id)).toContain(id)
  })
})
