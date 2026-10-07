#!/usr/bin/env tsx
// chore #433 — compare a night's builder-journey friction log with the last
// night's. New friction is a finding; friction that was already there is not.
//
//   tsx scripts/builders/friction-diff.ts <baseline friction.md | none> <friction.md>
//
// Exits 1 and names each new line when there is any. The organization, any
// number (timings) and the screenshot link are ignored, so a day's different
// organizations are not "new". With no baseline there is nothing to compare.
import { existsSync, readFileSync } from 'node:fs'

const LINE = /^- \*\*(.+?) · (.+?) · (.+?)\*\* — (.+?): (.*?)(?: \(\[shot\]\(.*\)\))?$/

/** One key per friction line: kind · step — what: detail (numbers masked). */
export function frictionKeys(md: string): string[] {
  const keys: string[] = []
  for (const line of md.split(/\r?\n/)) {
    const m = LINE.exec(line.trim())
    if (m) keys.push(`${m[1]} · ${m[3]} — ${m[4]}: ${m[5]!.replace(/\d+/g, 'N')}`)
  }
  return keys
}

/** Friction in `now` that `baseline` did not have. null baseline: nothing to compare. */
export function newFriction(baseline: string | null, now: string): string[] {
  if (baseline === null) return []
  const known = new Set(frictionKeys(baseline))
  return [...new Set(frictionKeys(now).filter((k) => !known.has(k)))]
}

if (require.main === module) {
  const [baselinePath, nowPath] = process.argv.slice(2)
  if (!baselinePath || !nowPath) {
    console.error('usage: friction-diff.ts <baseline friction.md | none> <friction.md>')
    process.exit(2)
  }
  const baseline = baselinePath !== 'none' && existsSync(baselinePath) ? readFileSync(baselinePath, 'utf8') : null
  if (baseline === null) console.log('No baseline friction log yet: nothing to compare. Tonight becomes the baseline.')
  const found = newFriction(baseline, readFileSync(nowPath, 'utf8'))
  if (found.length) {
    console.log(`New friction since the last night (${found.length}):`)
    for (const f of found) console.log(`- ${f}`)
    process.exit(1)
  }
  if (baseline !== null) console.log('No new friction since the last night.')
}
