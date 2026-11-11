// F132 (#1256): today's story maps come in. The hand-kept maps
// (maps-seed.json: the first map, its two slices, where each built feature
// sits and where each IMAGINE idea would fit) and socialus-plan's walk-throughs
// (planning/uat-journeys.json: each becomes a journey), into the knowledge
// store's journeys, activities, tasks and details.
//
// Called by the import (import.ts), in its one transaction, after concepts and
// plans, as the store's login holding the run's operator key. Writes only
// through the store's functions: map_item, map_slice, record (a built feature
// the store lacks, its state from build-log/reports/rollup.json, as F129
// reads it) and place.
//
// Re-runnable, and the store's changes stand: an item, slice or feature that
// is already in the store is left as it is (the PM may have moved or reworded
// it there); a placement already made is not repeated (place() keeps one row
// for the same place) and a stated one is never replaced by a guess.

import type { ClientBase } from 'pg'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// ---------------------------------------------------------------------------
// The sources.

export interface SeedTask { answer: string; details?: string[] }
export interface SeedActivity { answer: string; tasks: SeedTask[] }
export interface SeedSlice { id: string; outcome: string; horizon: 'now' | 'next' | 'later'; rank: number; why?: string; takes: string[] }
export interface SeedJourney { id: string; answer: string; why?: string; activities: SeedActivity[]; slices?: SeedSlice[] }
export interface SeedIdea { name: string; on: string | null; stands_on?: string[]; needs_first?: string[]; clashes?: string[] }
export interface MapSeed {
  journeys: SeedJourney[]
  features: Record<string, string | null>
  ideas: Record<string, SeedIdea>
}

export interface Walkthrough { id: string; title: string; role: string; link?: string; minutes?: number; look: string[]; criteria: string[] }

export interface RollupFeature {
  feature: string
  title: string
  retired: boolean
  n: number
  totals: { shipped: { yes: number } }
  criteria: { id: string; text: string }[]
}

export const SEED_FILE = 'scripts/knowledge/maps-seed.json'
const SEED_SOURCE = `socialus-web:${SEED_FILE}`
const WALK_SOURCE = 'socialus-plan:planning/uat-journeys.json'
const ROLLUP_SOURCE = 'socialus-web:build-log/reports/rollup.json'

export function readMapSeed(path = resolve(__dirname, 'maps-seed.json')): MapSeed {
  return JSON.parse(readFileSync(path, 'utf8')) as MapSeed
}

export function readWalkthroughs(planDir: string): Walkthrough[] {
  const p = resolve(planDir, 'planning/uat-journeys.json')
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Walkthrough[]) : []
}

export function readRollup(path = resolve(__dirname, '../../build-log/reports/rollup.json')): RollupFeature[] {
  return existsSync(path) ? ((JSON.parse(readFileSync(path, 'utf8')) as { features: RollupFeature[] }).features ?? []) : []
}

/** A built feature's state: every criterion shipped is shipped, some is building, retired is dropped. */
export function rollupStatus(f: RollupFeature): 'shipped' | 'building' | 'approved' | 'dropped' {
  if (f.retired) return 'dropped'
  const shipped = f.totals?.shipped?.yes ?? 0
  if (f.n > 0 && shipped >= f.n) return 'shipped'
  return shipped > 0 ? 'building' : 'approved'
}

/** A walk-through as a journey: one activity, its look lines as tasks in order. */
export function walkthroughJourney(w: Walkthrough): SeedJourney {
  return {
    id: `JY-${w.id}`,
    answer: w.title,
    why: `A walk-through on socialus.org, as ${w.role}${w.minutes ? `, about ${w.minutes} minutes` : ''}.`,
    activities: [{ answer: `Walk it through as ${w.role}`, tasks: w.look.map((l) => ({ answer: l })) }],
  }
}

/** The words of a text, lower-cased, without the small ones. */
export function words(s: string): Set<string> {
  return new Set(
    s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x.length > 3),
  )
}

