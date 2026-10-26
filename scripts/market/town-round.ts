#!/usr/bin/env tsx
// F118 criterion 7 — mark towns that reached 100 makers and 1,000 supporters, in order, until this
// round's 3 are ready; print each ready town that has no Issue yet as JSON, for the workflow to log.
// `town-round.ts --logged <slug>` records that its Issue now exists.
// Opening stays a person's act: scripts/market/open-market.ts.
import { Client } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('set DATABASE_URL')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    if (process.argv[2] === '--logged') {
      await db.query(`update public.towns set issue_logged_at = now() where slug = $1 and ready_at is not null`, [process.argv[3]])
      return
    }
    await db.query(`select * from public.town_mark_ready()`)
    const ready = await db.query(
      `select b.slug, b.name, t.market_key, b.ready_rank, b.makers, b.supporters
         from public.town_board() b join public.towns t using (slug)
        where t.ready_at is not null and t.issue_logged_at is null order by b.ready_rank`,
    )
    for (const row of ready.rows) console.log(JSON.stringify(row))
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
