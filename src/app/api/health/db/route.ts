// GET /api/health/db — can this deployment reach its database?
//
// Exists because of a four-month write outage nobody detected. `DATABASE_URL`
// was never set in any deployed environment; every action handler was down;
// the only thing that ever noticed was Don trying to create a Page. This route
// lets CI ask the same question after every deploy, without a person.
//
// It answers three states, and the distinction is the point:
//
//   ok           — configured, and `select 1` came back.
//   unconfigured — no connection string. The four-month failure.
//   unreachable  — configured, but the connection failed. The likely shapes
//                  are the direct db.<ref>.supabase.co host (AAAA-only, no A
//                  record, dead from IPv4-only runtimes) or the wrong pooler
//                  shard. A config gap that looks nothing like the first one.
//
// Deliberately says nothing about WHAT is configured — no host, no user, no
// connection string, not even which variable won. Whether a database is
// reachable is operational; where it lives is not this endpoint's to publish.

import { NextResponse } from 'next/server'
import { getPool } from '@/actions/_lib/db'
import { resolveConnectionString } from '@/actions/_lib/db-config'

// A cached health check is not a health check.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  const resolved = resolveConnectionString(process.env)
  if (!resolved.ok) {
    return NextResponse.json(
      { ok: false, status: 'unconfigured', detail: resolved.message },
      { status: 503 },
    )
  }

  try {
    const client = await getPool().connect()
    try {
      await client.query('select 1')
    } finally {
      client.release()
    }
    return NextResponse.json({ ok: true, status: 'ok' })
  } catch (err) {
    // The driver's message names the host and sometimes the user. Report the
    // class of failure, not the string.
    const code =
      typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code ?? '')
        : ''
    return NextResponse.json(
      {
        ok: false,
        status: 'unreachable',
        detail:
          'A connection string is configured but the database did not answer.' +
          (code ? ` Driver code: ${code}.` : '') +
          ' Check the pooler host and shard — the direct db.<ref>.supabase.co' +
          ' host has no A record and is unreachable from IPv4-only runtimes.',
      },
      { status: 503 },
    )
  }
}
