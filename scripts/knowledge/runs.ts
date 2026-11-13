// F135 (#1274): each run of a repeated routine keeps a dated record in the
// store. The writer for the three places a run, or what followed it, comes from:
//
//   record-load <dir>   The Load simulation workflow, when a run ends, pass or
//                       fail: reads <dir>/result.json (evals/load/summarize.ts)
//                       and records the run through knowledge.record_run. A
//                       run that stopped before its first level is recorded as
//                       failed. Without --commit it is rolled back; with
//                       --print it only prints the record (the workflow's PR
//                       runs, which test the harness, not the platform).
//   link-pr             knowledge-run-links.yml, when a PR merges: every run
//                       (RN-0001), idea (ID-0001) or practice
//                       (practice.<slug>) the PR body names is linked to it.
//   (import)            loadRuns(), called by the knowledge import: the
//                       routines in routines.json and the runs in
//                       runs-seed.json, the runs from before runs recorded
//                       themselves (F135.5: the first load simulation).
//
// Every write is an operator's (the routine records for the PM), through the
// store's functions only. Writing the same run twice changes nothing: its key
// is the workflow run.

import { Client, type ClientBase } from 'pg'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const LOAD_PRACTICE = 'practice.load-sim-and-checkpoints'

export interface Routine {
  practice: string
  name: string
  every_days: number
  workflow: string | null
}

export interface RunIn {
  practice: string
  key: string
  ran_on: string
  commit: string
  members: number | null
  outcome: 'passed' | 'failed'
  summary: string
  numbers: Record<string, unknown>
  broke_first: string | null
  url: string | null
  ideas: string[]
}

/** A run from before runs recorded themselves, with the PRs that followed it. */
export interface SeedRun extends RunIn {
  /** When it ran, for the record's history. */
  at: string
  /** PRs merged after it; `ideas` names the ideas (by their words) each one acted on, so the next run marks them tried. */
  changed_after?: { url: string; label: string; merged_at: string; ideas?: string[] }[]
}

// ---------------------------------------------------------------------------
// A load run, as a record.

interface Layer {
  layer: string
  why: string
}
interface LoadLevel {
  level: string
  load?: string
  rps?: number
  p50?: number
  p95?: number
  failed?: number
  broke: boolean
  layers: Layer[]
  poolTimeouts?: number
  refused?: number | null
}
export interface LoadResult {
  firstBroken?: { level: string; load?: string; layers: Layer[] } | null
  firstSaturated?: { layer: string; level: string; why: string } | null
  levels: LoadLevel[]
  cold?: Record<string, unknown>
}

/**
 * What to try next when a layer saturates first. A starting point the routine
 * leaves on the list; the PM keeps or drops each one (F135.4). Same words each
 * time, so a layer that keeps breaking joins its open idea rather than adding one.
 */
export const NEXT_FOR_LAYER: Record<string, string> = {
  rendering: 'Cut the server render cost of a Page: cache what signed-out visitors see, or render less per view.',
  connections: "Give the app more database connections at once: a bigger pool per instance, through the transaction pooler.",
  database: 'Index or rewrite the heaviest query during the level that broke.',
}

const ms = (n: number | undefined) => (n === undefined ? '—' : n >= 1000 ? `${Math.round(n / 100) / 10} s` : `${Math.round(n)} ms`)

/** The run's numbers, one entry per level: what the one-call answer compares. */
export function loadNumbers(r: LoadResult): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const l of r.levels) {
    out[l.level] = {
      load: l.load ?? null,
      rps: l.rps ?? null,
      p50_ms: l.p50 === undefined ? null : Math.round(l.p50),
      p95_ms: l.p95 === undefined ? null : Math.round(l.p95),
      failed: l.failed ?? null,
      broke: l.broke,
      saturated: l.layers.map((x) => x.layer),
      ...(l.poolTimeouts ? { pool_timeouts: l.poolTimeouts } : {}),
      ...(l.refused ? { refused: l.refused } : {}),
    }
  }
  return out
}

/** "rendering at 200 viewers (view-out-200)", or null when nothing broke. */
export function brokeFirst(r: LoadResult): string | null {
  const b = r.firstBroken
  if (!b) return null
  const layer = b.layers[0]?.layer ?? 'the request itself (over budget, no layer past its line)'
  return `${layer} at ${b.load ?? b.level} (${b.level})`
}

