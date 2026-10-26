import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { resolveActionContext } from '@/lib/action-context'
import { groupPostCreate, reportCreate, wonderJoin, wonderLeave, wonderOffer, wonderOfferWithdraw, wonderOfferDecide } from '@/actions'

// F117 — Wonders v1 against a real database: a Wonder is a post kind, "I'm in" with a size, the count and bar,
// who sees the size split and the names, helper offers in the eight roles, the poster accepting, reports, no money.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a Wonder counts who is in, keeps names and sizes for its poster, and shows accepted helpers to everyone',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const id = (n: number) => `9${String(n).padStart(7, '0')}-0000-4000-8000-000000000117`
const POSTER = id(1), DANA = id(2), EVE = id(3), FRAN = id(4)
const PAGE = id(10), OTHER_PAGE = id(11)
const ctx = (m: string) => resolveActionContext({ actingMemberId: m })

let pool: Pool
let client: PoolClient
const q = (sql: string, p: unknown[] = []) => client.query(sql, p)

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await q('begin')
  try {
    if (sub) await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await q(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await q(sql, params)).rows as T[]
  } catch (err) {
    return (err as Error).message as unknown as T[]
  } finally {
    await q('rollback')
  }
}

type View = {
  total: number
  threshold: number
  options: string[]
  mine: { option: string | null } | null
  myOffers: { id: string; role: string; status: string }[]
  helpers: { name: string; role: string }[]
  byOption?: { option: string; count: number }[]
  people?: { name: string; option: string | null }[]
  offers?: { id: string; name: string; role: string; note: string | null; status: string }[]
}
const view = async (sub: string | null, postId: string) => {
  const rows = await as<{ v: View | null }>(sub, `select public.wonder_view($1) as v`, [postId])
  return Array.isArray(rows) ? rows[0]?.v ?? null : null
}

async function cleanup() {
  await q(`delete from public.reports where reporter_member_id = any($1)`, [[POSTER, DANA, EVE, FRAN]]).catch(() => undefined)
  await q(`delete from public.page_posts where group_id = any($1)`, [[PAGE, OTHER_PAGE]])
  await q(`delete from public.group_events where group_id = any($1)`, [[PAGE, OTHER_PAGE]]).catch(() => undefined)
  await q(`delete from public.group_memberships where group_id = any($1)`, [[PAGE, OTHER_PAGE]])
  await q(`delete from public.groups where id = any($1)`, [[PAGE, OTHER_PAGE]])
  await q(`delete from public.members where id = any($1)`, [[POSTER, DANA, EVE, FRAN]])
  await q(`delete from auth.users where id = any($1)`, [[POSTER, DANA, EVE, FRAN]])
}

let WONDER = ''
let PLAIN_WONDER = ''

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await cleanup()
  for (const [mid, h, name] of [[POSTER, 'w117-poster', 'Pat Poster'], [DANA, 'w117-dana', 'Dana'], [EVE, 'w117-eve', 'Eve'], [FRAN, 'w117-fran', 'Fran']]) {
    await q(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [mid, `${h}@test.invalid`],
    )
    await q(`insert into public.members (id, handle, display_name) values ($1,$2,$3) on conflict (id) do update set display_name = $3`, [mid, h, name])
  }
  for (const [gid, slug] of [[PAGE, 'w117-clothes'], [OTHER_PAGE, 'w117-other']]) {
    await q(`insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id) values ($1,'interest',$2,$2,'active','listed',$3)`, [gid, slug, POSTER])
    await q(`insert into public.group_memberships (group_id, member_id, role) values ($1,$2,'steward')`, [gid, POSTER])
  }
  WONDER = (await groupPostCreate(ctx(POSTER), {
    groupId: PAGE,
    body: "Clothes that fit men about 5'10\", bought in bulk at cost. Who's in? Who'll lead? Who'll design?",
    wonder: { threshold: 3, options: ['S', 'M', 'L'] },
  })).postId
  PLAIN_WONDER = (await groupPostCreate(ctx(POSTER), { groupId: PAGE, body: 'A shared tool library?', wonder: { threshold: 2 } })).postId
})

afterAll(async () => {
  if (!RUNNABLE) return
  await cleanup()
  client.release()
  await pool.end()
})

beforeEach(async () => {
  if (!RUNNABLE) return
  await q(`delete from public.wonder_interest where post_id = any($1)`, [[WONDER, PLAIN_WONDER]])
  await q(`delete from public.wonder_offers where post_id = any($1)`, [[WONDER, PLAIN_WONDER]])
  await q(`update public.page_posts set wonder_in_count = 0 where id = any($1)`, [[WONDER, PLAIN_WONDER]])
})

