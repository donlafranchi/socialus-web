// Rebuilds docs/INFRA-INVENTORY.md: everything in the project that runs on its
// own or by hand, so the PM can decide what to keep, restore or remove (Don,
// 2026-11-26, option A: a generated list, with the reasons kept in the
// knowledge store rather than a hand-kept register).
//
// Facts come from the live sources, never from memory:
//   - GitHub jobs: every .github/workflows/*.yml (name, triggers, the purpose
//     line from its header comment, the ticket or ruling it cites), plus each
//     one's last run and result from the GitHub API (via `gh`).
//   - Scheduled tasks (Claude sessions on a timer): no API reaches them from a
//     script or from CI, so an agent saves the live list to
//     docs/infra/scheduled-tasks.json with `--tasks <file>` (the raw output of
//     the list_triggers tool). Prompts and connector ids are dropped on save.
// Judgments a person made (keep / restore / remove / ask the PM, and the record
// that holds the why) live in docs/infra/judgments.json. An item with none
// shows as "not reviewed yet".
//
// Run: npm run infra:inventory                       (rewrite the doc)
//      npm run infra:inventory -- --tasks raw.json   (refresh the scheduled tasks first)
//      npm run infra:inventory -- --offline          (skip the GitHub API: no last runs)
// Services we pay for or sign up to are INFRASTRUCTURE.md's job, not this file's.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const WORKFLOWS = join(ROOT, '.github/workflows')
const TASKS = join(ROOT, 'docs/infra/scheduled-tasks.json')
const JUDGMENTS = join(ROOT, 'docs/infra/judgments.json')
const OUT = join(ROOT, 'docs/INFRA-INVENTORY.md')
const REPO = 'donlafranchi/socialus-web'
const DAY = 86_400_000

export type Trigger = 'timer' | 'pr-or-merge' | 'by-hand' | 'event'

export interface Job {
  file: string
  name: string
  purpose: string
  cites: string | null
  triggers: Trigger[]
  crons: string[]
  runs?: number
  lastRun?: string | null
  result?: string | null
}

export interface Task {
  name: string
  schedule: string
  on: boolean
  oneShot: boolean
  lastRun: string | null
  created: string
  changed: string
  purpose: string
}

export interface Judgment {
  rec: 'keep' | 'restore' | 'remove' | 'ask-pm'
  note: string
  why?: string
}

// ---------- GitHub jobs ----------

