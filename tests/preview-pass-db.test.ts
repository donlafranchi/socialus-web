import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'
import { sealPreviewPassSession } from '@/actions/_lib/preview-pass-link'

// #400 — a preview-pass session's limits live in Supabase, not in a browser
// cookie (security review): sealing one sets auth.sessions.not_after 30 days
// out and tags it with the token's fingerprint, and ends every pass session
// from another token. A session from ordinary sign-in is never touched.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: "a preview-pass session expires in 30 days and a rotated token's sessions end, in auth.sessions",
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const USER = 'a5000000-0000-4000-8000-000000000400'
const NEW = 'b5000000-0000-4000-8000-000000000400'
const OLD = 'b5000000-0000-4000-8000-000000000401'
const ORDINARY = 'b5000000-0000-4000-8000-000000000402'

let pool: Pool
let client: PoolClient

const jwt = (sessionId: string, sub = USER) =>
  ['x', Buffer.from(JSON.stringify({ session_id: sessionId, sub })).toString('base64url'), 'sig'].join('.')

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
  await client.query(
    `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
     values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','p400@test.invalid','x',now(),now(),now())`,
    [USER],
  )
  await client.query(
    `insert into auth.sessions (id, user_id, created_at, updated_at, tag) values
       ($1,$4,now(),now(),null), ($2,$4,now(),now(),'preview-pass:old'), ($3,$4,now(),now(),null)`,
    [NEW, OLD, ORDINARY, USER],
  )
})

afterAll(async () => {
  if (!RUNNABLE) return
  await client.query(`delete from auth.sessions where user_id = $1`, [USER])
  await client.query(`delete from auth.users where id = $1`, [USER])
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#400 sealing a preview-pass session', () => {
  it('stamps 30 days and the tag, ends the old token\'s session, leaves an ordinary one', async () => {
    expect(await sealPreviewPassSession(jwt(NEW), 'current')).toBe(true)
    const rows = (await client.query(
      `select id, tag, extract(epoch from (not_after - now())) / 86400 as days from auth.sessions where user_id = $1`,
      [USER],
    )).rows
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]))
    expect(byId[NEW].tag).toBe('preview-pass:current')
    expect(Number(byId[NEW].days)).toBeGreaterThan(29.9)
    expect(Number(byId[NEW].days)).toBeLessThanOrEqual(30)
    expect(byId[OLD]).toBeUndefined()
    expect(byId[ORDINARY].tag).toBeNull()
  })

  it('fails closed on a session that is not this user\'s', async () => {
    expect(await sealPreviewPassSession(jwt(ORDINARY, 'c5000000-0000-4000-8000-000000000400'), 'current')).toBe(false)
  })

  it('fails closed on a token it cannot read', async () => {
    expect(await sealPreviewPassSession('not-a-jwt', 'current')).toBe(false)
  })
})