/**
 * Where a built feature most likely sits among the walk-throughs that name it:
 * the look line sharing the most words with the feature's criteria there. The
 * first line when nothing overlaps. Marked inferred.
 */
export function inferPlace(feature: RollupFeature | undefined, featureId: string, walks: Walkthrough[]): string | null {
  let best: { id: string; score: number } | null = null
  for (const w of walks) {
    const named = w.criteria.filter((c) => c.split('.')[0] === featureId).map((c) => c.split('.').slice(1).join('.'))
    if (!named.length) continue
    const crit = words(
      [feature?.title ?? '', ...(feature?.criteria ?? []).filter((c) => named.includes(c.id)).map((c) => c.text)].join(' '),
    )
    w.look.forEach((line, i) => {
      const score = [...words(line)].filter((x) => crit.has(x)).length
      if (!best || score > best.score) best = { id: `JY-${w.id}.A1.T${i + 1}`, score }
    })
  }
  return best ? (best as { id: string }).id : null
}

// ---------------------------------------------------------------------------
// Writing.

export interface MapSummary {
  items: number
  slices: number
  features: number
  placed: number
  noJourneyYet: number
  unplaced: string[]
  problems: string[]
}

async function have(db: ClientBase, id: string): Promise<boolean> {
  const { rows } = await db.query('select 1 from knowledge.records where id = $1', [id])
  return rows.length > 0
}

async function loadJourney(db: ClientBase, j: SeedJourney, source: string, sum: MapSummary): Promise<void> {
  const item = async (p: Record<string, unknown>) => {
    if (await have(db, p.id as string)) return
    await db.query('select knowledge.map_item($1::jsonb, $2)', [
      JSON.stringify({ ...p, status: 'live', source }),
      `Imported: the story map, from ${source.split(':')[1]}.`,
    ])
    sum.items++
  }
  await item({ id: j.id, kind: 'journey', answer: j.answer, why: j.why, place: 1 })
  for (const [ai, a] of j.activities.entries()) {
    const aid = `${j.id}.A${ai + 1}`
    await item({ id: aid, kind: 'activity', parent: j.id, answer: a.answer, place: ai + 1 })
    for (const [ti, t] of a.tasks.entries()) {
      const tid = `${aid}.T${ti + 1}`
      await item({ id: tid, kind: 'task', parent: aid, answer: t.answer, place: ti + 1 })
      for (const [di, d] of (t.details ?? []).entries()) {
        await item({ id: `${tid}.D${di + 1}`, kind: 'detail', parent: tid, answer: d, place: di + 1 })
      }
    }
  }
  for (const s of j.slices ?? []) {
    if (await have(db, s.id)) continue
    await db.query('select knowledge.map_slice($1, $2, $3::text[], $4, $5, $6, $7, $8)', [
      j.id, s.outcome, s.takes, s.horizon, s.rank, `Imported: ${s.why ?? 'a slice across the map'}`, 'planned', s.id,
    ])
    sum.slices++
  }
}

async function place(
  db: ClientBase, item: string, on: string | null, reason: string, sum: MapSummary,
  extra: { stands_on?: string[]; needs_first?: string[]; clashes?: string[]; basis?: 'stated' | 'inferred' } = {},
): Promise<void> {
  if (on && !(await have(db, on))) {
    sum.problems.push(`${item}: no map item ${on}; not placed`)
    return
  }
  const { rows } = await db.query<{ r: { placement?: number; unchanged?: boolean; kept?: string } }>(
    'select knowledge.place($1, $2, $3, $4::text[], $5::text[], $6::text[], $7) as r',
    [item, on, reason, extra.stands_on ?? [], extra.needs_first ?? [], extra.clashes ?? [], extra.basis ?? 'stated'],
  )
  if (rows[0].r.placement) {
    sum.placed++
    if (!on) sum.noJourneyYet++
  }
}

