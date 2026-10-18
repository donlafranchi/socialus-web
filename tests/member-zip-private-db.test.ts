// F081.2 — the zip is stored and never reaches another member or a visitor. Absence of code proves nothing: a later
// view, function or page query can add it. So this watches the three ways it could: a row read past RLS, a view or
// function that hands it out, and a page or component that selects it from members for someone else.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "no visitor or other member reads a member's zip, through a row, a view or a function",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const A = 'a2000000-0000-4000-8000-000000000852'
const B = 'b2000000-0000-4000-8000-000000000852'
const ZIP = '95746'
const ROOT = resolve(__dirname, '..')

// The only code that reads members.zip: signup writes it, You shows the member their own, the zip change writes it.
const ZIP_READERS = new Set([
  'src/actions/member/signup-profile-set.ts',
  'src/actions/member/zip-set.ts',
  'src/app/you/page.tsx',
])
// Functions whose body touches members and a zip, and why each hands no zip to a caller.
const ZIP_FUNCTIONS: Record<string, string> = {
  backfill_home_towns: 'returns a count of rows updated, never a zip',
}

let pool: Pool
let client: PoolClient

async function as<T>(sub: string | null, sql: string, params: unknown[] = []) {
  await client.query('begin')
  try {
    if (sub) await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    await client.query(`set local role ${sub ? 'authenticated' : 'anon'}`)
    return (await client.query(sql, params)).rows as T[]
  } finally {
    await client.query('rollback')
  }
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })
}

/** Does this source select the zip from members, through supabase-js or SQL? */
function readsMemberZip(src: string): boolean {
  const js = /from\(\s*['"`]members['"`]\s*\)\s*\.select\(\s*(['"`])([^'"`]*)\1/g
  for (const m of src.matchAll(js)) if (/\bzip\b|\*/.test(m[2])) return true
  const sql = /`[^`]*`/g
  for (const m of src.matchAll(sql)) if (/\b(public\.)?members\b/i.test(m[0]) && /\bzip\b/i.test(m[0]) && /\bselect\b/i.test(m[0])) return true
  return false
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(`delete from public.members where id = any($1)`, [[A, B]]) // a run that died before its afterAll
  await client.query(`delete from auth.users where id = any($1)`, [[A, B]])
  for (const [id, handle] of [[A, 'z852a'], [B, 'z852b']]) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, `${handle}@test.invalid`],
    )
    await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, handle])
  }
  await client.query(`update public.members set zip = $1 where id = $2`, [ZIP, A])
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.members where id = any($1)`, [[A, B]])
  await client.query(`delete from auth.users where id = any($1)`, [[A, B]])
  client.release()
  await pool.end()
})

// [guards F081.2]
describe.skipIf(!RUNNABLE)('F081.2 — the zip never reaches another member or a visitor', () => {
  it('a visitor and another member read no zip from members; the member reads their own', async () => {
    expect(await as(null, `select zip from public.members where id = $1`, [A])).toEqual([])
    expect(await as(B, `select zip from public.members where id = $1`, [A])).toEqual([])
    expect(await as(B, `select id from public.members where zip = $1`, [ZIP])).toEqual([])
    expect(await as(A, `select zip from public.members where id = $1`, [A])).toEqual([{ zip: ZIP }])
  })

  it('no view in an exposed schema is built on members.zip', async () => {
    const views = await client.query(
      `select distinct vn.nspname || '.' || v.relname as view
         from pg_depend d
         join pg_rewrite r on r.oid = d.objid
         join pg_class v on v.oid = r.ev_class
         join pg_namespace vn on vn.oid = v.relnamespace
         join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
        where d.refobjid = 'public.members'::regclass and a.attname = 'zip' and v.oid <> 'public.members'::regclass`,
    )
    expect(views.rows).toEqual([])
  })

  it('no function a visitor or member can call reads members.zip, except the named ones that return no zip', async () => {
    const fns = await client.query(
      `select p.proname
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'graphql_public', 'api')
          and p.prosrc ~* '\\m(public\\.)?members\\M' and p.prosrc ~* '\\mzip\\M'
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))`,
    )
    const unexplained = fns.rows.map((r) => r.proname as string).filter((name) => !(name in ZIP_FUNCTIONS))
    expect(unexplained).toEqual([])
  })

  it('no page, component or action selects the zip from members outside signup, You and the zip change', () => {
    const readers = sources(join(ROOT, 'src'))
      .filter((p) => readsMemberZip(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1))
      .filter((p) => !ZIP_READERS.has(p))
    expect(readers).toEqual([])
  })

  it('the scan sees a zip read, by supabase-js or SQL', () => {
    expect(readsMemberZip("supabase.from('members').select('display_name, zip').eq('handle', h)")).toBe(true)
    expect(readsMemberZip("supabase.from('members').select('*')")).toBe(true)
    expect(readsMemberZip('client.query(`select m.zip from public.members m where m.handle = $1`)')).toBe(true)
    expect(readsMemberZip("supabase.from('members').select('display_name')")).toBe(false)
  })
})
