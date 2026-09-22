// F076 (amendment pending) — a person with no account leaves an email.
//
// The claim under test is a claim about DATABASE CONSTRAINTS, so it is made
// against a real database. The unit tests mock the pool and can prove the
// handler's logic; they cannot prove that two rows sharing an address are
// impossible, and "impossible" is the whole argument for replacing
// `member_id unique` with something rather than moving the rule into code.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'
import { databaseWriteSafety } from './support/write-safe'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const MIG = resolve(__dirname, '..', 'supabase', 'migrations')
const FILE = readdirSync(MIG).find((f) => /^\d{14}_metro_waitlist_anonymous\.sql$/.test(f))
const raw = FILE && existsSync(resolve(MIG, FILE)) ? readFileSync(resolve(MIG, FILE), 'utf8') : ''

describe('the anonymous waitlist migration file', () => {
  it('exists, timestamped per #39', () => {
    expect(FILE, 'expected a YYYYMMDDHHMMSS_metro_waitlist_anonymous.sql').toBeTruthy()
  })

  it('still never opens a metro', () => {
    // Criterion 12 survives the amendment. Nothing about letting a stranger be
    // counted may make crossing a threshold into an opening.
    expect(raw).not.toMatch(/is_open/i)
  })

  it('opens no direct write path for anonymous callers', () => {
    // ADR-7. An anonymous WRITE is not an anonymous DIRECT-TO-POSTGREST write,
    // and the difference is one `create policy ... for insert` away.
    expect(raw).not.toMatch(/create\s+policy[\s\S]*?for\s+(insert|update|delete)/i)
  })

  it('says in words what it costs, rather than only what it adds', () => {
    // The uniqueness that makes joining idempotent also makes "is this address
    // already waiting?" answerable. That is inherent and cannot be fixed in
    // SQL, so the file has to carry it or nobody downstream learns it.
    expect(raw).toMatch(/privacy/i)
    expect(raw).toMatch(/already waiting/i)
  })
})

const safety = databaseWriteSafety(DATABASE_URL, process.env)
const WRITABLE = requireRunnable({
  claim: 'one email waits in one metro, and a row carries exactly one identity',
  available: safety.safe,
  remedy: `${safety.reason} Recipe in .env.local.example`,
})

