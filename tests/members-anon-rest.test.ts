// #178 — a member marked private is not handed to a stranger, asked of the
// database over the wire.
//
// Same reasoning as tests/announcements-signed-out-rest.test.ts: `members` is
// served by PostgREST on a `*.supabase.co` origin with a publishable key that
// ships in our own JavaScript, so the only check that means anything is one
// that CALLS the endpoint anonymously. The production half of this check is
// scripts/probe-anon-members.sh; this is the same question asked of a local
// instance, so it can run on every change.
//
// What this suite does NOT assert: which columns a stranger sees on a public
// member, or what `community_only` means to a signed-in viewer. Both are
// unruled (#178). It asserts only that the column's own default — private —
// is honoured for anon, and that signed-in reads are unchanged.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { requireRunnable } from './support/runnable'
import { writeSafety } from './support/write-safe'

const SUPABASE_URL = process.env.SUPABASE_URL
const ANON_KEY = process.env.SUPABASE_ANON_KEY
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY
const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = writeSafety(process.env)
const RUNNABLE = requireRunnable({
  claim:
    'an anonymous caller cannot read a member marked private or community_only, ' +
    'while a signed-in member still can',
  available: safety.safe && Boolean(DATABASE_URL),
  remedy: `${safety.reason} DATABASE_URL must also be set. Recipe in .env.local.example`,
})

const PRIVATE = 'aaaaaaaa-0000-4000-8000-000000000178'
const COMMUNITY = 'bbbbbbbb-0000-4000-8000-000000000178'
const PUBLIC = 'cccccccc-0000-4000-8000-000000000178'
const OURS = [PRIVATE, COMMUNITY, PUBLIC]
const READER_EMAIL = 'b178-reader@test.invalid'
const READER_PASSWORD = 'b178-reader-password-not-a-secret'

let pool: Pool
let client: PoolClient
let anon: SupabaseClient
let readerId: string

describe.skipIf(!RUNNABLE)('#178 — members, signed out, over PostgREST', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL })
    client = await pool.connect()

    for (const id of OURS) {
      await client.query(
        `insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
           email_confirmed_at, created_at, updated_at)
         values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
        [id, `b178-${id.slice(0, 8)}@test.invalid`],
      )
    }
    // Inserted with the column's own default for PRIVATE — that is the row
    // every real signup produces, and the one the seeds never do (bug #175).
    await client.query(`insert into public.members (id, handle, display_name) values ($1,'b178-private','b178 private')`, [PRIVATE])
    await client.query(
      `insert into public.members (id, handle, display_name, stakeholder_visibility)
       values ($1,'b178-community','b178 community','community_only'),
              ($2,'b178-public','b178 public','public')`,
      [COMMUNITY, PUBLIC],
    )

    const admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const created = await admin.auth.admin.createUser({
      email: READER_EMAIL,
      password: READER_PASSWORD,
      email_confirm: true,
    })
    if (created.error) throw created.error
    readerId = created.data.user!.id

    anon = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
  })

  afterAll(async () => {
    if (!RUNNABLE) return
    await client.query(`delete from public.members where id = any($1)`, [[...OURS, readerId]])
    await client.query(`delete from auth.users where id = any($1)`, [[...OURS, readerId]])
    client.release()
    await pool.end()
  })

  const anonRead = async (id: string) => {
    const { data, error } = await anon.from('members').select('id').eq('id', id)
    // A refusal and an empty set are both acceptable answers; a row is not.
    return error ? [] : (data ?? [])
  }

  it('returns no row for a member left at the default, private', async () => {
    expect(await anonRead(PRIVATE)).toHaveLength(0)
  })

  it('returns no row for a member marked community_only', async () => {
    expect(await anonRead(COMMUNITY)).toHaveLength(0)
  })

  it('cannot be walked around by filtering or paging the whole table', async () => {
    const { data } = await anon.from('members').select('id, stakeholder_visibility').range(0, 999)
    const leaked = (data ?? []).filter((r) => r.stakeholder_visibility !== 'public')
    expect(leaked).toEqual([])
  })

  it('still returns a member marked public', async () => {
    expect(await anonRead(PUBLIC)).toHaveLength(1)
  })

  it('still returns a private member to a signed-in member', async () => {
    const member = createClient(SUPABASE_URL!, ANON_KEY!, { auth: { persistSession: false } })
    const signedIn = await member.auth.signInWithPassword({ email: READER_EMAIL, password: READER_PASSWORD })
    expect(signedIn.error).toBeNull()
    const { data, error } = await member.from('members').select('id').in('id', OURS)
    expect(error).toBeNull()
    expect((data ?? []).map((r) => r.id).sort()).toEqual([...OURS].sort())
  })
})