/** The run in one line, as the history lists it. */
export function loadSummary(r: LoadResult | null, outcome: 'passed' | 'failed'): string {
  if (!r || r.levels.length === 0) return 'The load simulation stopped before its first level.'
  const b = r.firstBroken
  const top = r.levels.filter((l) => l.level.startsWith('view')).map((l) => l.load).filter(Boolean).pop()
  const head = b
    ? `First to break: ${b.load ?? b.level} (${b.level}), ${b.layers[0]?.layer ?? 'over budget'}`
    : `Nothing broke${top ? ` up to ${top}` : ''}`
  const at = r.levels.find((l) => l.level === b?.level)
  return `${head}${at ? `; p95 ${ms(at.p95)} there` : ''}.${outcome === 'failed' ? ' The run failed.' : ''}`
}

/** The ideas a load run leaves: one per layer that broke first, plus any the person running it typed. */
export function loadIdeas(r: LoadResult | null, typed: string | undefined): string[] {
  const out: string[] = []
  const first = r?.firstBroken?.layers[0]?.layer
  if (first && NEXT_FOR_LAYER[first]) out.push(NEXT_FOR_LAYER[first])
  for (const t of (typed ?? '').split(/\n|;/)) if (t.trim()) out.push(t.trim())
  return [...new Set(out)]
}

/** The membership size a load run simulated: its largest crowd of viewers. */
export function loadMembers(levels: string | undefined, r: LoadResult | null): number | null {
  const fromEnv = (levels ?? '').split(/\s+/).map(Number).filter((n) => Number.isFinite(n) && n > 0)
  const fromRun = (r?.levels ?? []).map((l) => Number(/-(\d+)$/.exec(l.level)?.[1])).filter((n) => Number.isFinite(n))
  const all = [...fromEnv, ...fromRun]
  return all.length ? Math.max(...all) : null
}

