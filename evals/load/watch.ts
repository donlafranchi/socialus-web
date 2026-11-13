#!/usr/bin/env tsx
// #1261 — load simulation: what each layer is doing while the crowd runs.
//   npx tsx evals/load/watch.ts sample <app pid>   one line a second to load-out/samples.jsonl until stopped
//   npx tsx evals/load/watch.ts reset              clear the slow-query counters before a level
//   npx tsx evals/load/watch.ts top <level>        the slowest queries of that level to load-out/queries-<level>.json
// The level being run is read from load-out/current (run.sh writes it). LOCAL ONLY, like prepare.ts.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { Client } from 'pg'

const OUT = process.env.LOAD_OUT || 'load-out'
const url = process.env.DATABASE_URL ?? ''
if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(new URL(url).hostname)) throw new Error('DATABASE_URL is not this machine')
const db = new Client({ connectionString: url, application_name: 'load-watch' })
const [cmd, arg] = process.argv.slice(2)

// Cumulative CPU seconds of a process and its children ("[DD-]HH:MM:SS" on Linux, "M:SS.ss" on a Mac).
function cpuSeconds(pid: string): number | null {
  try {
    const kids = (() => { try { return execFileSync('pgrep', ['-P', pid], { encoding: 'utf8' }).trim().split('\n').filter(Boolean) } catch { return [] } })()
    return [pid, ...kids].reduce((sum, p) => {
      const t = execFileSync('ps', ['-o', 'time=', '-p', p], { encoding: 'utf8' }).trim()
      if (!t) return sum
      const [days, rest] = t.includes('-') ? [Number(t.split('-')[0]), t.split('-')[1]!] : [0, t]
      return sum + days * 86400 + rest.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)
    }, 0)
  } catch { return null }
}

const SAMPLE = `
  select count(*)::int as total,
         count(*) filter (where state = 'active' and backend_type = 'client backend' and application_name <> 'load-watch')::int as active,
         count(*) filter (where wait_event_type = 'Lock')::int as lock_waits,
         count(*) filter (where usename = 'postgres' and backend_type = 'client backend' and application_name <> 'load-watch')::int as app_conns,
         count(*) filter (where usename = 'authenticator')::int as rest_conns,
         count(*) filter (where usename = 'supabase_auth_admin')::int as auth_conns,
         coalesce(round(max(extract(epoch from now() - query_start) * 1000) filter (
           where state = 'active' and backend_type = 'client backend' and application_name <> 'load-watch')), 0)::int as longest_ms,
         current_setting('max_connections')::int as max_connections
    from pg_stat_activity`

async function sample(pid: string) {
  let last = { t: Date.now(), cpu: cpuSeconds(pid) }
  let stop = false
  process.on('SIGTERM', () => (stop = true))
  process.on('SIGINT', () => (stop = true))
  while (!stop) {
    await new Promise((r) => setTimeout(r, 1000))
    const level = existsSync(join(OUT, 'current')) ? readFileSync(join(OUT, 'current'), 'utf8').trim() : ''
    const now = { t: Date.now(), cpu: cpuSeconds(pid) }
    const appCpu = now.cpu !== null && last.cpu !== null ? Math.round(((now.cpu - last.cpu) / ((now.t - last.t) / 1000)) * 100) : null
    last = now
    try {
      const row = (await db.query(SAMPLE)).rows[0]
      appendFileSync(join(OUT, 'samples.jsonl'), JSON.stringify({ t: now.t, level, appCpu, ...row }) + '\n')
    } catch (e) {
      appendFileSync(join(OUT, 'samples.jsonl'), JSON.stringify({ t: now.t, level, appCpu, dbError: String(e) }) + '\n')
    }
  }
}

async function main() {
  await db.connect()
  if (cmd === 'sample') await sample(arg ?? '')
  else if (cmd === 'reset') await db.query(`select extensions.pg_stat_statements_reset()`).catch(() => db.query(`select pg_stat_statements_reset()`)).catch(() => {})
  else if (cmd === 'top') {
    const rows = await db.query(
      `select left(regexp_replace(query, '\\s+', ' ', 'g'), 160) as query, calls::int, round(mean_exec_time::numeric, 1)::float as mean_ms,
              round(max_exec_time::numeric, 1)::float as max_ms, round(total_exec_time::numeric)::float as total_ms
         from pg_stat_statements
        where calls >= 5 and query not ilike '%pg_stat%'
        order by total_exec_time desc limit 5`).then((r) => r.rows).catch(() => [])
    writeFileSync(join(OUT, `queries-${arg}.json`), JSON.stringify(rows, null, 2))
  } else throw new Error('usage: watch.ts sample <pid> | reset | top <level>')
  await db.end()
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
