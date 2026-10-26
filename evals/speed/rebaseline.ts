// #527 — record a baseline from a run's rows.jsonl (the nightly uploads one). Keeps each row's waiver.
//   npx tsx evals/speed/rebaseline.ts path/to/rows.jsonl [laptop|ci]
// #791 — REBASELINE_ONLY='Tap [mode]|Tap [mode]' re-records just those rows and keeps the rest.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Baseline } from '../../src/lib/speed/verdict'

const [file, source = 'ci'] = process.argv.slice(2)
if (!file) { console.error('usage: rebaseline.ts rows.jsonl [laptop|ci]'); process.exit(1) }
const path = join(__dirname, 'baseline.json')
const old: Baseline = JSON.parse(readFileSync(path, 'utf8'))
const only = (process.env.REBASELINE_ONLY ?? '').split('|').filter(Boolean)
const next: Baseline = only.length ? { ...old } : {}
for (const l of readFileSync(file, 'utf8').trim().split('\n')) {
  const r = JSON.parse(l)
  if (r.note || r.readyMs == null) continue
  const k = `${r.name} [${r.mode}]`
  if (only.length && !only.includes(k)) continue
  const over = r.flags.some((x: string) => x === 'slow-content' || x === 'slow-feedback')
  next[k] = { feedbackMs: r.feedbackMs, readyMs: r.readyMs, ...(old[k]?.issue && over ? { issue: old[k]!.issue } : {}) }
}
writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
writeFileSync(join(__dirname, 'baseline-source.json'), JSON.stringify({ source, recordedAt: new Date().toISOString().slice(0, 10) }, null, 2) + '\n')
console.log(`baseline: ${Object.keys(next).length} rows from ${source}`)
