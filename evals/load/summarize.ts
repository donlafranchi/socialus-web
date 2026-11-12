#!/usr/bin/env tsx
// #1261 — load simulation, last step: the table, and the first thing to break.
//   npx tsx evals/load/summarize.ts [load-out]
// Reads k6-*.json (one per level), samples.jsonl (watch.ts), marks.jsonl and server.log (run.sh),
// queries-*.json and fixture.json's cold start. Writes summary.md and result.json.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2] ?? 'load-out'
const read = <T>(f: string, fallback: T): T => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : fallback)
const lines = <T>(f: string): T[] => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l) as T) : [])

type K6 = { scenario: string; load: string; requests: number; rps: number; p50: number; p95: number; failed: number; handled: number | null; refused: number | null; dropped: number | null; broke: string[] }
type Sample = { t: number; level: string; appCpu: number | null; active?: number; lock_waits?: number; app_conns?: number; rest_conns?: number; total?: number; longest_ms?: number; max_connections?: number; dbError?: string }
type Mark = { level: string; start: number; end?: number; logFrom: number; logTo?: number; exit?: number }

const POOL = Number(process.env.DB_POOL_MAX || 10)
const marks = lines<Mark>('marks.jsonl')
const samples = lines<Sample>('samples.jsonl')
const log = existsSync(join(dir, 'server.log')) ? readFileSync(join(dir, 'server.log'), 'utf8').split('\n') : []
const fx = read<{ cold?: Record<string, { ms: number; status: number } | number> }>('fixture.json', {})
const k6 = Object.fromEntries(readdirSync(dir).filter((f) => /^k6-.*\.json$/.test(f)).map((f) => [f.slice(3, -5), read<K6>(f, null as never)]))

// The first second a condition held for `run` seconds in a row.
const firstRun = (xs: Sample[], ok: (s: Sample) => boolean, run = 3) => {
  let n = 0
  for (const s of xs) { n = ok(s) ? n + 1 : 0; if (n >= run) return s.t }
  return null
}
const max = (xs: (number | null | undefined)[]) => xs.reduce<number>((m, x) => (typeof x === 'number' && x > m ? x : m), 0)

type Layer = { layer: string; at: number; why: string }
const levels = marks.map((m) => {
  const xs = samples.filter((s) => s.level === m.level)
  const logSlice = log.slice(m.logFrom, m.logTo ?? log.length)
  const poolTimeouts = logSlice.filter((l) => /timeout exceeded when trying to connect/i.test(l)).length
  const tooMany = logSlice.filter((l) => /too many clients|remaining connection slots/i.test(l)).length
  const errors = logSlice.filter((l) => /error/i.test(l)).length
  const layers: Layer[] = []
  const cpuAt = firstRun(xs, (s) => (s.appCpu ?? 0) >= 90)
  if (cpuAt) layers.push({ layer: 'rendering', at: cpuAt, why: `the app process at ${max(xs.map((s) => s.appCpu))}% of a core (Node renders on one)` })
  const poolAt = firstRun(xs, (s) => (s.app_conns ?? 0) >= POOL, 1)
  if (poolTimeouts || tooMany) layers.push({ layer: 'connections', at: poolAt ?? m.start, why: `${poolTimeouts ? `the app's pool of ${POOL} ran out (${poolTimeouts} requests timed out waiting)` : ''}${tooMany ? ` Postgres refused ${tooMany} connections` : ''}`.trim() })
  else if ((max(xs.map((s) => s.total)) || 0) >= 0.9 * (xs[0]?.max_connections ?? 100)) layers.push({ layer: 'connections', at: firstRun(xs, (s) => (s.total ?? 0) >= 0.9 * (s.max_connections ?? 100), 1)!, why: `Postgres at ${max(xs.map((s) => s.total))} of ${xs[0]?.max_connections} connections` })
  const lockAt = firstRun(xs, (s) => (s.lock_waits ?? 0) > 0)
  const slowAt = firstRun(xs, (s) => (s.longest_ms ?? 0) >= 1000, 1)
  if (lockAt || slowAt) layers.push({ layer: 'database', at: Math.min(lockAt ?? Infinity, slowAt ?? Infinity), why: [lockAt && `lock waits up to ${max(xs.map((s) => s.lock_waits))}`, slowAt && `a query running ${max(xs.map((s) => s.longest_ms))} ms`].filter(Boolean).join(', ') })
  layers.sort((a, b) => a.at - b.at)
  const r = k6[m.level]
  const broke = !r || (r.broke?.length ?? 0) > 0 || (m.exit !== undefined && m.exit !== 0 && m.exit !== 99)
  return {
    level: m.level, r, broke, layers, poolTimeouts, errors,
    peaks: { appCpu: max(xs.map((s) => s.appCpu)), appConns: max(xs.map((s) => s.app_conns)), restConns: max(xs.map((s) => s.rest_conns)), total: max(xs.map((s) => s.total)), active: max(xs.map((s) => s.active)), longest: max(xs.map((s) => s.longest_ms)), locks: max(xs.map((s) => s.lock_waits)) },
    poolFullSeconds: xs.filter((s) => (s.app_conns ?? 0) >= POOL).length,
  }
})

const firstBroken = levels.find((l) => l.broke && l.r)
const firstSaturated = levels.flatMap((l) => l.layers.map((x) => ({ ...x, level: l.level }))).sort((a, b) => a.at - b.at)[0]
const cold = fx.cold as Record<string, { ms: number; status: number }> & { warmMedianMs?: number } | undefined
const coldMs = cold?.pageSignedOut?.ms
const warm = (fx.cold as { warmMedianMs?: number } | undefined)?.warmMedianMs
const ms = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n)} ms`)
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 1000) / 10}%`)

