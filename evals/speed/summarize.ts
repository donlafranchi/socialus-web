// #527 — turns speed-out/rows.jsonl into the table and the slowest ten.
//   npx tsx evals/speed/summarize.ts [speed-out]
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { slowest, type Flag, type TapMeasure } from '../../src/lib/speed/judge'

const dir = process.argv[2] ?? 'speed-out'
const file = join(dir, 'rows.jsonl')
if (!existsSync(file)) { console.log('no rows'); process.exit(0) }
type R = TapMeasure & { mode: string; flags: Flag[]; requests: number; waterfall: number; longTaskMs: number; slowReqs: string[]; prefetched: boolean | null; note?: string }
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as R)
const f = (v: number | null) => (v === null ? '—' : String(v))
const out = [
  '### Tap speed (Pixel 7, 4x CPU, 4G, production)',
  '',
  '| Tap | feedback ms | URL ms | content ms | requests / waterfall | long tasks ms | flags |',
  '|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.name} [${r.mode}] | ${f(r.feedbackMs)} | ${f(r.urlMs)} | ${f(r.readyMs)} | ${r.requests} / ${r.waterfall} | ${r.longTaskMs} | ${r.note ?? r.flags.join(', ')} |`),
  '',
  '**Slowest 10**',
  '',
  ...slowest(rows, 10).map((r, i) => `${i + 1}. ${r.name} [${r.mode}]: content ${f(r.readyMs)} ms (URL ${f(r.urlMs)}, feedback ${f(r.feedbackMs)}); ${r.slowReqs[0] ?? 'no requests'}${r.prefetched === false ? '; not prefetched' : ''}`),
]
writeFileSync(join(dir, 'summary.md'), out.join('\n') + '\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out.join('\n') + '\n')
console.log(out.join('\n'))
