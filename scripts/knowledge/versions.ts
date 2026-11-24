// #1431: version plans come in. A version says what a release is for, how
// much it is worth, the slices it holds and the ones it leaves out with the
// reason and the condition that brings each back (F127.2). The store could
// hold one since #1241, but nothing wrote one, so `plan` answered "No planned
// or current version yet."
//
// versions-seed.json is hand-kept by agents and holds only what the PM has
// already ruled: what is in a version is the PM's. Each entry names the
// rulings it rests on.
//
// Called by the import (import.ts), in its one transaction, after plans and
// story maps (whose slices a version names), as the store's login holding the
// run's operator key. Writes only through the store's functions: plan_version
// for a version the store lacks (as planned; its status is changed in the
// store, not here), replan for one whose seed moved.
//
// Re-runnable. A version already in the store whose plan matches the seed is
// left alone. One whose plan differs is changed only when the seed says why
// and names the outcome that changed (its `changed` entry), because a change
// of plan with no why is the thing F127.4 refuses. Nothing here throws on a
// bad entry: the import is one transaction, so a version that cannot be
// written is reported and skipped, and the rest of the run stands.

import type { ClientBase } from 'pg'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface SeedLeaveOut { slice: string; reason: string; condition?: string }
export interface SeedVersion {
  id: string
  /** The version's name. */
  answer: string
  /** Why this plan, in the PM's words where there are any. */
  why: string
  /** YYYY-MM-DD. A version may carry a date; no feature or slice does. */
  due_on?: string
  outcomes: string[]
  appetite: string
  includes: string[]
  leaves_out?: SeedLeaveOut[]
  /** The rulings and records this plan rests on, for the change's evidence. */
  ruled_by: string[]
  /** Set when the plan above differs from the store's: the why and the outcome that changed. */
  changed?: { why: string; outcome: string }
}
export interface VersionSeed { about?: string; versions: SeedVersion[] }

export const SEED_FILE = 'scripts/knowledge/versions-seed.json'

export function readVersionSeed(path = resolve(__dirname, 'versions-seed.json')): VersionSeed {
  return JSON.parse(readFileSync(path, 'utf8')) as VersionSeed
}

const words = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''
const DATE = /^\d{4}-\d{2}-\d{2}$/
const KEYS = new Set(['id', 'answer', 'why', 'due_on', 'outcomes', 'appetite', 'includes', 'leaves_out', 'ruled_by', 'changed'])

/** Every problem with one seed entry, in plain words; empty when it can be written. */
export function versionProblems(v: SeedVersion): string[] {
  const p: string[] = []
  const id = words(v?.id) ? v.id : '(no id)'
  const say = (m: string) => p.push(`${id}: ${m}`)
  if (!v || typeof v !== 'object') return ['a version is an object']
  for (const k of Object.keys(v)) if (!KEYS.has(k)) say(`unknown field ${k}`)
  if (!/^VN-\d{4}$/.test(v.id ?? '')) say('its id is VN- and four digits')
  if (!words(v.answer)) say('it has no name (answer)')
  if (!words(v.why)) say('it has no why')
  if (v.due_on !== undefined && (!DATE.test(v.due_on) || Number.isNaN(Date.parse(v.due_on)))) say('due_on is a date, YYYY-MM-DD')
  if (!Array.isArray(v.outcomes) || v.outcomes.length === 0 || !v.outcomes.every(words)) say('it names at least one outcome, each in words')
  if (!words(v.appetite)) say('it has no appetite: how much it is worth, in words')
  if (!Array.isArray(v.includes) || !v.includes.every(words)) say('includes is a list of slice ids')
  const outs = v.leaves_out ?? []
  if (!Array.isArray(outs)) say('leaves_out is a list')
  else {
    for (const o of outs) {
      if (!o || !words(o.slice)) say('a leave-out names its slice')
      else if (!words(o.reason)) say(`leaving out ${o.slice} needs a reason`)
      if (o && o.condition !== undefined && !words(o.condition)) say(`the condition that brings ${o.slice} back is a condition id`)
    }
  }
  const ins = Array.isArray(v.includes) ? v.includes : []
  const outIds = Array.isArray(outs) ? outs.map((o) => o?.slice).filter(words) : []
  const all = [...ins, ...outIds]
  const twice = [...new Set(all.filter((s, i) => all.indexOf(s) !== i))]
  if (twice.length) say(`a slice is named once, either in or left out: ${twice.join(', ')}`)
  // What is in a version is the PM's, so a plan with no ruling behind it does not go in.
  if (!Array.isArray(v.ruled_by) || v.ruled_by.length === 0 || !v.ruled_by.every(words)) say('it names the rulings it rests on (ruled_by)')
  if (v.changed !== undefined) {
    if (!words(v.changed?.why)) say('a change of plan gives its why')
    if (!words(v.changed?.outcome)) say('a change of plan names the outcome that changed')
    else if (Array.isArray(v.outcomes) && !v.outcomes.includes(v.changed.outcome)) say('the outcome that changed is one of the plan\'s outcomes')
  }
  return p
}

