// F135 (#1274): the history of a routine and what to try next, in one call.
//
// `runs` answers "how has load changed and what should we try next?" from
// knowledge.run_history: every run in date order with its numbers and what
// broke first, the PRs merged after each, and the practice's open
// try-next-time list, with what was tried or dropped and why. The run records
// are written by the routines themselves (scripts/knowledge/runs.ts).

import { z } from 'zod'
import type { ClientBase } from 'pg'
import type { KnowledgeTool } from './tools'

export interface HistoryRun {
  id: string
  ran_on: string
  outcome: 'passed' | 'failed'
  summary: string
  commit: string
  members: number | null
  numbers: { levels?: Record<string, LevelNumbers> } & Record<string, unknown>
  broke_first: string | null
  url: string | null
  changed_after: { url: string; label: string | null }[]
  tried: string[]
}

interface LevelNumbers {
  load?: string | null
  rps?: number | null
  p95_ms?: number | null
  failed?: number | null
  broke?: boolean
}

export interface RunHistory {
  practice: { id: string; answer: string; name: string; every_days: number; workflow: string | null }
  runs: HistoryRun[]
  open: { id: string; answer: string; since: string; from: string | null }[]
  closed: { id: string; answer: string; status: 'tried' | 'dropped'; on: string; why: string }[]
}

export async function runHistory(db: ClientBase, question: string): Promise<RunHistory | null> {
  const { rows } = await db.query<{ h: RunHistory | null }>('select knowledge.run_history($1) as h', [question])
  return rows[0]?.h ?? null
}

export async function routineNames(db: ClientBase): Promise<string[]> {
  const { rows } = await db.query<{ name: string }>('select name from knowledge.routines order by name')
  return rows.map((r) => r.name)
}

const sec = (n: number | null | undefined) =>
  n == null ? '—' : n >= 1000 ? `${Math.round(n / 100) / 10} s` : `${Math.round(n)} ms`

/** One level's numbers, short: "p95 1.0 s, 65/s, 0% failed". */
function levelLine(name: string, l: LevelNumbers): string {
  const failed = l.failed == null ? '' : `, ${Math.round(l.failed * 1000) / 10}% failed`
  return `${name}${l.broke ? ' (broke)' : ''}: p95 ${sec(l.p95_ms)}${l.rps == null ? '' : `, ${l.rps}/s`}${failed}`
}

/** The answer in words, kept short: the caller pays for every line. */
export function historyText(h: RunHistory): string {
  const out: string[] = [`${h.practice.name} (${h.practice.id}), expected every ${h.practice.every_days} days.`]
  if (h.runs.length === 0) out.push('', 'No runs yet.')
  for (const r of h.runs) {
    out.push(
      '',
      `${r.ran_on} · ${r.id} · ${r.outcome} · ${r.commit.slice(0, 7)}${r.members == null ? '' : ` · ${r.members.toLocaleString('en-US')} members`}`,
      `  ${r.summary}`,
    )
    if (r.broke_first) out.push(`  Broke first: ${r.broke_first}`)
    const levels = Object.entries(r.numbers.levels ?? {})
    if (levels.length) out.push(`  ${levels.map(([n, l]) => levelLine(n, l)).join('; ')}`)
    if (r.tried.length) out.push(`  Tried: ${r.tried.join(', ')}`)
    if (r.changed_after.length) out.push(`  Changed after: ${r.changed_after.map((p) => p.label ?? p.url).join('; ')}`)
    if (r.url) out.push(`  ${r.url}`)
  }
  out.push('', h.open.length ? 'Try next time:' : 'Try next time: nothing open.')
  for (const i of h.open) out.push(`- ${i.id} (since ${i.since}${i.from ? `, from ${i.from}` : ''}): ${i.answer}`)
  if (h.closed.length) {
    out.push('', 'Tried or dropped:')
    for (const i of h.closed) out.push(`- ${i.id} ${i.status} ${i.on}: ${i.answer} (${i.why})`)
  }
  return out.join('\n')
}

const define = <S extends import('zod').ZodRawShape>(t: KnowledgeTool<S>) => t as unknown as KnowledgeTool

export const RUN_TOOLS: KnowledgeTool[] = [
  define({
    name: 'runs',
    description:
      'The history of a repeated routine and what to try next, in one call: every run in date order with its numbers and what broke first, ' +
      'the PRs merged after each, and the open try-next-time list, with what was tried or dropped and why. ' +
      'Name the routine in words ("load simulation", "how has load changed") or by its practice id.',
    input: { routine: z.string().min(1).describe('The routine, in words or as its practice id.') },
    run: async (db, { routine }) => {
      const h = await runHistory(db, routine)
      if (h) return { text: historyText(h) }
      await db.query('select knowledge.log_unanswered($1, null, $2)', [routine, 'run'])
      const names = await routineNames(db)
      return {
        text: `No routine matches "${routine}". Routines with a run history: ${names.length ? names.join(', ') : 'none yet'}.`,
        isError: true,
      }
    },
  }),
  define({
    name: 'drop_idea',
    description:
      "Internal, the PM's key only. Take an idea off a routine's try-next-time list, with why; the date and why are kept. " +
      'An idea otherwise leaves the list only when a later run tried it.',
    input: { id: z.string().regex(/^ID-\d+$/, 'An idea id, ID-0001.'), why: z.string().min(1) },
    run: async (db, { id, why }) => {
      await db.query('select knowledge.drop_idea($1, $2)', [id, why])
      return { text: `${id} dropped: ${why}` }
    },
  }),
]
