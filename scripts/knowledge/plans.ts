// F127 (#1238): today's plan comes in. Each scenario in socialus-plan's
// planning/ becomes a feature in the knowledge store with one slice carrying
// its horizon and rank, so Now / Next / Later reads from the store
// (knowledge.roadmap) while today's generators keep running beside it.
//
// Called by the import (import.ts), in its one transaction, as the store's
// login holding the run's operator key. Writes only through the store's
// functions: knowledge.record for a missing feature, add_slice, move_slice,
// revise for a slice's status, and link for what a scenario depends on.
//
// Re-runnable. A scenario's slice is `<id>-S1`; a later run moves it when the
// frontmatter's horizon or rank moved, and follows its status. A scenario
// with no horizon has no place on the roadmap: it is listed in the run's
// report, not guessed. Shipped scenarios are deleted from socialus-plan at
// sync, so a slice is never withdrawn because its file is gone.

import type { ClientBase } from 'pg'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { frontmatter, featureStatus } from './concepts'

export type Horizon = 'now' | 'next' | 'later'
const HORIZONS: Horizon[] = ['now', 'next', 'later']

export interface PlannedScenario {
  id: string
  title: string
  status: string | null
  horizon: Horizon | null
  rank: number | null
  depends: string[]
  file: string
}

/** `F125, F126`, `[F125, F126]` or `none`: the scenario ids it names. */
export function parseDepends(v: string | undefined): string[] {
  if (!v) return []
  return [...new Set(v.match(/\bF\d+\b/g) ?? [])]
}

export function parseHorizon(v: string | undefined): Horizon | null {
  const h = (v ?? '').trim().toLowerCase() as Horizon
  return HORIZONS.includes(h) ? h : null
}

export function readPlannedScenarios(planDir: string): PlannedScenario[] {
  const dir = join(planDir, 'planning')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^scenario-F\d+\.md$/.test(f))
    .sort()
    .map((f) => {
      const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
      const id = fm.id || f.replace(/^scenario-|\.md$/g, '')
      const rank = Number.parseInt(fm.rank ?? '', 10)
      return {
        id,
        title: fm.title || id,
        status: fm.status ?? null,
        horizon: parseHorizon(fm.horizon),
        rank: Number.isInteger(rank) && rank > 0 ? rank : null,
        depends: parseDepends(fm.depends).filter((d) => d !== id),
        file: `planning/${f}`,
      }
    })
}

/** A scenario's status as its slice's. */
export function sliceStatus(scenarioStatus: string | null): 'planned' | 'building' | 'shipped' | 'withdrawn' {
  const f = featureStatus(scenarioStatus)
  if (f === 'building') return 'building'
  if (f === 'shipped') return 'shipped'
  if (f === 'dropped') return 'withdrawn'
  return 'planned'
}

/** A scenario with a horizon and no rank goes last in its lane. */
const UNRANKED = 999

export interface PlanSummary {
  features: number
  slices: number
  moved: number
  statusChanged: number
  depends: number
  /** Scenarios not put on the roadmap, and why. */
  skipped: string[]
  problems: string[]
}

const AUDIENCE = { audience: 'department', departments: ['building'] }

async function one<T>(db: ClientBase, sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query(sql, params)
  return rows[0]?.r as T
}

