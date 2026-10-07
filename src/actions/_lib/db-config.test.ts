import { describe, it, expect } from 'vitest'
import { resolveConnectionString, POOL_ENV_NAMES } from './db-config'

// The four-month outage this exists to prevent.
//
// `DATABASE_URL` was never set in any deployed environment. `getPool()` threw
// the right message, but only ever from inside the first write a member
// attempted — so the failure surfaced as "I can't create a Page", four months
// after the requirement landed (db.ts, 2026-05-11; first reached from a route
// 2026-06-01). Every write in the app was down the whole time and nothing said so.
//
// Splitting the resolution out of getPool() is what lets something other than
// a user's failed write ask the question: /api/health/db calls this without
// opening a connection, and CI calls that route after deploy.

describe('resolveConnectionString', () => {
  it('names all three accepted variables, in precedence order', () => {
    expect(POOL_ENV_NAMES).toEqual([
      'DATABASE_URL',
      'POSTGRES_URL_NON_POOLING',
      'POSTGRES_URL',
    ])
  })

  it('prefers DATABASE_URL', () => {
    const r = resolveConnectionString({
      DATABASE_URL: 'postgresql://a',
      POSTGRES_URL_NON_POOLING: 'postgresql://b',
      POSTGRES_URL: 'postgresql://c',
    })
    expect(r).toEqual({ ok: true, connectionString: 'postgresql://a', source: 'DATABASE_URL' })
  })

  it('falls back through the list in order', () => {
    expect(resolveConnectionString({ POSTGRES_URL_NON_POOLING: 'postgresql://b' }))
      .toEqual({ ok: true, connectionString: 'postgresql://b', source: 'POSTGRES_URL_NON_POOLING' })
    expect(resolveConnectionString({ POSTGRES_URL: 'postgresql://c' }))
      .toEqual({ ok: true, connectionString: 'postgresql://c', source: 'POSTGRES_URL' })
  })

  it('reports unconfigured when none is set, and says which it looked for', () => {
    const r = resolveConnectionString({})
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('unreachable')
    expect(r.reason).toBe('unconfigured')
    expect(r.message).toContain('DATABASE_URL')
    expect(r.message).toContain('POSTGRES_URL_NON_POOLING')
    expect(r.message).toContain('POSTGRES_URL')
  })

  // An empty string is what an env var declared-but-blank in a dashboard
  // produces, and `??` would have accepted it and handed `new Pool('')` a
  // connection string that fails much later with a worse message.
  it('treats an empty or whitespace value as unset', () => {
    expect(resolveConnectionString({ DATABASE_URL: '' }).ok).toBe(false)
    expect(resolveConnectionString({ DATABASE_URL: '   ' }).ok).toBe(false)
    expect(resolveConnectionString({ DATABASE_URL: '  ', POSTGRES_URL: 'postgresql://c' }))
      .toEqual({ ok: true, connectionString: 'postgresql://c', source: 'POSTGRES_URL' })
  })

  it('trims surrounding whitespace from a pasted value', () => {
    expect(resolveConnectionString({ DATABASE_URL: '  postgresql://a\n' }))
      .toEqual({ ok: true, connectionString: 'postgresql://a', source: 'DATABASE_URL' })
  })
})

// bug #457 — on Vercel every function instance opens its own pool. The
// session-mode pooler (port 5432) allows 15 clients in all, so a few
// instances exhausted it (EMAXCONNSESSION) and Pages and Explore failed.
// Supabase's guidance for serverless is the transaction-mode pooler, port 6543.
import { toTransactionPooler } from './db-config'

describe('toTransactionPooler', () => {
  const session = 'postgresql://postgres.abcdef:secret@aws-0-us-west-1.pooler.supabase.com:5432/postgres'
  const vercel = { VERCEL: '1' }

  it('moves the session pooler to the transaction pooler on Vercel', () => {
    const out = toTransactionPooler(session, vercel)
    expect(new URL(out).port).toBe('6543')
    expect(new URL(out).hostname).toBe('aws-0-us-west-1.pooler.supabase.com')
    expect(new URL(out).username).toBe('postgres.abcdef')
    expect(new URL(out).password).toBe('secret')
  })
  it('leaves a transaction-pooler URL alone', () => {
    const url = session.replace(':5432', ':6543')
    expect(toTransactionPooler(url, vercel)).toBe(url)
  })
  it('leaves the direct host, localhost and other hosts alone', () => {
    for (const url of [
      'postgresql://postgres:pw@db.abcdef.supabase.co:5432/postgres',
      'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      'postgresql://u:p@example.com:5432/db',
    ]) {
      expect(toTransactionPooler(url, vercel)).toBe(url)
    }
  })
  it('does nothing off Vercel (CI, local, scripts keep their connection)', () => {
    expect(toTransactionPooler(session, {})).toBe(session)
  })
  it('does not throw on a string that is not a URL', () => {
    expect(toTransactionPooler('not a url', vercel)).toBe('not a url')
  })
})
