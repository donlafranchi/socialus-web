#!/usr/bin/env tsx
// #517 — put the researched Sacramento makers on Explore as unclaimed Pages.
//
//   tsx scripts/unclaimed/load.ts            what it would do (writes nothing)
//   tsx scripts/unclaimed/load.ts --apply    do it; needs DATABASE_URL
//
// Idempotent: a Page that exists (visible, or hidden by a removal request) is
// skipped. The list is scripts/unclaimed/makers.json; src/lib/unclaimed/plan.ts
// decides what is held out and in what order.
import { Client } from 'pg'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planMakers, type MakerRow } from '../../src/lib/unclaimed/plan'
import { loadUnclaimed } from '../../src/lib/unclaimed/load'

async function main() {
  const rows = JSON.parse(readFileSync(join(__dirname, 'makers.json'), 'utf8')) as MakerRow[]
  const { listed, skipped } = planMakers(rows)
  console.log(`${listed.length} to list, ${skipped.length} held back`)
  for (const s of skipped) console.log(`  held back: ${s.name} (${s.reason})`)
  for (const p of listed) console.log(`  ${p.name} [${p.city}] ${p.publicInfoUrl}`)
  if (!process.argv.includes('--apply')) {
    console.log('Dry run: nothing written. Add --apply to write.')
    return
  }
  const url = process.env.DATABASE_URL?.trim()
  if (!url) throw new Error('DATABASE_URL is not set')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    const r = await loadUnclaimed(db, listed)
    console.log(`Created ${r.created}, already there ${r.existing}, failed ${r.failed.length}`)
    for (const f of r.failed) console.log(`  FAILED ${f.name}: ${f.error}`)
    if (r.failed.length) process.exitCode = 1
  } finally {
    await db.end()
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
