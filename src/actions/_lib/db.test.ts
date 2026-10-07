import { describe, it, expect, vi, beforeEach } from 'vitest'

// bug #457 — one small pool per instance, never a connection per request.

const made: { opts: Record<string, unknown> }[] = []
vi.mock('pg', () => ({
  Pool: class {
    constructor(public opts: Record<string, unknown>) {
      made.push({ opts })
    }
    on() {
      return this
    }
  },
}))

beforeEach(() => {
  made.length = 0
  ;(globalThis as { __socialusPool?: unknown }).__socialusPool = null
  vi.resetModules()
  process.env.DATABASE_URL = 'postgresql://u:p@127.0.0.1:5432/db'
  delete process.env.VERCEL
  delete process.env.DB_POOL_MAX
})

describe('getPool', () => {
  it('is one pool per instance, however often it is asked', async () => {
    const { getPool } = await import('./db')
    expect(getPool()).toBe(getPool())
    expect(made).toHaveLength(1)
  })
  it('keeps the pool small and lets an idle function exit', async () => {
    const { getPool } = await import('./db')
    getPool()
    expect(Number(made[0]!.opts.max)).toBeLessThanOrEqual(3)
    expect(made[0]!.opts.allowExitOnIdle).toBe(true)
    expect(Number(made[0]!.opts.idleTimeoutMillis)).toBeLessThanOrEqual(10_000)
  })
  it('can be tuned with DB_POOL_MAX', async () => {
    process.env.DB_POOL_MAX = '2'
    const { getPool } = await import('./db')
    getPool()
    expect(made[0]!.opts.max).toBe(2)
  })
  it('on Vercel connects through the transaction pooler', async () => {
    process.env.VERCEL = '1'
    process.env.DATABASE_URL = 'postgresql://postgres.abc:pw@aws-0-us-west-1.pooler.supabase.com:5432/postgres'
    const { getPool } = await import('./db')
    getPool()
    expect(new URL(String(made[0]!.opts.connectionString)).port).toBe('6543')
  })
})
