// GET /api/health/schema — does this deployment's database have the schema
// this deployment's code was built against?
//
// Issue #164, and the outage of 2026-09-21 that made it stop being a
// tidy-up ticket. A migration merged to main, Vercel deployed the code, and
// nobody applied the migration for an hour. The code selected
// `groups.public_id`, the database had no such column, and every Page URL
// returned 404 — the exact surface the release was meant to fix.
//
// `/api/health/db` was green the whole time. It asks whether a database
// answers, not whether it is the right one. This asks the second question.
//
// WHY IT LIVES IN THE DEPLOYMENT rather than in CI. Only the running app knows
// which database it was actually pointed at. A CI job checks the database CI
// was given credentials for, which is an assumption about Vercel's environment
// rather than an observation of it — and a wrong `DATABASE_URL` in Vercel is
// precisely the class of failure that produced the four-month write outage
// /api/health/db exists for.
//
// IT CANNOT FAIL OPEN. Unconfigured, unreachable, an unreadable history, an
// empty manifest — every one of them is a 503. A health check that says "fine"
// when it could not do its job is the same shape as the bug it watches for.
// ops-pattern's lesson 28: a check that greps text is not a check. This one
// reads the database's own applied-migration table and compares it to a list
// compiled into the bundle.

import { NextResponse } from 'next/server'
import { getPool } from '@/actions/_lib/db'
import { resolveConnectionString } from '@/actions/_lib/db-config'
import { MIGRATION_VERSIONS } from '@/lib/migrations/manifest'

// A cached health check is not a health check.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const REMEDY =
  'In a terminal: gh workflow run apply.yml --ref main'

export async function GET() {
  // An empty manifest would match every database, which is the failure this
  // endpoint exists to prevent. Refuse before asking anything.
  if (MIGRATION_VERSIONS.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        status: 'no-manifest',
        detail:
          'This build carries no migration manifest, so nothing can be compared. ' +
          'Run `npm run migrations:manifest` and commit src/lib/migrations/manifest.ts.',
      },
      { status: 503 },
    )
  }

  const resolved = resolveConnectionString(process.env)
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, status: 'unconfigured', detail: resolved.message },
      { status: 503 },
    )
  }

  let applied: Set<string>
  try {
    const client = await getPool().connect()
    try {
      const { rows } = await client.query<{ version: string }>(
        'select version from supabase_migrations.schema_migrations',
      )
      applied = new Set(rows.map((r) => String(r.version)))
    } finally {
      client.release()
    }
  } catch {
    // Deliberately says nothing about WHAT is configured — no host, no user,
    // no driver string. Whether the schema is current is operational; where
    // the database lives is not this endpoint's to publish.
    return NextResponse.json(
      {
        ok: false,
        status: 'unreachable',
        detail:
          'The applied-migration history could not be read, so the schema cannot be ' +
          'confirmed. This is not a pass.',
      },
      { status: 503 },
    )
  }

  const missing = MIGRATION_VERSIONS.filter((v) => !applied.has(v))

  // A database AHEAD of the build is not this endpoint's problem: the code is
  // simply older than the schema, and nothing it queries has gone missing.
  // check-migration-drift.sh watches that direction, with its own remedy.
  if (missing.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        status: 'behind',
        missing,
        detail:
          `The database is missing ${missing.length} migration(s) this build needs, ` +
          `so the deployed code is querying a schema that does not exist yet. ${REMEDY}`,
      },
      { status: 503 },
    )
  }

  return NextResponse.json({ ok: true, status: 'ok', migrations: MIGRATION_VERSIONS.length })
}