export function parseWorkflow(file: string, text: string): Job {
  const lines = text.split('\n')
  const name = /^name:\s*(.+)$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? file
  // The header comment, up to `on:`; its first sentence says what the job is for.
  const header: string[] = []
  for (const l of lines) {
    if (/^on:/.test(l)) break
    if (l.startsWith('#')) header.push(l.replace(/^#\s?/, ''))
  }
  const prose = header.join(' ').replace(/\s+/g, ' ').trim()
  const lead = /^((#\d+|F\d+)([\s,/]+(#\d+|T\d+|F\d+))*)\s*(\([^)]*\))?\s*([—:-]+\s*)?/
  const bare = prose.replace(lead, '')
  const purpose = capital(firstSentence(bare)) || '(no header comment)'
  const cites = /(#\d+|\bF\d{3}\b)/.exec(prose)?.[1] ?? null

  // The `on:` block: its top-level keys are the triggers.
  const triggers = new Set<Trigger>()
  const crons: string[] = []
  const at = lines.findIndex((l) => /^on:/.test(l))
  if (at >= 0) {
    const inline = lines[at].replace(/^on:\s*/, '')
    const keys: string[] = []
    if (inline) keys.push(...inline.replace(/[[\]]/g, '').split(',').map((s) => s.trim()))
    for (let i = at + 1; i < lines.length; i++) {
      const l = lines[i]
      if (/^\S/.test(l)) break
      const key = /^ {2}([a-z_]+):/.exec(l)?.[1]
      if (key) keys.push(key)
      const cron = /cron:\s*['"]([^'"]+)['"]/.exec(l)?.[1]
      if (cron) crons.push(cron)
    }
    for (const k of keys) triggers.add(kindOf(k))
  }
  return { file, name, purpose, cites, triggers: [...triggers].sort(), crons }
}

function kindOf(key: string): Trigger {
  if (key === 'schedule') return 'timer'
  if (key === 'workflow_dispatch') return 'by-hand'
  if (['push', 'pull_request', 'pull_request_target', 'merge_group'].includes(key)) return 'pr-or-merge'
  return 'event'
}

function capital(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s
}

function firstSentence(s: string): string {
  const m = /^(.{12,}?[.?!])(\s|$)/.exec(s)
  const one = (m?.[1] ?? s).trim()
  return one.length > 160 ? `${one.slice(0, 157)}…` : one
}

function gh(path: string): unknown {
  return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
}

function addRuns(jobs: Job[]): void {
  const list = gh(`repos/${REPO}/actions/workflows?per_page=100`) as { workflows: { id: number; path: string }[] }
  const ids = new Map(list.workflows.map((w) => [w.path.replace('.github/workflows/', ''), w.id]))
  for (const j of jobs) {
    const id = ids.get(j.file)
    if (!id) continue
    const r = gh(`repos/${REPO}/actions/workflows/${id}/runs?per_page=1`) as {
      total_count: number
      workflow_runs: { created_at: string; conclusion: string | null }[]
    }
    j.runs = r.total_count
    j.lastRun = r.workflow_runs[0]?.created_at ?? null
    j.result = r.workflow_runs[0]?.conclusion ?? (r.workflow_runs[0] ? 'running' : null)
  }
}

// ---------- scheduled tasks ----------

interface RawTrigger {
  name: string
  cron_expression?: string
  run_once_at?: string
  enabled: boolean
  created_at: string
  updated_at: string
  last_fired_at?: string
  derived_state?: { prompt?: string }
}

export function tasksFromRaw(raw: { data: RawTrigger[] }): Task[] {
  return raw.data
    .map((t) => ({
      name: t.name,
      schedule: t.cron_expression || (t.run_once_at ? `once, ${t.run_once_at.slice(0, 16)}Z` : 'no schedule'),
      on: t.enabled,
      oneShot: !t.cron_expression,
      lastRun: t.last_fired_at ?? null,
      created: t.created_at.slice(0, 10),
      changed: t.updated_at.slice(0, 10),
      purpose: firstSentence((t.derived_state?.prompt ?? '').replace(/\s+/g, ' ')),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ---------- the doc ----------

const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : 'never')
const ageDays = (iso: string | null | undefined, now: Date) => (iso ? Math.floor((now.getTime() - Date.parse(iso)) / DAY) : Infinity)
const cell = (s: string) => s.replace(/\|/g, '\\|')

// The longest a timer job should go between runs, read from its crons: monthly
// (a fixed day of the month) 35 days, weekly (a fixed weekday) 8, otherwise 2.
export function expectedGapDays(crons: string[]): number | null {
  if (!crons.length) return null
  const gaps = crons.map((c) => {
    const [, , dom, , dow] = c.trim().split(/\s+/)
    if (dom && dom !== '*') return 35
    if (dow && dow !== '*') return 8
    return 2
  })
  return Math.min(...gaps)
}

export function flagsFor(j: Job, now: Date): string[] {
  const f: string[] = []
  if (j.runs === 0) f.push('never run')
  if (j.result === 'failure') f.push('last run failed')
  if (j.triggers.length === 1 && j.triggers[0] === 'by-hand' && ageDays(j.lastRun, now) > 30 && j.runs !== 0) f.push('unused 30+ days')
  const gap = expectedGapDays(j.crons)
  if (gap && j.lastRun !== undefined && ageDays(j.lastRun, now) > gap) f.push(`timer silent ${gap}+ days`)
  return f
}

export function render(jobs: Job[], tasks: Task[], judgments: Record<string, Judgment>, now: Date, tasksAsOf: string | null): string {
  const judged = (key: string) => judgments[key]
  const recCell = (key: string) => {
    const j = judged(key)
    return j ? `${j.rec}${j.why ? ` (${j.why})` : ''}: ${cell(j.note)}` : 'not reviewed yet'
  }
  const live = tasks.filter((t) => !t.oneShot)
  const off = live.filter((t) => !t.on)
  const flagged = jobs.map((j) => ({ j, f: flagsFor(j, now) })).filter((x) => x.f.length > 0)
  const groups: [string, string, (j: Job) => boolean][] = [
    ['on a timer', 'Run by themselves on a schedule.', (j) => j.triggers.includes('timer')],
    ['on every PR or merge', 'The checks and the follow-ups to a merge.', (j) => !j.triggers.includes('timer') && j.triggers.includes('pr-or-merge')],
    ['on an event', 'Fired by an Issue, a label, a comment or another job.', (j) => !j.triggers.includes('timer') && !j.triggers.includes('pr-or-merge') && j.triggers.includes('event')],
    ['by hand only', 'Nothing runs these unless a person or agent starts them.', (j) => j.triggers.length > 0 && j.triggers.every((t) => t === 'by-hand')],
  ]

  const out: string[] = []
  out.push('# What runs in SocialUs', '')
  out.push(`**As of ${now.toISOString().slice(0, 10)}.** Generated by \`npm run infra:inventory\` (\`scripts/infra-inventory.ts\`); do not edit by hand. Judgments live in \`docs/infra/judgments.json\`; the reasons behind them in the knowledge store. Services we sign up to: \`INFRASTRUCTURE.md\`.`, '')

  type Row = { key: string; line: string }
  const rows: Row[] = [
    ...off.map((t) => ({ key: `task:${t.name}`, line: `| ${cell(t.name)} | scheduled task | off since ${t.changed}; last ran ${day(t.lastRun)} |` })),
    ...flagged.map(({ j, f }) => ({ key: `job:${j.file}`, line: `| ${cell(j.name)} | GitHub job | ${f.join(', ')}; last ran ${day(j.lastRun)} |` })),
  ]
  const order = { 'ask-pm': 0, restore: 1, remove: 2, undefined: 3, keep: 4 } as Record<string, number>
  rows.sort((a, b) => order[String(judged(a.key)?.rec)] - order[String(judged(b.key)?.rec)])
  const open = rows.filter((r) => judged(r.key)?.rec !== 'keep')
  const kept = rows.filter((r) => judged(r.key)?.rec === 'keep')
  const forPm = open.filter((r) => judged(r.key)?.rec === 'ask-pm').length

  out.push('## Needs a decision', '')
  out.push(`**${open.length} item${open.length === 1 ? '' : 's'} to restore, remove or decide; ${forPm} of them ${forPm === 1 ? 'is' : 'are'} the PM's call.** The rest are agents' calls, reported here.`, '')
  out.push('| What | Kind | Signal | Suggested |', '|---|---|---|---|')
  for (const r of open) out.push(`${r.line} ${recCell(r.key)} |`)
  out.push('')
  if (kept.length) {
    out.push(`**${kept.length} more look idle or red but are kept on purpose.**`, '')
    out.push('<details><summary>Details</summary>', '')
    out.push('| What | Kind | Signal | Why kept |', '|---|---|---|---|')
    for (const r of kept) out.push(`${r.line} ${cell(judged(r.key)!.note)} |`)
    out.push('', '</details>', '')
  }

  out.push('## Scheduled tasks', '')
  out.push(`**${live.length} Claude sessions are set to run on a timer; ${off.length} of them are off.** ${tasksAsOf ? `Saved from the live list on ${tasksAsOf}.` : 'Not saved yet.'}`, '')
  out.push('<details><summary>Details</summary>', '')
  out.push('| Task | On | Schedule | Last ran | What it does | Suggested |', '|---|---|---|---|---|---|')
  for (const t of live) out.push(`| ${cell(t.name)} | ${t.on ? 'on' : '**off**'} | \`${t.schedule}\` | ${day(t.lastRun)} | ${cell(t.purpose)} | ${recCell(`task:${t.name}`)} |`)
  const shots = tasks.filter((t) => t.oneShot)
  if (shots.length) out.push('', `Plus ${shots.length} one-off reminder${shots.length === 1 ? '' : 's'} sessions set for themselves (${shots.map((t) => cell(t.name)).join('; ')}); they end on their own.`)
  out.push('', '</details>', '')

  for (const [title, lede, pick] of groups) {
    const g = jobs.filter(pick)
    if (!g.length) continue
    out.push(`## GitHub jobs: ${title}`, '')
    out.push(`**${g.length} job${g.length === 1 ? '' : 's'}.** ${lede}`, '')
    out.push('<details><summary>Details</summary>', '')
    out.push('| Job | What it does | Why (ticket or ruling) | Last ran | Result | Suggested |', '|---|---|---|---|---|---|')
    for (const j of g) {
      const when = j.crons.length ? ` \`${j.crons.join('`, `')}\`` : ''
      out.push(`| ${cell(j.name)}${when} | ${cell(j.purpose)} | ${j.cites ?? '—'} | ${j.lastRun === undefined ? '?' : day(j.lastRun)} | ${j.result ?? '—'} | ${recCell(`job:${j.file}`)} |`)
    }
    out.push('', '</details>', '')
  }
  return out.join('\n')
}

// ---------- main ----------

function main(): void {
  const args = process.argv.slice(2)
  const at = args.indexOf('--tasks')
  if (at >= 0) {
    const raw = JSON.parse(readFileSync(args[at + 1], 'utf8'))
    const saved = { asOf: new Date().toISOString().slice(0, 10), tasks: tasksFromRaw(raw) }
    writeFileSync(TASKS, `${JSON.stringify(saved, null, 2)}\n`)
  }
  const jobs = readdirSync(WORKFLOWS)
    .filter((f) => /\.ya?ml$/.test(f))
    .sort()
    .map((f) => parseWorkflow(f, readFileSync(join(WORKFLOWS, f), 'utf8')))
  if (!args.includes('--offline')) addRuns(jobs)
  const saved = existsSync(TASKS) ? JSON.parse(readFileSync(TASKS, 'utf8')) : { asOf: null, tasks: [] }
  const judgments = existsSync(JUDGMENTS) ? JSON.parse(readFileSync(JUDGMENTS, 'utf8')) : {}
  writeFileSync(OUT, render(jobs, saved.tasks, judgments, new Date(), saved.asOf))
  console.log(`Wrote ${OUT}: ${jobs.length} GitHub jobs, ${saved.tasks.length} scheduled tasks.`)
}

if (process.argv[1]?.endsWith('infra-inventory.ts')) main()
