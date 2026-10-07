// T043 — DB pool + transaction wrapper
// Source: development/tickets/done/T043-* § _lib/transaction.ts
//
// Per the ticket Notes: Phase 0 uses Node runtime (not Edge) so we can use
// the `pg` client directly with BEGIN/COMMIT/ROLLBACK. Vercel Edge runtime
// does not support `pg`; if cold-start latency on signup becomes a problem
// at T2, revisit with an `rpc` to a plpgsql function.
//
// Per ADR-10: the row write + event-log write commit in the same DB
// transaction. Failure of either rolls back the other. The withTransaction
// wrapper enforces this.

import { Pool, type PoolClient } from 'pg'
import { resolveConnectionString, toTransactionPooler } from './db-config'

// One pool per instance, kept on globalThis so a dev reload never opens a second.
const g = globalThis as unknown as { __socialusPool?: Pool | null }
let pool: Pool | null = g.__socialusPool ?? null

/**
 * Is a connection string configured at all? Answers without opening a
 * connection, so a health check can ask before any member does.
 *
 * Kept separate from getPool() deliberately: the whole failure this guards
 * against was that the only thing which ever asked this question was a write
 * already in flight. See db-config.ts.
 */
export function assertPoolConfigured(env = process.env): void {
  const resolved = resolveConnectionString(env)
  if (!resolved.ok) throw new Error(resolved.message)
}

export function getPool(): Pool {
  if (pool) return pool
  const resolved = resolveConnectionString(process.env)
  if (!resolved.ok) {
    throw new Error(resolved.message)
  }
  // bug #457 — serverless: a small pool per instance, through the transaction
  // pooler on Vercel (db-config.ts). No prepared statements are used (every
  // query here is unnamed, which node-postgres runs without caching a
  // statement), no session state outlives a transaction, and no connection is
  // opened per request. An idle function exits instead of holding a client.
  const max = Number.parseInt(process.env.DB_POOL_MAX ?? '', 10)
  pool = new Pool({
    connectionString: toTransactionPooler(resolved.connectionString, process.env),
    max: Number.isFinite(max) && max > 0 ? max : 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
    allowExitOnIdle: true,
  })
  pool.on('error', () => {
    // An idle client the pooler dropped: the next query opens a fresh one.
  })
  g.__socialusPool = pool
  return pool
}

// withTransaction runs `fn` inside a single BEGIN/COMMIT block. On any
// throw, ROLLBACK is issued before the error propagates. ADR-10 same-
// transaction invariant: the row write + event-log write must both succeed
// or both fail.
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // Best-effort rollback. If it fails, the original error is the
      // one we want to propagate.
    }
    throw err
  } finally {
    client.release()
  }
}

// Test utility — close the pool. Lets test runners exit cleanly.
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    g.__socialusPool = null
  }
}