const headline = firstBroken
  ? `**First to break: ${firstBroken.r?.load ?? firstBroken.level} (${firstBroken.level})** — ${firstBroken.layers[0] ? `${firstBroken.layers[0].layer}: ${firstBroken.layers[0].why}` : 'over budget with no layer past its line; the slowest part is the request itself'}. ${firstBroken.r?.broke?.length ? `Failed: ${firstBroken.r.broke.join('; ')}.` : ''}`
  : `**Nothing broke** at any level run (up to ${levels.filter((l) => l.level.startsWith('view')).map((l) => l.r?.load).pop() ?? '—'}).`
const out = [
  `## Load simulation — ${new Date().toISOString().slice(0, 10)}`,
  '',
  headline,
  firstSaturated ? `\nFirst layer to saturate: **${firstSaturated.layer}** during ${firstSaturated.level} (${firstSaturated.why}).` : '\nNo layer crossed its line (app CPU 90% for 3 s, the pool timing out, a lock wait for 3 s, a query over 1 s).',
  '',
  '| Level | Load | req/s | p50 | p95 | failed | handled | Result | App CPU peak | App DB conns (pool) | Longest query | Lock waits | Saturated |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...levels.map((l) => `| ${l.level} | ${l.r?.load ?? '—'} | ${l.r?.rps ?? '—'} | ${ms(l.r?.p50)} | ${ms(l.r?.p95)} | ${pct(l.r?.failed)} | ${pct(l.r?.handled)} | ${!l.r ? '⚪ did not run' : l.broke ? '🔴 broke' : '🟢'} | ${l.peaks.appCpu}% | ${l.peaks.appConns} (${POOL}${l.poolTimeouts ? `, ${l.poolTimeouts} timeouts` : ''}) | ${ms(l.peaks.longest)} | ${l.peaks.locks} | ${l.layers.map((x) => x.layer).join(', ') || '—'} |`),
  '',
  `Cold start: the first request to a fresh server took ${ms(coldMs)} for the Page signed out, ${ms(cold?.pageSignedIn?.ms)} signed in, ${ms(cold?.heart?.ms)} for the first ♡ and ${ms(cold?.report?.ms)} for the first report; a warm Page takes ${ms(warm)} (median of 10).`,
  ...levels.filter((l) => l.r?.refused).map((l) => `\n${l.level}: ${l.r.refused} reports were refused by the report caps (the handler answering, counted as handled).`),
  '',
  ...(() => {
    const q = firstBroken ? read<{ query: string; calls: number; mean_ms: number; max_ms: number }[]>(`queries-${firstBroken.level}.json`, []) : []
    return q.length ? [`Heaviest queries during ${firstBroken!.level}:`, '', '| calls | mean | max | query |', '|---|---|---|---|', ...q.map((x) => `| ${x.calls} | ${ms(x.mean_ms)} | ${ms(x.max_ms)} | \`${x.query.replace(/\|/g, '\\|')}\` |`), ''] : []
  })(),
  `Budgets: p95 under 1 s and under 1% failing, per level. One machine runs the app (\`next start\`, one Node process, pool of ${POOL} database connections, as each Vercel function has), the database and k6 together, so this names the layer that saturates first and by how much, not production's ceiling.`,
]
writeFileSync(join(dir, 'summary.md'), out.join('\n') + '\n')
writeFileSync(join(dir, 'result.json'), JSON.stringify({ firstBroken: firstBroken && { level: firstBroken.level, load: firstBroken.r?.load, layers: firstBroken.layers }, firstSaturated, levels: levels.map(({ level, r, broke, layers, peaks, poolTimeouts }) => ({ level, ...r, broke, layers, peaks, poolTimeouts })), cold: fx.cold }, null, 2))
console.log(out.join('\n'))
