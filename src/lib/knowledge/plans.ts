// F127 (#1238): the lookup tool's verbs for plans: what a version holds (now
// or on any date), what changed between two dates, and Now / Next / Later.
//
// Kept in its own file so the verb list in tools.ts grows by one line. Each
// verb reads through the store's own functions (plan_as_of, plan_changes,
// left_out_due, roadmap) on a connection already holding the caller's key, so
// row-level security decides what comes back. Answers are short plain text.

import { z } from 'zod'
import type { ClientBase } from 'pg'
import type { KnowledgeTool, ToolResult } from './tools'

const define = <S extends z.ZodRawShape>(t: KnowledgeTool<S>) => t as unknown as KnowledgeTool

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'A date as YYYY-MM-DD.')

/** The end of a day, so "on 2026-11-10" includes everything that happened that day. */
const endOf = (d: string) => `${d}T23:59:59.999Z`

interface SliceLine {
  slice: string
  answer?: string
  status?: string
  feature?: string
  feature_answer?: string
  reason?: string
  condition?: string | null
  condition_status?: string | null
}

interface Plan {
  id: string
  name: string
  status: string
  why: string | null
  due_on: string | null
  version: number
  since: string
  because: string
  outcome: string | null
  outcomes: string[]
  appetite: string
  includes: SliceLine[]
  leaves_out: SliceLine[]
}

/** Versions by id or name; with nothing given, every planned or current one. */
async function findVersions(db: ClientBase, version?: string): Promise<{ id: string; answer: string }[]> {
  const { rows } = await db.query<{ id: string; answer: string }>(
    `select id, answer from knowledge.records
      where kind = 'version'
        and case when $1::text is null then status in ('planned', 'current')
                 else id = $1 or lower(answer) = lower(btrim($1)) end
      order by id`,
    [version ?? null],
  )
  return rows
}

const sliceWords = (s: SliceLine) =>
  `${s.slice}${s.answer ? ` ${s.answer}` : ''}${s.feature ? ` (${s.feature}${s.feature_answer ? ` ${s.feature_answer}` : ''})` : ''}` +
  `${s.status && s.status !== 'planned' ? `, ${s.status}` : ''}`

export async function planText(db: ClientBase, id: string, on?: string): Promise<string | null> {
  const { rows } = await db.query<{ p: Plan | null }>('select knowledge.plan_as_of($1, $2::timestamptz) as p', [
    id,
    on ? endOf(on) : new Date().toISOString(),
  ])
  const p = rows[0]?.p
  if (!p) return null
  const lines = [
    `${p.id} · ${p.status}: ${p.name}${p.due_on ? ` (due ${p.due_on})` : ''}${on ? `, as it was on ${on}` : ''}`,
    `For: ${p.outcomes.join('; ')}. Appetite: ${p.appetite}.`,
    `This plan since ${p.since.slice(0, 10)} (version ${p.version}): ${p.because}${p.outcome ? ` [outcome: ${p.outcome}]` : ''}`,
    'Includes:',
    ...(p.includes.length ? p.includes.map((s) => `- ${sliceWords(s)}`) : ['- nothing yet']),
    'Leaves out:',
    ...(p.leaves_out.length
      ? p.leaves_out.map(
          (s) =>
            `- ${sliceWords(s)}: ${s.reason}${s.condition ? ` Back when ${s.condition} is met (now ${s.condition_status ?? 'unknown'}).` : ''}`,
        )
      : ['- nothing']),
  ]
  if (!on) {
    const { rows: due } = await db.query<{ slice: string; answer: string | null; due: string }>(
      'select slice, answer, due from knowledge.left_out_due($1)',
      [id],
    )
    if (due.length) lines.push('Back on the table:', ...due.map((d) => `- ${d.slice}${d.answer ? ` ${d.answer}` : ''}: ${d.due}`))
  }
  return lines.join('\n')
}

