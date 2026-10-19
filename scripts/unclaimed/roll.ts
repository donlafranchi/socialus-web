#!/usr/bin/env tsx
// Don, 2026-10-16 — keep every unclaimed Page's sample posts in its next 1–3 weeks: a finished sample rolls three
// weeks on, and one off the Page's weekly pattern is re-dated to it. Samples only (sample_kind set), never a real post.
//
//   tsx scripts/unclaimed/roll.ts            counts what it would move (writes nothing)
//   tsx scripts/unclaimed/roll.ts --apply    moves them; needs DATABASE_URL
//
// Idempotent: a second run moves nothing. Run weekly by .github/workflows/unclaimed-roll.yml.
import { appendFileSync } from 'node:fs'
import { Client } from 'pg'
import { redateSamples } from '../../src/lib/unclaimed/load'
import { syncMarketDays } from '../../src/lib/unclaimed/market-days'
import type { SampleKind } from '../../src/lib/unclaimed/samples'
import { readPlanned } from './rows'

const summary = (line: string) => {
  console.log(line)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, line + '\n')
}

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not set')
  const apply = process.argv.includes('--apply')
  const byUrl = new Map(readPlanned().listed.flatMap((p) => [[p.publicInfoUrl, p] as const, ...(p.legacyUrl ? [[p.legacyUrl, p] as const] : [])]))
  const db = new Client({ connectionString: url })
  await db.connect()
  const now = new Date()
  try {
    const { rows } = await db.query(
      `select g.id, g.public_info_url, p.id as post_id, p.sample_kind, p.starts_at, p.ends_at
         from public.groups g join public.page_posts p on p.group_id = g.id
        where g.unclaimed_at is not null and p.sample_kind is not null
        order by g.id`,
    )
    const pages = new Map<string, { url: string | null; rows: { id: string; sample_kind: SampleKind; starts_at: Date | null; ends_at: Date | null }[] }>()
    for (const r of rows as { id: string; public_info_url: string | null; post_id: string; sample_kind: SampleKind; starts_at: Date | null; ends_at: Date | null }[]) {
      const pg = pages.get(r.id) ?? { url: r.public_info_url, rows: [] }
      pg.rows.push({ id: r.post_id, sample_kind: r.sample_kind, starts_at: r.starts_at, ends_at: r.ends_at })
      pages.set(r.id, pg)
    }
    let moved = 0, touchedPages = 0, unknown = 0
    await db.query('begin')
    for (const pg of pages.values()) {
      const plan = pg.url ? byUrl.get(pg.url) : undefined
      if (!plan) unknown++
      const n = await redateSamples(db, pg.rows, plan?.slug ?? null, plan?.pool ?? null, now)
      moved += n
      if (n) touchedPages++
    }
    // Don, 2026-10-19 — a market's real Market day posts keep its next three dates.
    let marketDays = 0
    for (const p of readPlanned().listed.filter((x) => x.schedule)) {
      const { rows: [g] } = await db.query(`select id, photo_url from public.groups where unclaimed_at is not null and unclaimed_hidden_at is null and public_info_url = $1`, [p.publicInfoUrl])
      if (g) marketDays += await syncMarketDays(db, g.id, p.name, p.schedule!, g.photo_url, now)
    }
    await db.query(apply ? 'commit' : 'rollback')
    summary(`${apply ? 'Moved' : 'Would move'} ${marketDays} Market day posts.`)
    summary(`${apply ? 'Moved' : 'Would move'} ${moved} of ${rows.length} sample posts on ${touchedPages} of ${pages.size} unclaimed Pages${unknown ? ` (${unknown} not in the lists: rolled only)` : ''}.`)
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
