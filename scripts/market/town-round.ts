#!/usr/bin/env tsx
// F118 criterion 7 — mark towns that reached 100 makers and 1,000 supporters, in order, until this
// round's 3 are ready; print each newly ready one as JSON for the workflow to log as an Issue.
// Opening stays a person's act: scripts/market/open-market.ts.
import { Client } from 'pg'

async function main() {
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('set DATABASE_URL')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    const ready = await db.query<{ town_mark_ready: string }>(`select * from public.town_mark_ready()`)
    for (const { town_mark_ready: slug } of ready.rows) {
      const t = await db.query(`select slug, name, market_key, ready_rank, makers, supporters from public.town_board() where slug = $1`, [slug])
      console.log(JSON.stringify(t.rows[0]))
    }
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
