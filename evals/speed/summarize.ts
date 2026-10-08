// #527 — turns speed-out/rows.jsonl into the run summary, the history record and the dashboard feed.
//   npx tsx evals/speed/summarize.ts [speed-out]
// Writes summary.md and perf-latest.json (the nightly appends the latter to the
// perf-history branch). MEMBER_COUNT, when set, says whether a re-benchmark is due.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { slowest, type Flag, type TapMeasure } from '../../src/lib/speed/judge'
import { checkpointDue, type Baseline, type Status } from '../../src/lib/speed/verdict'

const dir = process.argv[2] ?? 'speed-out'
const file = join(dir, 'rows.jsonl')
if (!existsSync(file)) { console.log('no rows'); process.exit(0) }
type R = TapMeasure & { mode: string; flags: Flag[]; status: Status; regressed: boolean; waived: boolean; requests: number; waterfall: number; longTaskMs: number; slowReqs: string[]; prefetched: boolean | null; note?: string }
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l) as R)
const baseline: Baseline = JSON.parse(readFileSync(join(__dirname, 'baseline.json'), 'utf8'))
const done: number[] = existsSync(join(__dirname, 'checkpoints.json')) ? JSON.parse(readFileSync(join(__dirname, 'checkpoints.json'), 'utf8')).benchmarked : []
const f = (v: number | null) => (v === null ? '—' : String(v))
const dot = { green: '🟢', amber: '🟠', red: '🔴' } as const
const key = (r: R) => `${r.name} [${r.mode}]`
const reds = rows.filter((r) => r.status === 'red' || r.note)
const consumerRed = reds.filter((r) => r.kind === 'consumer' || r.note)
const faster = rows.filter((r) => baseline[key(r)]?.readyMs && r.readyMs !== null && r.readyMs < baseline[key(r)]!.readyMs! * 0.8 && baseline[key(r)]!.readyMs! - r.readyMs > 50)
const members = Number(process.env.MEMBER_COUNT ?? '')
const due = Number.isFinite(members) && members > 0 ? checkpointDue(members, done) : null
const worst = slowest(rows.filter((r) => !r.note), 10)

const md = [
  `### Tap speed: ${reds.length ? `🔴 ${reds.length} red` : '🟢 no red'} (Pixel 7, 4x CPU, 4G, production)`,
  '',
  ...(due ? [`**Re-benchmark due:** membership passed ${due}. Run the suite and the load simulation, then record ${due} in evals/speed/checkpoints.json.`, ''] : []),
  '| | Tap | feedback ms | URL ms | content ms | requests / waterfall | long tasks ms | flags |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${dot[r.status] ?? '🔴'} | ${key(r)} | ${f(r.feedbackMs)} | ${f(r.urlMs)} | ${f(r.readyMs)} | ${r.requests} / ${r.waterfall} | ${r.longTaskMs} | ${r.note ?? [...r.flags, r.regressed ? 'slower than baseline' : '', r.waived ? 'known' : ''].filter(Boolean).join(', ')} |`),
  '',
  '**Slowest 10**',
  '',
  ...worst.map((r, i) => `${i + 1}. ${key(r)}: content ${f(r.readyMs)} ms (URL ${f(r.urlMs)}, feedback ${f(r.feedbackMs)}); ${r.slowReqs[0] ?? 'no requests'}${r.prefetched === false ? '; not prefetched' : ''}`),
  ...(faster.length ? ['', `**Faster than baseline by over 20%, so re-baseline:** ${faster.map(key).join('; ')}`] : []),
]
writeFileSync(join(dir, 'summary.md'), md.join('\n') + '\n')
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n')

// The dashboard reads this and nothing else: red only when a consumer screen is over budget (or a tap could not be timed).
const latest = {
  at: new Date().toISOString(),
  sha: process.env.GITHUB_SHA ?? null,
  red: consumerRed.length > 0,
  redCount: reds.length,
  amberCount: rows.filter((r) => r.status === 'amber').length,
  rebenchmarkDue: due,
  slowest: worst.slice(0, 5).map((r) => ({ screen: key(r), kind: r.kind, readyMs: r.readyMs, feedbackMs: r.feedbackMs, status: r.status })),
  rows: rows.map((r) => ({ screen: key(r), kind: r.kind, feedbackMs: r.feedbackMs, urlMs: r.urlMs, readyMs: r.readyMs, status: r.status, flags: r.flags })),
}
writeFileSync(join(dir, 'perf-latest.json'), JSON.stringify(latest, null, 2) + '\n')
console.log(md.join('\n'))