/** As the store's login, holding an operator key: bring features and their first slices in line with the scenarios. */
export async function loadPlans(
  db: ClientBase,
  scenarios: PlannedScenario[],
  commit?: string,
): Promise<PlanSummary> {
  const sum: PlanSummary = { features: 0, slices: 0, moved: 0, statusChanged: 0, depends: 0, skipped: [], problems: [] }
  const evidence = (file: string) => JSON.stringify({ repo: 'socialus-plan', commit: commit ?? null, file })
  const known = new Set<string>()

  for (const s of scenarios) {
    const { rows: have } = await db.query<{ kind: string }>('select kind from knowledge.records where id = $1', [s.id])
    if (have[0] && have[0].kind !== 'feature') {
      sum.problems.push(`${s.id} is a ${have[0].kind} in the store, not a scenario`)
      continue
    }
    if (!have[0]) {
      await one(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb) as r', [
        JSON.stringify({ id: s.id, kind: 'feature', answer: s.title, status: featureStatus(s.status), source: s.file, ...AUDIENCE }),
        'Imported: a scenario, as a feature with its first slice (F127).',
        evidence(s.file),
      ])
      sum.features++
    }
    known.add(s.id)

    const sliceId = `${s.id}-S1`
    if (!s.horizon) {
      const { rows: had } = await db.query<{ horizon: string; status: string }>(
        `select horizon, status from knowledge.records where id = $1 and kind = 'slice'`,
        [sliceId],
      )
      if (had[0] && !['shipped', 'withdrawn'].includes(had[0].status)) {
        // Never guessed: a horizon taken away is the PM's to explain, so the run says so.
        sum.problems.push(
          `${s.id}: its frontmatter no longer has a horizon, but its slice ${sliceId} is still on ${had[0].horizon}; ` +
            'give it a horizon again, or withdraw the slice',
        )
      } else {
        sum.skipped.push(`${s.id}: no horizon in its frontmatter, so no place on Now / Next / Later`)
      }
      continue
    }
    const rank = s.rank ?? UNRANKED
    const want = sliceStatus(s.status)
    const { rows: slice } = await db.query<{ horizon: string; rank: number; status: string }>(
      `select horizon, rank, status from knowledge.records where id = $1 and kind = 'slice'`,
      [sliceId],
    )
    if (!slice[0]) {
      await one(db, 'select knowledge.add_slice($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) as r', [
        s.id, s.title, s.horizon, rank, 'Imported: the scenario as one slice, with its horizon and rank (F127.7).',
        [], want, sliceId, evidence(s.file),
      ])
      sum.slices++
      continue
    }
    if (slice[0].horizon !== s.horizon || slice[0].rank !== rank) {
      await one(db, 'select knowledge.move_slice($1, $2, $3, $4, $5::jsonb) as r', [
        sliceId, s.horizon, rank,
        `Imported: the scenario's frontmatter moved it from ${slice[0].horizon} ${slice[0].rank} to ${s.horizon} ${rank}.`,
        evidence(s.file),
      ])
      sum.moved++
    }
    if (slice[0].status !== want) {
      const r = await one<{ refused?: string }>(db, 'select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r', [
        sliceId, JSON.stringify({ status: want }), `Imported: the scenario is ${s.status ?? 'approved'}.`, evidence(s.file),
      ])
      if (r?.refused) sum.problems.push(`${sliceId}: ${r.refused}`)
      else sum.statusChanged++
    }
  }

  // What each scenario depends on, once both are in the store.
  for (const s of scenarios) {
    if (!known.has(s.id)) continue
    for (const d of s.depends) {
      const { rows } = await db.query<{ kind: string }>('select kind from knowledge.records where id = $1', [d])
      if (rows[0]?.kind !== 'feature') continue // shipped and gone from socialus-plan, never imported
      const r = await one<{ id: number | null }>(db, 'select knowledge.link($1, $2, $3, $4, $5) as r', [
        s.id, d, 'depends_on', 'stated', "The scenario's frontmatter: depends.",
      ])
      if (r?.id) sum.depends++
    }
  }
  return sum
}

export function planReport(sum: PlanSummary): string[] {
  return [
    '',
    '### Plans (F127)',
    '',
    `- Features made for scenarios: ${sum.features}`,
    `- Slices made: ${sum.slices}`,
    `- Slices moved: ${sum.moved}`,
    `- Slice statuses followed: ${sum.statusChanged}`,
    `- New depends links: ${sum.depends}`,
    ...(sum.skipped.length ? ['', 'Not on the roadmap:', ...sum.skipped.map((s) => `- ${s}`)] : []),
    ...(sum.problems.length ? ['', 'Problems:', ...sum.problems.map((p) => `- ${p}`)] : []),
  ]
}