describe.skipIf(!WRITABLE)('the anonymous waitlist, against real rows', () => {
  const inRollback = async <T>(
    fn: (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => Promise<T>,
  ): Promise<T> => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()
    try {
      await client.query('begin')
      const q = async (sql: string, p: unknown[] = []) =>
        (await client.query(sql, p)).rows as Record<string, unknown>[]
      return await fn(q)
    } finally {
      await client.query('rollback')
      client.release()
      await pool.end()
    }
  }

  const metros = async (q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>) => {
    const rows = (await q(
      `select id from public.metro_polygons where slug in ('boise-city-mountain-home-ontario-id-or','reno-carson-city-gardnerville-ranchos-nv-ca') order by slug`,
    )) as { id: string }[]
    if (rows.length < 2) throw new Error(`expected two seeded metros, got ${rows.length}`)
    return { a: rows[0].id, b: rows[1].id }
  }

  const attempt = async (
    q: (sql: string, p?: unknown[]) => Promise<Record<string, unknown>[]>,
    cols: string,
    vals: string,
    params: unknown[],
  ): Promise<string | null> => {
    try {
      await q(`insert into public.metro_waitlist (${cols}) values (${vals})`, params)
      return null
    } catch (e) {
      return (e as Error).message
    }
  }

  it('lets someone with no account be counted at all', async () => {
    const err = await inRollback(async (q) => {
      const { a } = await metros(q)
      return attempt(q, 'metro_id, role, email', '$1,$2,$3', [a, 'creator', 'someone@example.com'])
    })
    expect(err, 'an anonymous row is the entire point of the amendment').toBeNull()
  })

  it('refuses the SAME address on a SECOND metro — the criterion 5 case', async () => {
    // This is why uniqueness is global and not per metro. Per-metro uniqueness
    // accepts this insert, and one person is then counted in two places, which
    // is exactly what "leaving neither double-counted nor stranded" forbids.
    const err = await inRollback(async (q) => {
      const { a, b } = await metros(q)
      await q(`insert into public.metro_waitlist (metro_id, role, email) values ($1,'creator','dup@example.com')`, [a])
      return attempt(q, 'metro_id, role, email', '$1,$2,$3', [b, 'patron', 'dup@example.com'])
    })
    expect(err, 'one address must not wait in two metros').toBeTruthy()
    expect(err).toMatch(/unique|duplicate/i)
  })

  it('treats changing metro as a move, not a second row', async () => {
    const rows = await inRollback(async (q) => {
      const { a, b } = await metros(q)
      await q(`insert into public.metro_waitlist (metro_id, role, email) values ($1,'creator','mover@example.com')`, [a])
      await q(`update public.metro_waitlist set metro_id = $1 where email = 'mover@example.com'`, [b])
      return q(`select metro_id from public.metro_waitlist where email = 'mover@example.com'`)
    })
    expect(rows).toHaveLength(1)
  })

  it('refuses a row carrying neither identity', async () => {
    const err = await inRollback(async (q) => {
      const { a } = await metros(q)
      return attempt(q, 'metro_id, role', '$1,$2', [a, 'patron'])
    })
    expect(err, 'a row that is nobody counts toward a threshold and belongs to no one').toBeTruthy()
    expect(err).toMatch(/one_identity/i)
  })

  it('refuses a row carrying both', async () => {
    const err = await inRollback(async (q) => {
      const { a } = await metros(q)
      const [{ id: memberId }] = (await q(`select id from public.members limit 1`)) as { id: string }[]
      return attempt(q, 'member_id, metro_id, role, email', '$1,$2,$3,$4', [
        memberId,
        a,
        'patron',
        'both@example.com',
      ])
    })
    expect(err, 'both identities is one person countable twice and repairable by nobody').toBeTruthy()
    expect(err).toMatch(/one_identity/i)
  })

  it('refuses an address that was not normalised before it was stored', async () => {
    // The unique index is on lower(email); storing '  A@B.CO ' would make the
    // stored value disagree with the key it is deduplicated by, which reads
    // fine and dedupes wrong.
    for (const bad of ['  A@B.CO ', 'Mixed@Case.com', 'not-an-email', 'no@dots']) {
      const err = await inRollback(async (q) => {
        const { a } = await metros(q)
        return attempt(q, 'metro_id, role, email', '$1,$2,$3', [a, 'patron', bad])
      })
      expect(err, `expected ${JSON.stringify(bad)} to be rejected`).toBeTruthy()
      expect(err).toMatch(/email_shape/i)
    }
  })

  it('still refuses a second row for one MEMBER, now that the constraint is an index', async () => {
    // The original rule was `member_id not null unique`. Dropping that
    // constraint to allow NULLs is the step where criterion 4 could quietly
    // stop being enforced for signed-in people.
    const err = await inRollback(async (q) => {
      const { a, b } = await metros(q)
      const [{ id: memberId }] = (await q(`select id from public.members limit 1`)) as { id: string }[]
      await q(`insert into public.metro_waitlist (member_id, metro_id, role) values ($1,$2,'creator')`, [memberId, a])
      return attempt(q, 'member_id, metro_id, role', '$1,$2,$3', [memberId, b, 'patron'])
    })
    expect(err, 'the member rule must survive being re-expressed as a partial index').toBeTruthy()
    expect(err).toMatch(/unique|duplicate/i)
  })

  it('lets two DIFFERENT addresses wait in the same metro', async () => {
    const rows = await inRollback(async (q) => {
      const { a } = await metros(q)
      await q(`insert into public.metro_waitlist (metro_id, role, email) values ($1,'creator','one@example.com')`, [a])
      await q(`insert into public.metro_waitlist (metro_id, role, email) values ($1,'patron','two@example.com')`, [a])
      return q(`select email from public.metro_waitlist where metro_id = $1 and email is not null`, [a])
    })
    expect(rows).toHaveLength(2)
  })
})