describe.skipIf(!RUNNABLE)('F117 — a Wonder', () => {
  // [guards F117.1]
  it('is a post kind on a Page its member manages: words, a whole-number threshold, optional sizes', async () => {
    const row = (await q(`select kind, wonder_threshold, wonder_options from public.page_posts where id = $1`, [WONDER])).rows[0]
    expect(row).toEqual({ kind: 'wonder', wonder_threshold: 3, wonder_options: ['S', 'M', 'L'] })
    expect((await q(`select kind, wonder_options from public.page_posts where id = $1`, [PLAIN_WONDER])).rows[0]).toEqual({ kind: 'wonder', wonder_options: null })
    await expect(groupPostCreate(ctx(DANA), { groupId: PAGE, body: 'Mine now', wonder: { threshold: 5 } })).rejects.toThrow(/manage/i)
    await expect(groupPostCreate(ctx(POSTER), { groupId: PAGE, body: 'Half', wonder: { threshold: 2.5 } })).rejects.toThrow()
    await expect(groupPostCreate(ctx(POSTER), { groupId: PAGE, body: 'None', wonder: { threshold: 0 } })).rejects.toThrow()
    await expect(q(`insert into public.page_posts (group_id, body, kind) values ($1, 'x', 'wonder')`, [PAGE])).rejects.toThrow()
  })

  // [guards F117.2]
  it("I'm in: once per member, one size when it has sizes; they can change their size or leave", async () => {
    await expect(wonderJoin(ctx(DANA), { postId: WONDER })).rejects.toThrow(/size/i)
    await expect(wonderJoin(ctx(DANA), { postId: WONDER, option: 'XXL' })).rejects.toThrow(/size/i)
    expect(await wonderJoin(ctx(DANA), { postId: WONDER, option: 'M' })).toEqual({ inCount: 1 })
    expect(await wonderJoin(ctx(DANA), { postId: WONDER, option: 'L' })).toEqual({ inCount: 1 })
    expect((await q(`select option from public.wonder_interest where post_id = $1 and member_id = $2`, [WONDER, DANA])).rows).toEqual([{ option: 'L' }])
    expect(await wonderJoin(ctx(EVE), { postId: PLAIN_WONDER })).toEqual({ inCount: 1 })
    expect(await wonderLeave(ctx(DANA), { postId: WONDER })).toEqual({ inCount: 0 })
    expect(await wonderLeave(ctx(DANA), { postId: WONDER })).toEqual({ inCount: 0 })
    await expect(wonderJoin(resolveActionContext({ actingMemberId: '' }), { postId: WONDER, option: 'M' })).rejects.toThrow()
  })

  // [guards F117.3]
  it('the count and the threshold reach anyone who can see the post, and keep counting past the threshold', async () => {
    for (const [m, o] of [[DANA, 'S'], [EVE, 'M'], [FRAN, 'M'], [POSTER, 'L']]) await wonderJoin(ctx(m), { postId: WONDER, option: o })
    const v = await view(FRAN, WONDER)
    expect(v).toMatchObject({ total: 4, threshold: 3 })
    expect(await as(EVE, `select wonder_in_count, wonder_threshold from public.page_posts where id = $1`, [WONDER])).toEqual([{ wonder_in_count: 4, wonder_threshold: 3 }])
    expect(await view(null, WONDER)).toBeNull()
  })

  // [guards F117.4]
  it('the poster sees the count per size; others see only the total', async () => {
    for (const [m, o] of [[DANA, 'S'], [EVE, 'M'], [FRAN, 'M']]) await wonderJoin(ctx(m), { postId: WONDER, option: o })
    expect((await view(POSTER, WONDER))!.byOption).toEqual([{ option: 'S', count: 1 }, { option: 'M', count: 2 }, { option: 'L', count: 0 }])
    const other = (await view(DANA, WONDER))!
    expect(other.total).toBe(3)
    expect(other.byOption).toBeUndefined()
  })

  // [guards F117.5]
  it('any signed-in member can offer one or more of the eight roles, with an optional one-line note', async () => {
    const r = await wonderOffer(ctx(EVE), { postId: WONDER, roles: ['designer', 'pattern_maker'], note: 'I sew samples at home.' })
    expect(r.offerIds).toHaveLength(2)
    await wonderOffer(ctx(EVE), { postId: WONDER, roles: ['designer'] })
    expect((await q(`select role, note, status from public.wonder_offers where post_id = $1 and member_id = $2 order by role`, [WONDER, EVE])).rows).toEqual([
      { role: 'designer', note: 'I sew samples at home.', status: 'pending' },
      { role: 'pattern_maker', note: 'I sew samples at home.', status: 'pending' },
    ])
    for (const role of ['lead', 'sourcing', 'quality', 'logistics', 'support', 'treasurer']) await wonderOffer(ctx(FRAN), { postId: WONDER, roles: [role as 'lead'] })
    await expect(wonderOffer(ctx(FRAN), { postId: WONDER, roles: ['ceo' as 'lead'] })).rejects.toThrow()
    await expect(wonderOffer(ctx(FRAN), { postId: WONDER, roles: [] })).rejects.toThrow()
    await expect(wonderOffer(ctx(FRAN), { postId: WONDER, roles: ['lead'], note: 'x'.repeat(141) })).rejects.toThrow()
    await expect(wonderOffer(resolveActionContext({ actingMemberId: '' }), { postId: WONDER, roles: ['lead'] })).rejects.toThrow()
  })

  // [guards F117.6]
  it('the poster accepts or declines each offer; accepted helpers show by name and role, the rest only to the poster and the offerer', async () => {
    const [designer] = (await wonderOffer(ctx(EVE), { postId: WONDER, roles: ['designer'] })).offerIds
    const [lead] = (await wonderOffer(ctx(DANA), { postId: WONDER, roles: ['lead'] })).offerIds
    const [declined] = (await wonderOffer(ctx(FRAN), { postId: WONDER, roles: ['quality'] })).offerIds
    await expect(wonderOfferDecide(ctx(DANA), { offerId: designer!, decision: 'accepted' })).rejects.toThrow(/manage/i)
    await wonderOfferDecide(ctx(POSTER), { offerId: designer!, decision: 'accepted' })
    await wonderOfferDecide(ctx(POSTER), { offerId: declined!, decision: 'declined' })

    expect((await view(FRAN, WONDER))!.helpers).toEqual([{ name: 'Eve', role: 'designer' }])
    expect((await view(FRAN, WONDER))!.myOffers).toEqual([{ id: declined, role: 'quality', status: 'declined' }])
    expect((await view(DANA, WONDER))!.myOffers).toEqual([{ id: lead, role: 'lead', status: 'pending' }])
    expect((await view(DANA, WONDER))!.offers).toBeUndefined()
    const posterOffers = (await view(POSTER, WONDER))!.offers!.map((o) => [o.name, o.role, o.status]).sort()
    expect(posterOffers).toEqual([['Dana', 'lead', 'pending'], ['Eve', 'designer', 'accepted'], ['Fran', 'quality', 'declined']])

    expect(await as(EVE, `select role from public.wonder_offers where post_id = $1 order by role`, [WONDER])).toEqual([{ role: 'designer' }])
    expect(await as(POSTER, `select count(*)::int as n from public.wonder_offers where post_id = $1`, [WONDER])).toEqual([{ n: 3 }])
    expect(String(await as(null, `select * from public.wonder_offers`))).toMatch(/permission denied/)

    expect(await wonderOfferWithdraw(ctx(FRAN), { offerId: lead! })).toEqual({ withdrawn: false })
    expect(await wonderOfferWithdraw(ctx(DANA), { offerId: lead! })).toEqual({ withdrawn: true })
  })

  // [guards F117.7]
  it("nobody sees who is in except the poster, who sees names and sizes; a member sees their own", async () => {
    await wonderJoin(ctx(DANA), { postId: WONDER, option: 'S' })
    await wonderJoin(ctx(EVE), { postId: WONDER, option: 'M' })
    expect((await view(POSTER, WONDER))!.people!.map((p) => [p.name, p.option]).sort()).toEqual([['Dana', 'S'], ['Eve', 'M']])
    const dana = (await view(DANA, WONDER))!
    expect(dana.mine).toEqual({ option: 'S' })
    expect(dana.people).toBeUndefined()
    expect((await view(FRAN, WONDER))!.mine).toBeNull()
    expect(await as(DANA, `select member_id, option from public.wonder_interest where post_id = $1`, [WONDER])).toEqual([{ member_id: DANA, option: 'S' }])
    expect(await as(FRAN, `select member_id from public.wonder_interest where post_id = $1`, [WONDER])).toEqual([])
    expect(await as(POSTER, `select count(*)::int as n from public.wonder_interest where post_id = $1`, [WONDER])).toEqual([{ n: 2 }])
    expect(String(await as(null, `select * from public.wonder_interest`))).toMatch(/permission denied/)
    // A hidden or deleted Wonder answers nobody but its managers.
    await q(`update public.page_posts set dissolved_at = now() where id = $1`, [PLAIN_WONDER])
    expect(await view(DANA, PLAIN_WONDER)).toBeNull()
    await q(`update public.page_posts set dissolved_at = null where id = $1`, [PLAIN_WONDER])
  })

  // [guards F117.8]
  it('is reportable like any post', async () => {
    const r = await reportCreate(ctx(FRAN), { subjectKind: 'post', category: 'spam', subjectId: WONDER, body: 'Looks like an ad.' })
    expect(r.reportId).toBeTruthy()
  })

  // [guards F117.9]
  it('takes, holds and promises no payment: no money column or call anywhere in the Wonder schema', async () => {
    const cols = (await q(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (table_name in ('wonder_interest', 'wonder_offers') or (table_name = 'page_posts' and column_name like 'wonder%'))`,
    )).rows.map((r) => `${r.table_name}.${r.column_name}`)
    expect(cols.length).toBeGreaterThan(8)
    for (const c of cols) expect(c).not.toMatch(/price|amount|cents|pledge|payment|paid|fee|stripe|money|budget|payout/i)
    const dir = join(__dirname, '..', 'supabase', 'migrations')
    const sql = readdirSync(dir).filter((f) => /_wonders\.sql$/.test(f)).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
    expect(sql).toMatch(/wonder_offers/)
    const code = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
    expect(code).not.toMatch(/price|amount|cents|pledge|payment|stripe|payout/i)
  })
})
