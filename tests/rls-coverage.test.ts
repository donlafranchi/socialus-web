// T051 — Rule 3 — RLS on every public table.
// Source ticket: development/tickets/T051-action-layer-ci-enforcement.md
//
// Belt-and-suspenders. Even if Rules 1, 2, 4 are bypassed, RLS at the
// database is the last line. Queries `pg_tables` for public tables
// without `rowsecurity = true`. Allowance list is empty at Phase 0 —
// every public table must opt in to RLS.
//
// Gated on DATABASE_URL (the same env var _lib/db.ts reads). In CI the
// Postgres service is up; locally the user runs `supabase start`.
//
// T150: absent, this fails rather than skipping. "Every public table has RLS"
// is an acceptance criterion, and a skipped check is that criterion unmet
// while the run reports green.
//
// Read-only — a single SELECT on pg_tables — so it does NOT take T151's
// write-safe gate. Pointing it at a remote project is safe, and requiring an
// ephemeral marker here would lock out the one check that is fine to run
// anywhere.

import { describe, it, expect } from 'vitest'
import { Pool } from 'pg'
import { requireRunnable } from './support/runnable'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.POSTGRES_URL

// Tables that may legitimately have RLS disabled.
// spatial_ref_sys is PostGIS reference data (coordinate-system definitions),
// owned by supabase_admin — `alter table` fails as postgres, and there is no
// privacy surface to protect. Every other public table must opt in to RLS;
// event-log partitions are covered by 035_partition_rls.sql.
const ALLOWLIST: readonly string[] = ['spatial_ref_sys']

const RUNNABLE = requireRunnable({
  claim: 'every table in the public schema has row-level security enabled',
  available: !!DATABASE_URL,
  remedy:
    'run `supabase start`, then put DATABASE_URL in .env.test.local ' +
    '(recipe in .env.local.example)',
})

describe.skipIf(!RUNNABLE)('T051 Rule 3 — RLS coverage on public schema', () => {
  it('every public table has rowsecurity = true', async () => {
    const pool = new Pool({ connectionString: DATABASE_URL })
    try {
      const { rows } = await pool.query<{ tablename: string }>(
        `select tablename
           from pg_tables
          where schemaname = 'public'
            and rowsecurity = false
          order by tablename`,
      )
      const missing = rows
        .map((r) => r.tablename)
        .filter((t) => !ALLOWLIST.includes(t))
      expect(missing, `Tables without RLS enabled: ${missing.join(', ')}`).toEqual([])
    } finally {
      await pool.end()
    }
  })
})
