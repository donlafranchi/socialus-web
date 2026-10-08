// #527 — record a baseline from a run's rows.jsonl (the nightly uploads one). Keeps each row's waiver.
//   npx tsx evals/speed/rebaseline.ts path/to/rows.jsonl [laptop|ci]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Baseline } from '../../src/lib/speed/verdict'

const [file, source = 'ci'] = process.argv.slice(2)
if (!file) { console.error('usage: rebaseline.ts rows.jsonl [laptop|ci]'); process.exit(1) }
const path = join(__dirname, 'baseline.json')
const old: Baseline = JSON.parse(readFileSync(path, 'utf8'))
const next: Baseline = {}
for (const l of readFileSync(file, 'utf8').trim().split('\n')) {
  const r = JSON.parse(l)
  if (r.note || r.readyMs == null) continue
  const k = `${r.name} [${r.mode}]`
  const over = r.flags.some((x: string) => x === 'slow-content' || x === 'slow-feedback')
  next[k] = { feedbackMs: r.feedbackMs, readyMs: r.readyMs, ...(old[k]?.issue && over ? { issue: old[k]!.issue } : {}) }
}
writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
writeFileSync(join(__dirname, 'baseline-source.json'), JSON.stringify({ source, recordedAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
console.log(`baseline: ${Object.keys(next).length} rows from ${source}`)
