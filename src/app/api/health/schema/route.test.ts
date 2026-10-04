import { describe, it, expect, vi, beforeEach } from 'vitest'

// Issue #164 / the outage of 2026-09-21.
//
// WHAT HAPPENED. A migration merged to main, Vercel deployed the code, and the
// migration was not applied to production for an hour. The deployed code
// selected `groups.public_id`; the database had no such column; every Page URL
// returned 404. `/api/health/db` stayed green throughout, because it asks
// "can I reach a database", not "is it the right shape".
//
// WHAT WOULD HAVE CAUGHT IT. This. It compares the migrations THIS BUILD
// carries against the migrations the database has actually applied.
//
// THE FAIL-OPEN CASES ARE THE POINT OF MOST OF THESE TESTS. A health check
// that answers "fine" when it could not do its job is worse than no check —
// it is the same shape as the bug it watches for. Every unknown here is a 503.

const { getPool, resolveConnectionString } = vi.hoisted(() => ({
  getPool: vi.fn(),
  resolveConnectionString: vi.fn(),
}))
vi.mock('@/actions/_lib/db', () => ({ getPool }))
vi.mock('@/actions/_lib/db-config', () => ({ resolveConnectionString }))
vi.mock('@/lib/migrations/manifest', () => ({
  MIGRATION_VERSIONS: ['001', '002', '003'],
}))

import { GET } from './route'

function poolReturning(rows: { version: string }[] | Error) {
  const query = vi.fn(async () => {
    if (rows instanceof Error) throw rows
    return { rows }
  })
  const release = vi.fn()
  getPool.mockReturnValue({ connect: vi.fn(async () => ({ query, release })) })
  return { query, release }
}

beforeEach(() => {
  getPool.mockReset()
  resolveConnectionString.mockReset()
  resolveConnectionString.mockReturnValue({ ok: true })
})

describe('the schema the build needs vs the schema the database has', () => {
  it('is ok when the database has every migration the build carries', async () => {
    poolReturning([{ version: '001' }, { version: '002' }, { version: '003' }])
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({ ok: true, status: 'ok' })
  })

  it('is ok when the database is AHEAD — that is an old build, not a missing column', async () => {
    // Extra applied migrations mean the code is older than the schema, which
    // does not break this deployment. check-migration-drift.sh watches for
    // that, and its remedy is different.
    poolReturning([
      { version: '001' }, { version: '002' }, { version: '003' }, { version: '004' },
    ])
    expect((await GET()).status).toBe(200)
  })

  it('is 503 when the database is missing a migration this build carries', async () => {
    poolReturning([{ version: '001' }, { version: '002' }])
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body).toMatchObject({ ok: false, status: 'behind' })
    expect(body.missing).toEqual(['003'])
  })

  it('names every missing migration, not just the first', async () => {
    poolReturning([{ version: '001' }])
    expect((await (await GET()).json()).missing).toEqual(['002', '003'])
  })

  it('says what fixes it, in the name of the thing that fixes it', async () => {
    poolReturning([{ version: '001' }])
    expect((await (await GET()).json()).detail).toMatch(/gh workflow run apply\.yml --ref main -f confirm=apply/)
  })
})

describe('it cannot fail open', () => {
  it('is 503 when there is no connection string', async () => {
    resolveConnectionString.mockReturnValue({ ok: false, message: 'nothing set' })
    const res = await GET()
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ status: 'unconfigured' })
  })

  it('is 503 when the database cannot be reached', async () => {
    poolReturning(new Error('ECONNREFUSED'))
    const res = await GET()
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ status: 'unreachable' })
  })

  it('is 503 when the history table answers nothing at all', async () => {
    // An empty history compares equal to no migrations — the exact shape of
    // the failure this guard exists to catch. It must not read as clean.
    poolReturning([])
    const res = await GET()
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toMatchObject({ status: 'behind' })
  })

  it('releases the connection even when the query throws', async () => {
    const { release } = poolReturning(new Error('boom'))
    await GET()
    expect(release).toHaveBeenCalled()
  })

  it('publishes no host, user or connection string', async () => {
    poolReturning(new Error('connect ECONNREFUSED 10.1.2.3:5432 user=postgres'))
    const text = JSON.stringify(await (await GET()).json())
    expect(text).not.toMatch(/10\.1\.2\.3|password/i)
  })
})