/** Problems across the whole seed: each entry's, and an id used twice. */
export function seedProblems(seed: VersionSeed): string[] {
  if (!seed || !Array.isArray(seed.versions)) return ['the seed holds a list called versions']
  const p = seed.versions.flatMap(versionProblems)
  const ids = seed.versions.map((v) => v?.id)
  for (const id of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) p.push(`${id}: listed twice`)
  return p
}

type Plan = { outcomes: string[]; appetite: string; includes: string[]; leaves_out: { slice: string; reason: string; condition: string | null }[] }

/** A plan reduced to what the seed states, in a fixed order, so the store's and the seed's compare. */
export function comparable(p: { outcomes?: string[]; appetite?: string; includes?: string[]; leaves_out?: { slice: string; reason: string; condition?: string | null }[] } | null): Plan {
  return {
    outcomes: [...new Set((p?.outcomes ?? []).map((o) => o.trim()))].sort(),
    appetite: (p?.appetite ?? '').trim(),
    includes: [...(p?.includes ?? [])].sort(),
    leaves_out: (p?.leaves_out ?? [])
      .map((o) => ({ slice: o.slice, reason: o.reason.trim(), condition: o.condition ?? null }))
      .sort((a, b) => a.slice.localeCompare(b.slice)),
  }
}

export interface VersionSummary {
  recorded: number
  replanned: number
  unchanged: number
  problems: string[]
}

async function kindOf(db: ClientBase, id: string): Promise<string | null> {
  const { rows } = await db.query<{ kind: string }>('select kind from knowledge.records where id = $1', [id])
  return rows[0]?.kind ?? null
}

/** As the store's login, holding an operator key: bring the store's versions in line with the seed. */
export async function loadVersions(db: ClientBase, seed: VersionSeed, commit?: string): Promise<VersionSummary> {
  const sum: VersionSummary = { recorded: 0, replanned: 0, unchanged: 0, problems: seedProblems(seed) }
  const ids = (seed?.versions ?? []).map((v) => v?.id)
  for (const v of seed?.versions ?? []) {
    // An entry with a problem, or an id listed twice, is reported above and not written.
    if (!v || versionProblems(v).length || ids.indexOf(v.id) !== ids.lastIndexOf(v.id)) continue
    // The store refuses a slice or condition it does not hold by raising, which
    // would end the whole import, so they are looked up first and reported.
    const missing: string[] = []
    for (const s of [...v.includes, ...(v.leaves_out ?? []).map((o) => o.slice)]) {
      if ((await kindOf(db, s)) !== 'slice') missing.push(`${s} is not a slice in the store`)
    }
    for (const o of v.leaves_out ?? []) {
      if (o.condition && (await kindOf(db, o.condition)) !== 'condition') missing.push(`${o.condition} is not a condition in the store`)
    }
    const { rows: withdrawn } = await db.query<{ id: string }>(
      `select id from knowledge.records where id = any($1::text[]) and status = 'withdrawn' order by id`, [v.includes],
    )
    for (const w of withdrawn) missing.push(`${w.id} is withdrawn and cannot be included`)
    if (missing.length) {
      sum.problems.push(...missing.map((m) => `${v.id}: ${m}; not written`))
      continue
    }

    const plan = { outcomes: v.outcomes, appetite: v.appetite, includes: v.includes, leaves_out: v.leaves_out ?? [] }
    const evidence = JSON.stringify({ repo: 'socialus-web', commit: commit ?? null, file: SEED_FILE, ruled_by: v.ruled_by })
    const { rows } = await db.query<{ kind: string; plan: Parameters<typeof comparable>[0] }>(
      'select kind, plan from knowledge.records where id = $1', [v.id],
    )
    if (!rows[0]) {
      await db.query('select knowledge.plan_version($1::jsonb, $2, $3::jsonb)', [
        JSON.stringify({ id: v.id, answer: v.answer, why: v.why, status: 'planned', ...(v.due_on ? { due_on: v.due_on } : {}), ...plan }),
        `Imported: the version as ruled (${v.ruled_by.join('; ')}).`,
        evidence,
      ])
      sum.recorded++
      continue
    }
    if (rows[0].kind !== 'version') {
      sum.problems.push(`${v.id} is a ${rows[0].kind} in the store, not a version; not written`)
      continue
    }
    if (JSON.stringify(comparable(rows[0].plan)) === JSON.stringify(comparable(plan))) {
      sum.unchanged++
      continue
    }
    if (!v.changed) {
      sum.problems.push(
        `${v.id}: the seed's plan differs from the store's and says no why; add its \`changed\` (why, and the outcome that changed), ` +
          'or bring the seed back in line. Not written',
      )
      continue
    }
    await db.query('select knowledge.replan($1, $2::jsonb, $3, $4, $5::jsonb)', [v.id, JSON.stringify(plan), v.changed.why, v.changed.outcome, evidence])
    sum.replanned++
  }
  return sum
}

export function versionReport(sum: VersionSummary): string[] {
  return [
    '',
    '### Versions (#1431)',
    '',
    `- Versions recorded: ${sum.recorded}`,
    `- Plans changed, each with its why: ${sum.replanned}`,
    `- Unchanged: ${sum.unchanged}`,
    ...(sum.problems.length ? ['', 'Problems:', ...sum.problems.map((p) => `- ${p}`)] : []),
  ]
}
