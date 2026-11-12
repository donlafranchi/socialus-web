import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

// F077 criterion 2 — a peer sees the display name, never the legal name. The legal name is read by the
// signup gate and the profile form only; the one read a peer's screen makes of a founder returns no such column.

const DATABASE_URL = process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL
const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a Page shows its founder by display name and never by legal name',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const FOUNDER = 'aaaaaaaa-0000-4000-8000-0000000007f1'
const PEER = 'aaaaaaaa-0000-4000-8000-0000000007f2'
const PAGE = 'cccccccc-0000-4000-8000-0000000007f1'
const LEGAL = 'Zebediah Quillfeather Legalname'
const SHOWN = 'Zeb Q'

const ROOT = resolve(__dirname, '..')
const sources = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return f === 'node_modules' ? [] : sources(p)
    return /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f) ? [p] : []
  })

let pool: Pool
let client: PoolClient

async function as(role: 'anon' | 'authenticated', sql: string, params: unknown[] = [], sub = PEER) {
  await client.query('begin')
  try {
    if (role === 'authenticated') {
      await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub, role: 'authenticated' })])
    }
    await client.query(`set local role ${role}`)
    return (await client.query(sql, params)).rows as Record<string, unknown>[]
  } finally {
    await client.query('rollback')
  }
}

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  for (const [id, email] of [[FOUNDER, 'f077a@test.invalid'], [PEER, 'f077b@test.invalid']] as const) {
    await client.query(
      `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
      [id, email],
    )
  }
  await client.query(`insert into public.members (id, handle, display_name, legal_name, stakeholder_visibility) values ($1,'f077a',$2,$3,'public')`, [FOUNDER, SHOWN, LEGAL])
  await client.query(`insert into public.members (id, handle, display_name) values ($1,'f077b','Peer')`, [PEER])
  await client.query(
    `insert into public.groups (id, kind, name, slug, lifecycle_state, discoverability, founder_member_id)
     values ($1,'group','F077 Page','f077-page','active','listed',$2)`,
    [PAGE, FOUNDER],
  )
  await client.query(
    `insert into public.group_memberships (group_id, member_id, role, source, relationship) values ($1,$2,'steward','explicit','member'), ($1,$3,'member','explicit','member')`,
    [PAGE, FOUNDER, PEER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from public.group_events where group_id = $1`, [PAGE])
  await client.query(`delete from public.group_memberships where group_id = $1`, [PAGE])
  await client.query(`delete from public.groups where id = $1`, [PAGE])
  await client.query(`delete from public.members where id = any($1)`, [[FOUNDER, PEER]])
  await client.query(`delete from auth.users where id = any($1)`, [[FOUNDER, PEER]])
  client.release()
  await pool.end()
})

describe('F077 criterion 2 — the display name, never the legal name', () => {
  // [guards F077.2]
  it('the Started by read returns the display name and no legal-name column to a stranger or a peer, and no peer screen reads the legal name', async () => {
    if (!RUNNABLE) return
    // A stranger is handed nothing; the founder and a fellow member get the display name and no legal-name column.
    expect(await as('anon', `select * from public.page_founder_public($1)`, [PAGE])).toEqual([])
    for (const sub of [FOUNDER, PEER]) {
      const rows = await as('authenticated', `select * from public.page_founder_public($1)`, [PAGE], sub)
      expect(rows, sub).toHaveLength(1)
      expect(Object.keys(rows[0]!), sub).not.toContain('legal_name')
      expect(rows[0]!.display_name, sub).toBe(SHOWN)
      expect(JSON.stringify(rows), sub).not.toContain(LEGAL)
    }

    // The following list reads display_name, and the legal name is read only by the signup gate and profile form.
    const follows = readFileSync(join(ROOT, 'src/lib/follows/get-member-follows.ts'), 'utf8')
    expect(follows).toMatch(/select\('id, handle, display_name/)
    expect(follows).not.toMatch(/legal_?name/i)
    const readers = sources(join(ROOT, 'src'))
      .filter((p) => /legal_?name/i.test(readFileSync(p, 'utf8')))
      .map((p) => p.slice(ROOT.length + 1))
      .sort()
    expect(readers).toEqual([
      'src/app/admin/reports/ReportEntry.tsx',
      'src/lib/auth/legal-name.ts',
      'src/app/onboarding/page.tsx',
      'src/components/onboarding/OnboardingFlow.tsx',
      'src/lib/admin/reports-queue.ts',
      'src/lib/signup/profile.ts',
      'src/proxy.ts',
      'src/actions/member/signup-profile-set.ts',
    ].sort())
  })
})
