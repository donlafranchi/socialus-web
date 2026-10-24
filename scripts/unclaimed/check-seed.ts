#!/usr/bin/env tsx
// #1027 — run before opening a daily seed PR: tsx scripts/unclaimed/check-seed.ts YYYY-MM-DD [--body-file pr-body.md]
// Offline checks (ledger, photo-overrides, PR body). Then run check-links.ts and the loader dry run.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkSeed } from '../../src/lib/unclaimed/seed-check'

const [date, flag, bodyFile] = process.argv.slice(2)
if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { console.error('usage: check-seed.ts YYYY-MM-DD [--body-file file]'); process.exit(2) }
const rd = (f: string) => readFileSync(join(__dirname, f), 'utf8')
const problems = checkSeed({
  date,
  // The day's file and its suffixed siblings (makers-2026-10-24-venues.json) are one seed.
  rows: readdirSync(__dirname).filter((f) => f.startsWith(`makers-${date}`) && /^makers-\d{4}-\d{2}-\d{2}(-[\w-]+)?\.json$/.test(f) && f.slice(7, 17) === date).flatMap((f) => JSON.parse(rd(f))),
  ledger: rd('ADDED.md'),
  overrides: JSON.parse(rd('photo-overrides.json')),
  prBody: flag === '--body-file' && bodyFile ? readFileSync(bodyFile, 'utf8') : undefined,
})
for (const p of problems) console.log(`FIX ${p}`)
console.log(problems.length ? `${problems.length} problem(s)` : 'seed check ok')
process.exit(problems.length ? 1 : 0)
