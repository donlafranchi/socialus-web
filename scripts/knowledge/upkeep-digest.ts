// #1520: the upkeep list for the Monday retro (F128.7), from the store, now that
// the monthly Issue's writer is gone (#1476). Rules not reconfirmed in 90 days,
// experiments past their verdict date, routines with no recent run, ideas open
// over 90 days: the same rows as the `upkeep` lookup tool.
//
// Reads only, as practice-drift.ts does: it mints a key for the run, reads, and
// rolls its transaction back, so the run leaves nothing in the store.
//
// Run: tsx scripts/knowledge/upkeep-digest.ts --out upkeep.json, with DATABASE_URL set.

import { Client } from 'pg'
import { writeFileSync } from 'node:fs'
import { enterStore, leaveStore } from './import'
import { upkeep, type UpkeepRow } from '../../src/lib/knowledge/lookups'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const out = arg('out') ?? 'upkeep.json'
  const agent = `upkeep-digest-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  const db = new Client({ connectionString: url })
  await db.connect()
  let rows: UpkeepRow[]
  try {
    await db.query('begin')
    await enterStore(db, agent)
    rows = await upkeep(db)
    await leaveStore(db, agent)
  } finally {
    await db.query('rollback').catch(() => {})
    await db.end()
  }
  writeFileSync(out, JSON.stringify(rows, null, 2) + '\n')
  console.log(`${rows.length} upkeep row(s) written to ${out}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
