import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { Pool, type PoolClient } from 'pg'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

vi.mock('react', async (orig) => ({ ...(await orig<typeof import('react')>()), cache: <T,>(f: T) => f }))
vi.mock('@/lib/supabase-server', () => ({ createClient: async () => ({}) }))
vi.mock('@/actions/_lib/db', () => ({ getPool: () => { throw new Error('unused') } }))

import { flagOnFor } from '@/lib/flags/check'

// #1227 The flags table on a real database: the server lookup turns a flag on
// for a builder and not for a member, and no client role can read the table.
// One transaction, rolled back.

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const RUNNABLE = requireRunnable({
  claim: 'a flag is on for builders first and the flags table is closed to clients',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

const BUILDER = 'a4000000-0000-4000-8000-000000001227'
const MEMBER = 'b4000000-0000-4000-8000-000000001227'

let pool: Pool
let client: PoolClient

beforeAll(async () => {
  if (!RUNNABLE) return
  pool = new Pool({ connectionString: DATABASE_URL })
  client = await pool.connect()
})

afterAll(async () => {
  if (!RUNNABLE) return
  client.release()
  await pool.end()
})

describe.skipIf(!RUNNABLE)('#1227 feature flags', () => {
  it('on for builders first, then everyone, then off', async () => {
    await client.query('begin')
    try {
      for (const [id, h] of [[BUILDER, 'f1227-builder'], [MEMBER, 'f1227-member']]) {
        await client.query(
          `insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
           values ($1,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',$2,'x',now(),now(),now())`,
          [id, `${h}@test.invalid`],
        )
        await client.query(`insert into public.members (id, handle, display_name) values ($1,$2,$2)`, [id, h])
      }
      await client.query(`insert into public.builders (member_id, persona) values ($1,'f1227')`, [BUILDER])
      const q = (sql: string, params: unknown[]) => client.query(sql, params)
      const who = async () => [await flagOnFor('f1227', BUILDER, q), await flagOnFor('f1227', MEMBER, q), await flagOnFor('f1227', null, q)]

      expect(await who()).toEqual([true, false, false])
      await client.query(`insert into public.feature_flags (key, audience) values ('f1227','everyone')`)
      expect(await who()).toEqual([true, true, true])
      await client.query(`update public.feature_flags set audience = 'off' where key = 'f1227'`)
      expect(await who()).toEqual([false, false, false])
      await client.query(`update public.feature_flags set audience = 'builders' where key = 'f1227'`)
      await client.query(`update public.builders set disabled_at = now() where member_id = $1`, [BUILDER])
      expect(await who()).toEqual([false, false, false])
    } finally {
      await client.query('rollback')
    }
  })

  it('refuses an audience it does not know', async () => {
    await client.query('begin')
    try {
      await expect(client.query(`insert into public.feature_flags (key, audience) values ('f1227','half')`)).rejects.toThrow()
    } finally {
      await client.query('rollback')
    }
  })

  it('no client role can read or write it', async () => {
    for (const role of ['anon', 'authenticated']) {
      await client.query('begin')
      try {
        await client.query(`set local role ${role}`)
        await expect(client.query('select * from public.feature_flags')).rejects.toThrow(/permission denied/)
      } finally {
        await client.query('rollback')
      }
    }
  })
})