export function loadRun(
  r: LoadResult | null,
  env: Record<string, string | undefined>,
  today = new Date().toISOString().slice(0, 10),
): RunIn {
  const failed = env.LOAD_OUTCOME !== 'success' || !r || r.levels.length === 0
  const outcome = failed ? 'failed' : 'passed'
  const server = env.GITHUB_SERVER_URL ?? 'https://github.com'
  const url = env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY ? `${server}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null
  if (!env.GITHUB_SHA) throw new Error('GITHUB_SHA is not set: a run names its commit.')
  return {
    practice: LOAD_PRACTICE,
    key: env.GITHUB_RUN_ID ? `gh:${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT ?? '1'}` : `local:${env.GITHUB_SHA}:${today}`,
    ran_on: today,
    commit: env.GITHUB_SHA,
    members: loadMembers(env.LOAD_LEVELS, r),
    outcome,
    summary: loadSummary(r, outcome),
    numbers: r ? { levels: loadNumbers(r), cold: r.cold ?? null, scenarios: env.LOAD_SCENARIOS ?? null } : {},
    broke_first: r ? brokeFirst(r) : 'the run stopped before its first level',
    url,
    ideas: loadIdeas(r, env.LOAD_IDEAS),
  }
}

// ---------------------------------------------------------------------------
// A merged PR, linked to what it names.

/** The runs, ideas and practices a PR body names, in the order it names them. */
export function namedIn(body: string | null | undefined): string[] {
  const found = (body ?? '').match(/\b(?:RN-\d{4,}|ID-\d{4,}|practice\.[a-z0-9][a-z0-9-]*[a-z0-9])\b/g) ?? []
  return [...new Set(found)]
}

// ---------------------------------------------------------------------------
// The store.

export function readJson<T>(path: string): T | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as T) : null
}

export const ROUTINES_PATH = join(__dirname, 'routines.json')
export const RUNS_SEED_PATH = join(__dirname, 'runs-seed.json')

export async function recordRun(db: ClientBase, run: RunIn, effective: string | null = null) {
  const { rows } = await db.query<{ r: { id: string; unchanged?: boolean; ideas?: string[]; still_open?: string[]; tried?: string[] } }>(
    'select knowledge.record_run($1, $2) as r',
    [JSON.stringify(run), effective],
  )
  return rows[0].r
}

export async function linkPr(db: ClientBase, ref: string, url: string, label: string, mergedAt: string) {
  const { rows } = await db.query<{ r: { linked: string[] } }>('select knowledge.link_pr($1, $2, $3, $4) as r', [ref, url, label, mergedAt])
  return rows[0].r.linked
}

export interface RunsSummary {
  routines: number
  recorded: string[]
  /** Record versions written: each run, each new idea, each idea marked tried. */
  versions: number
  linked: number
}

/** For the import: the routines, then the runs from before runs recorded themselves. */
export async function loadRuns(
  db: ClientBase,
  routines: Routine[] | null = readJson<{ routines: Routine[] }>(ROUTINES_PATH)?.routines ?? null,
  seed: SeedRun[] | null = readJson<{ runs: SeedRun[] }>(RUNS_SEED_PATH)?.runs ?? null,
): Promise<RunsSummary> {
  const out: RunsSummary = { routines: 0, recorded: [], versions: 0, linked: 0 }
  const have = new Set((await db.query<{ id: string }>(`select id from knowledge.records where kind = 'practice'`)).rows.map((r) => r.id))
  for (const r of routines ?? []) {
    if (!have.has(r.practice)) continue // its practice comes in with the practices seed
    await db.query('select knowledge.set_routine($1, $2, $3, $4)', [r.practice, r.name, r.every_days, r.workflow])
    out.routines++
  }
  for (const s of seed ?? []) {
    if (!have.has(s.practice)) continue
    const { at, changed_after, ...run } = s
    const r = await recordRun(db, run, at)
    if (!r.unchanged) {
      out.recorded.push(r.id)
      out.versions += 1 + (r.ideas?.length ?? 0) + (r.tried?.length ?? 0)
    }
    for (const pr of changed_after ?? []) {
      out.linked += (await linkPr(db, r.id, pr.url, pr.label, pr.merged_at)).length
      for (const words of pr.ideas ?? []) {
        const { rows } = await db.query<{ id: string }>(
          `select l.to_id as id from knowledge.links l join knowledge.records i on i.id = l.to_id
            where l.from_id = $1 and l.type = 'suggests' and knowledge._idea_words(i.answer) = knowledge._idea_words($2)`,
          [r.id, words],
        )
        if (!rows[0]) throw new Error(`runs-seed.json: ${pr.label} names an idea ${r.id} did not leave: "${words}"`)
        out.linked += (await linkPr(db, rows[0].id, pr.url, pr.label, pr.merged_at)).length
      }
    }
  }
  return out
}

export function runsReport(s: RunsSummary): string[] {
  return ['', `Runs (F135): ${s.routines} routine(s); ${s.recorded.length} run(s) recorded${s.recorded.length ? ` (${s.recorded.join(', ')})` : ''}; ${s.linked} PR link(s).`]
}

// ---------------------------------------------------------------------------
// The command line, for the workflows.

async function inStore<T>(commit: boolean, agent: string, fn: (db: Client) => Promise<T>): Promise<T> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set: a run that cannot reach the store is not recorded, so this fails.')
  const { enterStore, leaveStore } = await import('./import')
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    await db.query('begin')
    await enterStore(db, agent)
    const out = await fn(db)
    await leaveStore(db, agent)
    await db.query(commit ? 'commit' : 'rollback')
    return out
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    await db.end()
  }
}

function say(lines: string[]): void {
  console.log(lines.join('\n'))
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n')
}

async function main(): Promise<void> {
  const [mode, dir = 'load-out'] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
  const commit = process.argv.includes('--commit')
  const env = process.env
  const agent = `runs-${env.GITHUB_RUN_ID ?? 'local'}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`
  if (mode === 'record-load') {
    const result = readJson<LoadResult>(join(dir, 'result.json'))
    const run = loadRun(result, env)
    // A PR run of the workflow checks the record it would write and writes nothing.
    if (process.argv.includes('--print')) return say(['', '### Run history (not recorded: a PR run)', '', '```json', JSON.stringify(run, null, 2), '```'])
    const out = await inStore(commit, agent, (db) => recordRun(db, run))
    say([
      '',
      `### Run history${commit ? '' : ' (dry run, rolled back)'}`,
      '',
      out.unchanged ? `- ${out.id}: already recorded.` : `- ${out.id}: ${run.outcome}, ${run.summary}`,
      ...(out.ideas?.length ? [`- New ideas for next time: ${out.ideas.join(', ')}`] : []),
      ...(out.still_open?.length ? [`- Still open: ${out.still_open.join(', ')}`] : []),
      ...(out.tried?.length ? [`- Tried by this run: ${out.tried.join(', ')}`] : []),
      `- Name ${out.id} in a PR body and the PR is linked to this run when it merges.`,
    ])
  } else if (mode === 'link-pr') {
    const names = namedIn(env.PR_BODY)
    if (!names.length) return say(['No run, idea or practice named: nothing to link.'])
    if (!env.PR_URL || !env.PR_NUMBER) throw new Error('PR_URL and PR_NUMBER are needed.')
    const label = `#${env.PR_NUMBER} ${env.PR_TITLE ?? ''}`.trim()
    const linked = await inStore(commit, agent, async (db) => {
      const all: string[] = []
      for (const n of names) all.push(...(await linkPr(db, n, env.PR_URL!, label, env.MERGED_AT ?? new Date().toISOString())))
      return all
    })
    say([`${label}: named ${names.join(', ')}; linked to ${linked.length ? linked.join(', ') : 'nothing new'}.`])
  } else {
    throw new Error('Usage: runs.ts record-load <dir> [--commit | --print] | runs.ts link-pr [--commit]')
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
