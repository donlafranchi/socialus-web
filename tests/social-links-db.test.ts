// Issue #231 — the social-links CHECK, executed rather than read.
//
// tests/migrations-group-social-links.test.ts reads the SQL text, so it was
// green while `{1,500}` — past Postgres's 255 repetition cap — made the
// function raise on every non-empty map. The empty default never reaches the
// regex, so nothing failed until a member saved a link. This calls it.

import { describe, it, expect, afterAll } from 'vitest'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL

const RUNNABLE = requireRunnable({
  claim: 'the database accepts an https social link and refuses anything else',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('#231 — social_links_values_https, executed', () => {
  const pool = RUNNABLE ? new Pool({ connectionString: DATABASE_URL }) : null
  afterAll(async () => {
    await pool?.end()
  })

  const check = async (links: Record<string, unknown>) => {
    const { rows } = await pool!.query<{ ok: boolean }>(
      'select public.social_links_values_https($1::jsonb) as ok',
      [JSON.stringify(links)],
    )
    return rows[0]!.ok
  }

  it('accepts an https link', async () => {
    expect(await check({ instagram: 'https://www.instagram.com/donlafranchi' })).toBe(true)
  })

  it('accepts a link at the 500-character limit after the scheme', async () => {
    expect(await check({ website: 'https://' + 'a'.repeat(500) })).toBe(true)
  })

  it('refuses one past it', async () => {
    expect(await check({ website: 'https://' + 'a'.repeat(501) })).toBe(false)
  })

  it('refuses javascript:, data: and plain http', async () => {
    expect(await check({ website: 'javascript:alert(1)' })).toBe(false)
    expect(await check({ website: 'data:text/html,x' })).toBe(false)
    expect(await check({ website: 'http://example.com' })).toBe(false)
  })

  it('refuses whitespace and a bare scheme', async () => {
    expect(await check({ website: 'https://exa mple.com' })).toBe(false)
    expect(await check({ website: 'https://' })).toBe(false)
  })

  it('refuses a value that is not a string', async () => {
    expect(await check({ website: 42 })).toBe(false)
  })
})
