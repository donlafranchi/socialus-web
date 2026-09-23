// bug #205 — the place onboarding depends on comes from a migration, not a seed.
//
// THE REGRESSION THIS PINS. `src/app/onboarding/actions.ts` names a place id;
// that row existed only in `supabase/seeds/the-good-place.sql`; and
// `member_place_interests.place_id` is a foreign key. So a database with
// migrations and no seed — a fresh clone on a second machine — could not
// complete onboarding at all, while production could, because production
// happened to have been seeded.
//
// The static half asserts the migration and the constant still name the same
// row: two hand-maintained copies of one uuid is how they stop agreeing. The
// database half asserts the row is actually reachable and resolves to a metro,
// which is the thing the FK violation was hiding.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

const ROOT = resolve(__dirname, '..')
const MIG = resolve(ROOT, 'supabase', 'migrations')
const FILE = readdirSync(MIG).find((f) => /^\d{14}_default_home_place\.sql$/.test(f))
const raw = FILE && existsSync(resolve(MIG, FILE)) ? readFileSync(resolve(MIG, FILE), 'utf8') : ''

/**
 * The file with its `--` comments stripped.
 *
 * Needed because this migration's header explains why it uses DO NOTHING and
 * not DO UPDATE, and a test scanning the raw text for "do update" matched that
 * sentence. A prose assertion that fails on its own explanation is the kind of
 * test that gets deleted rather than understood.
 */
const sql = raw
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

const onboarding = readFileSync(resolve(ROOT, 'src', 'app', 'onboarding', 'actions.ts'), 'utf8')
const DEFAULT_ID = onboarding.match(/DEFAULT_HOME_PLACE_ID\s*=\s*'([0-9a-f-]{36})'/)?.[1] ?? null

describe('the default-home-place migration file', () => {
  it('exists, timestamped per #39', () => {
    expect(FILE, 'expected a YYYYMMDDHHMMSS_default_home_place.sql').toBeTruthy()
  })

  it('creates exactly the id the onboarding code names', () => {
    expect(DEFAULT_ID, 'could not read DEFAULT_HOME_PLACE_ID out of onboarding/actions.ts').toBeTruthy()
    expect(sql).toContain(DEFAULT_ID!)
  })

  it('creates the whole parent chain, because the FK and the trigger need it', () => {
    // places_set_ancestor_state_id walks to the parent; a city with no county
    // and no state inserts and then resolves to nothing.
    expect(sql).toContain('10000000-0000-4000-8000-000000000001')
    expect(sql).toContain('10000000-0000-4000-8000-000000000002')
  })

  it('inserts one tier per statement', () => {
    // The ancestor trigger SELECTs the parent, and a row inserted earlier in
    // the same multi-row INSERT is not reliably visible to it. Three separate
    // INSERTs, not one with three VALUES rows.
    const inserts = sql.match(/insert\s+into\s+public\.places/gi) ?? []
    expect(inserts).toHaveLength(3)
  })

  it('does not overwrite what is already there', () => {
    // The seed keeps `do update` and stays the owner of this content. A
    // migration that asserted the content too would silently revert a seed
    // change, and applying it to production would be a write rather than a
    // no-op.
    expect(sql).toMatch(/on conflict \(id\) do nothing/i)
    expect(sql).not.toMatch(/do update/i)
  })

  it('sets the centroid, which is what resolve_home_metro reads', () => {
    expect(sql).toMatch(/set centroid/i)
    // Only where it is missing, so production's existing rows are untouched.
    expect(sql).toMatch(/centroid is null/i)
  })

  it('still says the row is fictional rather than quietly laundering it', () => {
    // Making the dependency work is not a ruling that the default is right.
    expect(sql).toMatch(/"fictional":true/)
    // The reason lives in the comments, so this one reads the raw file.
    expect(raw).toMatch(/#205/)
  })
})

const RUNNABLE = requireRunnable({
  claim: 'a database built from migrations alone can complete onboarding',
  available: Boolean(DATABASE_URL),
  remedy: 'run `supabase start`, then put DATABASE_URL in .env.test.local (recipe in .env.local.example).',
})

describe.skipIf(!RUNNABLE)('against a real database', () => {
  const query = async (sql: string, p: unknown[] = []) => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      return (await pool.query(sql, p)).rows as Record<string, unknown>[]
    } finally {
      await pool.end()
    }
  }

  it('the place the onboarding code names actually exists', async () => {
    const rows = await query(`select id, display_name, kind from public.places where id = $1`, [
      DEFAULT_ID,
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('city')
  })

  it('it has a centroid, and that centroid resolves to a metro', async () => {
    // Without this the row exists, the FK passes, and the Member's home metro
    // is null — the FK violation replaced by a quieter wrong answer.
    const rows = await query(
      `select p.centroid is not null as has_centroid,
              public.resolve_home_metro(p.centroid) is not null as resolves
         from public.places p where p.id = $1`,
      [DEFAULT_ID],
    )
    expect(rows[0].has_centroid).toBe(true)
    expect(rows[0].resolves).toBe(true)
  })

  it('a member_place_interests row can actually be written against it', async () => {
    // The exact FK that was failing. Rolled back — this asserts the constraint
    // is satisfiable, it does not leave a row behind.
    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()
    try {
      await client.query('begin')
      const member = (
        await client.query(
          `insert into public.members (id, handle, display_name)
           values (gen_random_uuid(), 'fkprobe' || floor(random()*1e8)::text, 'FK Probe')
           returning id`,
        )
      ).rows[0].id
      await expect(
        client.query(
          `insert into public.member_place_interests (member_id, place_id, scope_kind)
           values ($1, $2, 'primary_home')`,
          [member, DEFAULT_ID],
        ),
      ).resolves.toBeTruthy()
    } finally {
      await client.query('rollback')
      client.release()
      await pool.end()
    }
  })
})
