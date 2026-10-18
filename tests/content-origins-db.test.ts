import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.9, 10.0.0.1' }) }))
vi.mock('@/lib/supabase-server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'a8000000-0000-4000-8000-000000000488' } }, error: null }) } }),
}))
import { recordOrigin, recordUploadAction } from '@/app/_actions/origin-actions'

// F102 criterion 13 — the address a post came from is operator-only and gone
// after a year.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'no browser client reads where a post came from, and rows older than a year are purged',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const MEMBER = 'a8000000-0000-4000-8000-000000000488'

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string) {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

// The purge is table-wide: run it in a transaction that rolls back, so it never deletes another suite's rows mid-run.
async function rolledBack(fn: () => Promise<void>) {
  await client.query('begin')
  try {
    await fn()
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
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','b488@test.invalid','x',now(),now(),now())`,
    [MEMBER],
  )
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'b488o','b488o')`, [MEMBER])
  await client.query(
    `insert into public.content_origins (member_id, kind, ref, ip, created_at) values
       ($1,'post','recent','203.0.113.7', now() - interval '11 months'),
       ($1,'upload','old','203.0.113.7', now() - interval '13 months')`,
    [MEMBER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.content_origins where member_id = $1`, [MEMBER])
  await client.query(`delete from public.members where id = $1`, [MEMBER])
  await client.query(`delete from auth.users where id = $1`, [MEMBER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('F102 — content origins', () => {
  it('a member, even the one it is about, reads none of it', async () => {
    expect(await as(MEMBER, `select * from public.content_origins`)).toHaveLength(0)
  })

  it('signed out reads none of it', async () => {
    expect(await as(null, `select * from public.content_origins`)).toHaveLength(0)
  })

  it('no browser client can run the purge', async () => {
    const r = await client.query(
      `select has_function_privilege('authenticated', 'public.purge_content_origins(timestamptz)', 'execute') as a,
              has_function_privilege('anon', 'public.purge_content_origins(timestamptz)', 'execute') as b`,
    )
    expect(r.rows[0]).toEqual({ a: false, b: false })
  })

  // [guards F102.13 partial: the one-year deletion]
  it('the purge removes what is older than a year and keeps the rest', async () => {
    await rolledBack(async () => {
      const n = (await client.query(`select public.purge_content_origins() as n`)).rows[0].n
      expect(n).toBeGreaterThanOrEqual(1)
      const left = await client.query(`select ref from public.content_origins where member_id = $1`, [MEMBER])
      expect(left.rows.map((r) => r.ref)).toEqual(['recent'])
    })
  })
})

// #838 — the whole of F102 criterion 13 in one standing guard. Not here: the daily purge schedule, which stays off
// until the PM sets CONTENT_ORIGINS_PURGE_ENABLED (nothing is due before October 2027).
const ROOT = resolve(__dirname, '..')
const SRC = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return walk(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p.slice(ROOT.length + 1)] : []
  })
})(join(ROOT, 'src'))
const naming = (re: RegExp) => SRC.filter((p) => re.test(readFileSync(join(ROOT, p), 'utf8'))).sort()

// [guards F102.13]
describe.skipIf(!RUNNABLE)('F102.13 — every upload and post records its address and time, for the operator alone, for a year', () => {
  it('a post and an upload each store the address the request came from and when', async () => {
    const before = Date.now()
    await recordOrigin(MEMBER, 'post', 'b838-post')
    await recordUploadAction({ url: 'https://example.test/b838.webp' })
    const { rows } = await client.query(`select kind, ref, ip, created_at from public.content_origins where member_id = $1 and ref like '%b838%' order by kind`, [MEMBER])
    expect(rows.map((r) => [r.kind, r.ref, r.ip])).toEqual([['post', 'b838-post', '198.51.100.9'], ['upload', 'https://example.test/b838.webp', '198.51.100.9']])
    for (const r of rows) expect(new Date(r.created_at).getTime()).toBeGreaterThanOrEqual(before - 1000)
  })

  it('every member post and every member upload goes through the recorder', () => {
    expect(naming(/insert into public\.page_posts/)).toEqual(['src/actions/group/post.ts', 'src/lib/unclaimed/load.ts'])
    for (const f of naming(/groupPostCreate\(/).filter((p) => !p.startsWith('src/actions/'))) expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(/recordOrigin\(memberId, 'post', r\.postId\)/)
    expect(naming(/\.upload\(/)).toEqual(['src/lib/media/upload-image.ts', 'src/lib/unclaimed/upload.ts'])
    for (const f of naming(/from '@\/lib\/media\/upload-image'/)) expect(readFileSync(join(ROOT, f), 'utf8'), f).toMatch(/recordUploadAction\(/)
  })

  it('no member reads or writes it, signed in or out, the one it is about included', async () => {
    expect(await as(MEMBER, `select * from public.content_origins`)).toHaveLength(0)
    expect(await as(null, `select * from public.content_origins`)).toHaveLength(0)
    await expect(as(MEMBER, `insert into public.content_origins (member_id, kind, ref, ip) values ('${MEMBER}', 'post', 'x', '1.2.3.4')`)).rejects.toThrow()
  })

  it('kept a year, then deleted', async () => {
    await client.query(
      `insert into public.content_origins (member_id, kind, ref, ip, created_at) values
         ($1,'post','b838-young','203.0.113.7', now() - interval '364 days'),
         ($1,'post','b838-old','203.0.113.7', now() - interval '366 days')`,
      [MEMBER],
    )
    await rolledBack(async () => {
      await client.query(`select public.purge_content_origins()`)
      const left = (await client.query(`select ref from public.content_origins where member_id = $1 and ref like 'b838-%'`, [MEMBER])).rows.map((r) => r.ref).sort()
      expect(left).toEqual(['b838-post', 'b838-young'])
    })
  })

  it('shown to no member and read by no feature: only the recorder and the report path name it', () => {
    expect(naming(/content_origins/)).toEqual(['src/actions/origin/record.ts', 'src/actions/report/create.ts'])
    expect(naming(/originRecord|recordOrigin|recordUploadAction/).filter((p) => !/^src\/(actions\/(origin|index)|app\/_actions\/(origin|page-post)-actions|components\/media\/PagePhotoPicker)/.test(p))).toEqual([])
  })
})
