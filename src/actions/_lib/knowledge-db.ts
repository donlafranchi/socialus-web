// F125 / T1018 (#1219) — how the lookup tool reaches the knowledge store.
// It lives beside the action layer's own pool because this is where runtime
// database connections live (Rule 1, T051); it is a separate pool and a
// separate login, and nothing here touches the app's tables.
//
// AS THE STORE'S OWN LOGIN, NEVER THE SERVICE KEY. The login is
// `knowledge_store` (#1217): it uses the `knowledge` schema and nothing else,
// reads through row-level security, and writes only through the store's
// functions. Every call runs in its own transaction holding one agent's key
// (`knowledge.key`), so the store sees, and its history names, that agent and
// the person it acts for.
//
// Configuration is one secret: KNOWLEDGE_DB_PASSWORD, the login's password.
// The rest comes from the app's own project address (NEXT_PUBLIC_SUPABASE_URL)
// and the pooler that address already uses (scripts/supabase-db-url.sh). A
// whole KNOWLEDGE_DATABASE_URL may be given instead, for a local database, but
// only for this login: any other user in it is refused, so a misplaced admin
// address can never become the tool's connection.

import { Pool, type PoolClient } from 'pg'

const LOGIN = 'knowledge_store'
/** socialus-db answers on this pooler shard (scripts/supabase-db-url.sh, verified 2026-09-13). */
const POOLER_HOST = 'aws-0-us-west-2.pooler.supabase.com'
/** Transaction mode: each call is one short transaction, which is all the tool needs. */
const POOLER_PORT = 6543

type Env = Record<string, string | undefined>

export function knowledgeDatabaseUrl(env: Env = process.env): string | null {
  const whole = env.KNOWLEDGE_DATABASE_URL?.trim()
  if (whole) {
    try {
      const user = decodeURIComponent(new URL(whole).username)
      return user === LOGIN || user.startsWith(`${LOGIN}.`) ? whole : null
    } catch {
      return null
    }
  }
  const password = env.KNOWLEDGE_DB_PASSWORD
  if (!password) return null
  let ref: string | null = null
  try {
    const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname
    ref = /^([a-z]{20})\.supabase\.co$/.exec(host)?.[1] ?? null
  } catch {
    ref = null
  }
  if (!ref) return null
  return `postgresql://${LOGIN}.${ref}:${encodeURIComponent(password)}@${POOLER_HOST}:${POOLER_PORT}/postgres`
}

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool
  const url = knowledgeDatabaseUrl()
  if (!url) throw new Error('The knowledge store is not configured here: KNOWLEDGE_DB_PASSWORD is not set.')
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url)
  pool = new Pool({
    connectionString: url,
    max: 3,
    idleTimeoutMillis: 10_000,
    ssl: local ? undefined : { rejectUnauthorized: false },
  })
  return pool
}

export async function closeKnowledgePool(): Promise<void> {
  const p = pool
  pool = null
  await p?.end()
}

/** One transaction as the store's login, holding this agent's key. Commits on success, rolls back on error. */
export async function withKey<T>(key: string, fn: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await getPool().connect()
  try {
    await db.query('begin')
    await db.query(`select set_config('knowledge.key', $1, true)`, [key])
    const out = await fn(db)
    await db.query('commit')
    return out
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}

export interface KnowledgeAgent {
  agent: string
  person: string
  departments: string[]
  operator: boolean
}

/** The agent a key belongs to, or null for an unknown or revoked key. */
export async function agentFor(key: string): Promise<KnowledgeAgent | null> {
  if (!key) return null
  return withKey(key, async (db) => {
    const { rows } = await db.query<{ who: KnowledgeAgent | null }>('select knowledge.whoami() as who')
    return rows[0]?.who ?? null
  })
}