export interface MapSources {
  seed: MapSeed
  walkthroughs: Walkthrough[]
  rollup: RollupFeature[]
}

/** As the store's login, holding an operator key: bring the story maps in. */
export async function loadMaps(db: ClientBase, src: MapSources): Promise<MapSummary> {
  const sum: MapSummary = { items: 0, slices: 0, features: 0, placed: 0, noJourneyYet: 0, unplaced: [], problems: [] }

  for (const j of src.seed.journeys) await loadJourney(db, j, SEED_SOURCE, sum)
  for (const w of src.walkthroughs) await loadJourney(db, walkthroughJourney(w), WALK_SOURCE, sum)

  // Built features the store lacks: shipped scenarios leave socialus-plan, so
  // the roll-up is where their state is.
  const rollup = new Map(src.rollup.map((f) => [f.feature, f]))
  for (const f of src.rollup) {
    if (await have(db, f.feature)) continue
    await db.query('select knowledge.record($1::jsonb, $2)', [
      JSON.stringify({ id: f.feature, kind: 'feature', answer: f.title, status: rollupStatus(f), source: ROLLUP_SOURCE,
                       audience: 'department', departments: ['building'] }),
      'Imported: a built feature, its state from the roll-up, so it can be placed on its story map.',
    ])
    sum.features++
  }

  // Each built feature on the task it serves: by hand first, then by the
  // walk-throughs that name it.
  const placedByHand = new Set(Object.keys(src.seed.features))
  for (const [fid, on] of Object.entries(src.seed.features)) {
    // A scenario that has shipped and left socialus-plan may be in neither.
    if (!(await have(db, fid))) continue
    await place(db, fid, on, on ? 'Placed by hand on the task it serves.' : 'No journey yet: it serves no member journey mapped so far.', sum)
  }
  for (const f of src.rollup) {
    if (placedByHand.has(f.feature)) continue
    const on = inferPlace(rollup.get(f.feature), f.feature, src.walkthroughs)
    if (!on) continue
    await place(db, f.feature, on, 'Inferred: the walk-through line that shares most words with its criteria.', sum, { basis: 'inferred' })
  }

  // Each IMAGINE idea where it would fit, by id, checked against its name.
  for (const [cid, idea] of Object.entries(src.seed.ideas)) {
    const { rows } = await db.query<{ id: string; answer: string }>(
      `select id, answer from knowledge.records where kind = 'concept' and (id = $1 or lower(answer) like lower($2) || '%')
        order by (id = $1) desc limit 1`,
      [cid, idea.name],
    )
    const c = rows[0]
    if (!c || !c.answer.toLowerCase().startsWith(idea.name.toLowerCase())) {
      sum.problems.push(`${cid} "${idea.name}": no such idea in the store; not placed`)
      continue
    }
    await place(db, c.id, idea.on, idea.on ? 'Placed by hand where it would fit.' : 'No journey yet: no map holds it so far.', sum, idea)
  }

  // What is left to place: features and ideas with no place at all.
  const { rows: left } = await db.query<{ id: string }>(
    `select r.id from knowledge.records r
      where (r.kind = 'feature' and r.status <> 'dropped' or (r.kind = 'concept' and r.status = 'idea'))
        and not exists (select 1 from knowledge.placements p where p.item_id = r.id)
      order by r.id`,
  )
  sum.unplaced = left.map((r) => r.id)
  return sum
}

export function mapReport(s: MapSummary): string[] {
  return [
    `Story maps: ${s.items} item(s) and ${s.slices} slice(s) recorded, ${s.features} built feature(s) recorded, ` +
      `${s.placed} placement(s) (${s.noJourneyYet} "no journey yet").`,
    ...(s.unplaced.length ? [`Not placed yet (${s.unplaced.length}): ${s.unplaced.join(', ')}`] : []),
    ...s.problems.map((p) => `- ${p}`),
  ]
}