export const PLAN_TOOLS: KnowledgeTool[] = [
  define({
    name: 'plan',
    description:
      'What a version holds: the outcomes it is for, its appetite, the slices it includes and the ones it leaves out with the reason and ' +
      'the condition that brings each back, and the why of the plan. Give a date for the plan as it was that day. With no version, ' +
      'every planned or current one. Today\'s answer ends with the left-out slices that are back on the table: their condition is met, ' +
      'or the outcomes changed since they were left out.',
    input: {
      version: z.string().optional().describe('A version id, such as VN-0001, or its name.'),
      on: day.optional().describe('A date, YYYY-MM-DD: the plan as it stood at the end of that day.'),
    },
    run: async (db, { version, on }): Promise<ToolResult> => {
      const found = await findVersions(db, version)
      if (found.length === 0) {
        return { text: version ? `No version "${version}" that this key can read.` : 'No planned or current version yet.', isError: !!version }
      }
      const out: string[] = []
      for (const v of found) {
        const t = await planText(db, v.id, on)
        out.push(t ?? `${v.id} ${v.answer}: no plan on ${on}.`)
      }
      return { text: out.join('\n\n') }
    },
  }),

  define({
    name: 'plan_changes',
    description:
      'What changed in the plan between two dates, each change with its why and the outcome that changed: outcomes and appetite before ' +
      'and after, and the slices included, dropped, left out and brought back. For one version, or all.',
    input: {
      from: day.describe('From the end of this day, YYYY-MM-DD.'),
      to: day.optional().describe('To the end of this day, YYYY-MM-DD; today if left out.'),
      version: z.string().optional().describe('A version id, such as VN-0001, or its name.'),
    },
    run: async (db, { from, to, version }) => {
      let id: string | null = null
      if (version) {
        const found = await findVersions(db, version)
        if (found.length !== 1) return { text: `No single version "${version}" that this key can read.`, isError: true }
        id = found[0].id
      }
      const { rows } = await db.query<{
        version_id: string; name: string; version: number; at: Date; why: string; outcome: string | null
        outcomes_before: string[] | null; outcomes_after: string[]; appetite_before: string | null; appetite_after: string
        included: string[]; dropped: string[]; left_out: string[]; brought_back: string[]
      }>('select * from knowledge.plan_changes($1::timestamptz, $2::timestamptz, $3)', [
        endOf(from),
        to ? endOf(to) : new Date().toISOString(),
        id,
      ])
      if (rows.length === 0) return { text: `No change of plan after ${from}${to ? ` up to ${to}` : ''}.` }
      const list = (label: string, xs: string[]) => (xs.length ? `${label} ${xs.join(', ')}` : null)
      return {
        text: rows
          .map((c) => {
            const parts = [
              c.outcomes_before === null
                ? `first plan, for ${c.outcomes_after.join('; ')}`
                : JSON.stringify(c.outcomes_before) !== JSON.stringify(c.outcomes_after)
                  ? `outcomes ${c.outcomes_before.join('; ')} -> ${c.outcomes_after.join('; ')}`
                  : null,
              c.appetite_before !== null && c.appetite_before !== c.appetite_after ? `appetite ${c.appetite_before} -> ${c.appetite_after}` : null,
              list('in:', c.included),
              list('out:', c.dropped),
              list('left out:', c.left_out),
              list('no longer left out:', c.brought_back),
            ].filter(Boolean)
            return `- ${new Date(c.at).toISOString().slice(0, 10)} ${c.version_id} ${c.name} v${c.version}: ${c.why}` +
              `${c.outcome ? ` [outcome: ${c.outcome}]` : ''}\n  ${parts.join('; ')}`
          })
          .join('\n'),
      }
    },
  }),

  define({
    name: 'roadmap',
    description:
      'Now / Next / Later: every slice not shipped or withdrawn, by horizon and rank, with its feature and the unmet conditions it waits on.',
    input: {},
    run: async (db) => {
      const { rows } = await db.query<{
        horizon: string; rank: number; slice: string; answer: string; status: string; feature: string | null; waits_on: string[]
      }>('select * from knowledge.roadmap()')
      if (rows.length === 0) return { text: 'Nothing planned that this key can read.' }
      const out: string[] = []
      for (const h of ['now', 'next', 'later']) {
        const lane = rows.filter((r) => r.horizon === h)
        out.push(`${h[0].toUpperCase()}${h.slice(1)} (${lane.length}):`)
        out.push(
          ...lane.map(
            (r) =>
              `- ${r.rank} ${r.slice} ${r.answer}${r.status === 'building' ? ', building' : ''}` +
              `${r.waits_on.length ? ` (waits on ${r.waits_on.join(', ')})` : ''}`,
          ),
        )
      }
      return { text: out.join('\n') }
    },
  }),
]
