import { describe, it, expect, vi, beforeEach } from 'vitest'

// The three states this route has to tell apart, because the remediation for
// each is different: set a variable, fix the host, or nothing.

const { connect, query, release } = vi.hoisted(() => ({
  connect: vi.fn(),
  query: vi.fn(),
  release: vi.fn(),
}))

vi.mock('@/actions/_lib/db', () => ({
  getPool: () => ({ connect }),
}))

const ORIGINAL = { ...process.env }

beforeEach(() => {
  vi.clearAllMocks()
  process.env = { ...ORIGINAL }
  delete process.env.DATABASE_URL
  delete process.env.POSTGRES_URL_NON_POOLING
  delete process.env.POSTGRES_URL
  connect.mockResolvedValue({ query, release })
  query.mockResolvedValue({ rows: [{ '?column?': 1 }] })
})

async function get() {
  const { GET } = await import('./route')
  const res = await GET()
  return { res, body: await res.json() }
}

describe('GET /api/health/db', () => {
  it('503 unconfigured when no connection string is set — the four-month failure', async () => {
    const { res, body } = await get()
    expect(res.status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.status).toBe('unconfigured')
    expect(body.detail).toContain('DATABASE_URL')
    // Never opens a connection it has no string for.
    expect(connect).not.toHaveBeenCalled()
  })

  it('200 ok when configured and the database answers', async () => {
    process.env.DATABASE_URL = 'postgresql://x'
    const { res, body } = await get()
    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true, status: 'ok' })
    expect(query).toHaveBeenCalledWith('select 1')
    expect(release).toHaveBeenCalled()
  })

  it('503 unreachable when configured but the connection fails', async () => {
    process.env.DATABASE_URL = 'postgresql://x'
    connect.mockRejectedValue(Object.assign(new Error('ENETUNREACH'), { code: 'ENETUNREACH' }))
    const { res, body } = await get()
    expect(res.status).toBe(503)
    expect(body.status).toBe('unreachable')
    expect(body.detail).toContain('ENETUNREACH')
  })

  it('never leaks the connection string, host or user', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres.abcdefghijklmnopqrst:hunter2@aws-0-us-west-2.pooler.supabase.com:5432/postgres'
    connect.mockRejectedValue(new Error('connect ECONNREFUSED aws-0-us-west-2.pooler.supabase.com:5432'))
    const { body } = await get()
    const serialised = JSON.stringify(body)
    expect(serialised).not.toContain('hunter2')
    expect(serialised).not.toContain('abcdefghijklmnopqrst')
    expect(serialised).not.toContain('pooler.supabase.com')
  })

  it('releases the client even when the query throws', async () => {
    process.env.DATABASE_URL = 'postgresql://x'
    query.mockRejectedValue(new Error('boom'))
    const { res } = await get()
    expect(res.status).toBe(503)
    expect(release).toHaveBeenCalled()
  })
})
