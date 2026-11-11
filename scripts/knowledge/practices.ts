// F128 (#1237): how we work into the knowledge store: every practice and
// experiment in practices-seed.json (extracted from socialus-ops process/ and
// the three repos' CLAUDE.md files), and the review-a-method steps from
// socialus-ops, which the lookup tool and the pack hand to a reviewer.
//
// Called by the import (import.ts) inside its one transaction, as the store's
// login holding an operator key. Writes only through the store's functions:
// knowledge.record / revise / link / set_experiment_terms.
//
// ABSOLUTES ARE NOT COPIED. A seeded practice with strength absolute names
// one of the absolutes the import already brings in from the ABSOLUTES files
// (a decision whose id is its slug): it is counted and left to that record,
// which the how verb and the pack show above every area.
//
// THE STORE'S OWN CHANGES STAND. A ring moved, a strength changed or a
// verdict given in the store is not undone by the next import: a field is
// revised only when the seed's value changed since the last import wrote it
// (read from that import's version in history), never when only the store's
// value moved. A seed with no verdict never sets one back to running.
//
// RE-RUNNABLE. A seeded practice is `practice.<slug>`, an experiment
// `experiment.<slug>`: a second run on an unchanged seed records nothing, and
// a changed field is revised in place as a new version. A practice gone from
// the seed is left as it is and listed, because retiring a way of working is
// the PM's call, not an import's.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ClientBase } from 'pg'

export const AREAS = ['deciding', 'planning', 'building', 'reviewing', 'shipping', 'words', 'agents', 'docs'] as const
export type Area = (typeof AREAS)[number]

export interface SeedPractice {
  slug: string
  area: Area
  statement: string
  why: string
  /** The dated failures behind it. */
  evidence: { date: string; what: string; ref: string }[]
  strength: 'absolute' | 'rule' | 'guideline'
  ring: 'adopt' | 'trial' | 'assess' | 'hold'
  enforced_by: { repo: string; path: string; what: string }[]
  source: string
  holds?: 'always' | 'for now' | null
  /** Philosophy records it applies, by id (the absolutes are already in the store). */
  applies?: string[]
}

export interface SeedExperiment {
  slug: string
  /** The practice it changes, by slug. */
  practice: string
  change: string
  baseline: string
  measure: string
  /** Null while nobody has set one: the experiment comes in, its terms wait, and the upkeep lists it. */
  verdict_date: string | null
  verdict: 'keep' | 'fix' | 'revert' | null
  source: string
  why?: string
}

export interface PracticeSeed {
  practices: SeedPractice[]
  experiments: SeedExperiment[]
}

export const PRACTICE_SEED_PATH = join(__dirname, 'practices-seed.json')
export const REVIEW_METHOD_FILE = 'process/research/2026-11-10-review-a-method.md'
export const REVIEW_METHOD_ID = 'practice.review-a-method'

export function readPracticeSeed(path = PRACTICE_SEED_PATH): PracticeSeed | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as PracticeSeed) : null
}

/** The steps, without the file's title line and any frontmatter: what a reviewer follows. */
export function readReviewSteps(opsDir: string): string | null {
  const p = join(opsDir, REVIEW_METHOD_FILE)
  if (!existsSync(p)) return null
  let text = readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
  text = text.replace(/^---\n[\s\S]*?\n---\n/, '')
  text = text.replace(/^#\s+.*\n/, '')
  return text.trim() || null
}

/** "repo:path (what)" entries, joined: readable, and parsed back by the drift step. */
export function enforcedBy(list: SeedPractice['enforced_by']): string | null {
  if (!list?.length) return null
  return list.map((e) => `${e.repo}:${e.path}${e.what ? ` (${e.what.replace(/[();]/g, ' ').replace(/\s+/g, ' ').trim()})` : ''}`).join('; ')
}

/** The enforcing paths a practice names, back out of its enforced_by. */
export function enforcers(text: string | null): { repo: string; path: string }[] {
  if (!text) return []
  return text
    .split(';')
    .map((s) => /^\s*([a-z0-9-]+):([^\s(]+)/i.exec(s))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ repo: m[1], path: m[2] }))
}

/** Problems with the seed itself, before anything is written. */
export function checkSeed(seed: PracticeSeed): string[] {
  const out: string[] = []
  const slugs = new Set<string>()
  for (const p of seed.practices) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(p.slug)) out.push(`practice "${p.slug}": a slug is lowercase words and hyphens`)
    if (slugs.has(p.slug)) out.push(`practice "${p.slug}" appears twice`)
    slugs.add(p.slug)
    if (!AREAS.includes(p.area)) out.push(`practice "${p.slug}": no area "${p.area}"`)
    if (!p.why?.trim()) out.push(`practice "${p.slug}" has no why`)
    if (!['absolute', 'rule', 'guideline'].includes(p.strength)) out.push(`practice "${p.slug}": strength "${p.strength}"`)
    if (!['adopt', 'trial', 'assess', 'hold'].includes(p.ring)) out.push(`practice "${p.slug}": ring "${p.ring}"`)
    for (const e of p.evidence ?? []) if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) out.push(`practice "${p.slug}": evidence date "${e.date}"`)
  }
  const ex = new Set<string>()
  for (const e of seed.experiments) {
    if (ex.has(e.slug)) out.push(`experiment "${e.slug}" appears twice`)
    ex.add(e.slug)
    if (!slugs.has(e.practice)) out.push(`experiment "${e.slug}" changes "${e.practice}", which is not a practice in the seed`)
    if (e.verdict_date !== null && !/^\d{4}-\d{2}-\d{2}$/.test(e.verdict_date))
      out.push(`experiment "${e.slug}": verdict date "${e.verdict_date}"`)
    if (e.verdict != null && !['keep', 'fix', 'revert'].includes(e.verdict)) out.push(`experiment "${e.slug}": verdict "${e.verdict}"`)
  }
  return out
}

export interface PracticeSummary {
  recorded: number
  revised: number
  unchanged: number
  experiments: number
  verdicts: number
  /** Experiments whose terms were set by this run. */
  terms: number
  /** Absolutes in the seed, already in the store as absolute decisions: not copied. */
  absolutes: string[]
  links: number
  /** In the store from an earlier seed, gone from this one: left as they are. */
  goneFromSeed: string[]
  problems: string[]
}

const AUDIENCE = {
  audience: 'members',
  departments: [] as string[],
  scope: 'process',
}

interface Have {
  id: string
  kind: string
  concern: string | null
  answer: string
  why: string | null
  status: string
  strength: string
  ring: string | null
  holds: string | null
  enforced_by: string | null
  source: string | null
}

async function haveOf(db: ClientBase, id: string): Promise<Have | null> {
  const { rows } = await db.query<Have>(
    'select id, kind, concern, answer, why, status, strength, ring, holds, enforced_by, source from knowledge.records where id = $1',
    [id],
  )
  return rows[0] ?? null
}

async function q<T>(db: ClientBase, sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query<{ r: T }>(sql, params)
  return rows[0].r
}

/** What a practice should read as in the store. */
export function wantedPractice(p: SeedPractice): Record<string, unknown> {
  return {
    concern: `how-${p.area}`,
    answer: p.statement.trim(),
    why: p.why.trim(),
    strength: p.strength,
    ring: p.ring,
    holds: p.holds ?? null,
    enforced_by: enforcedBy(p.enforced_by),
    source: p.source,
  }
}

/** The record as the last import of the seed left it: the newest version an import of this loader wrote. */
async function lastImported(db: ClientBase, id: string): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<{ snapshot: Record<string, unknown> }>(
    `select snapshot from knowledge.history
      where record_id = $1 and (reason like 'Imported from %' or reason like 'Re-imported:%' or reason like 'Imported verdict %')
      order by version desc limit 1`,
    [id],
  )
  return rows[0]?.snapshot ?? null
}

async function upsert(
  db: ClientBase,
  id: string,
  want: Record<string, unknown>,
  evidence: Record<string, unknown>,
  decidedOn: string,
  asOf: string,
  sum: PracticeSummary,
): Promise<void> {
  const have = await haveOf(db, id)
  if (!have) {
    await q(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb) as r', [
      JSON.stringify({
        id,
        kind: 'practice',
        status: 'live',
        decided_on: decidedOn,
        as_of: asOf,
        ...AUDIENCE,
        ...want,
      }),
      `Imported from ${String(want.source)} (F128).`,
      JSON.stringify(evidence),
    ])
    sum.recorded++
    return
  }
  if (have.kind !== 'practice') {
    sum.problems.push(`${id} is already in the store as a ${have.kind}; it is left as it is`)
    return
  }
  // Only what the seed changed since the last import; a change made in the store stands.
  const last = (await lastImported(db, id)) ?? (have as unknown as Record<string, unknown>)
  const changes: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(want)) {
    if ((last[k] ?? null) !== v && (have as unknown as Record<string, unknown>)[k] !== v) changes[k] = v
  }
  if (!Object.keys(changes).length) {
    sum.unchanged++
    return
  }
  const r = await q<{ refused?: string }>(db, 'select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r', [
    id,
    JSON.stringify(changes),
    `Re-imported: ${Object.keys(changes).join(', ')} changed in ${String(want.source)}.`,
    JSON.stringify(evidence),
  ])
  if (r.refused) sum.problems.push(`${id}: ${r.refused}`)
  else sum.revised++
}

export interface PracticeSources {
  seed: PracticeSeed
  /** The review-a-method steps, from socialus-ops; null when the checkout does not have them. */
  steps: string | null
  commits?: { ops?: string; web?: string }
  today: string
}

export async function loadPractices(db: ClientBase, src: PracticeSources): Promise<PracticeSummary> {
  const sum: PracticeSummary = {
    recorded: 0,
    revised: 0,
    unchanged: 0,
    experiments: 0,
    verdicts: 0,
    terms: 0,
    absolutes: [],
    links: 0,
    goneFromSeed: [],
    problems: [],
  }
  const bad = checkSeed(src.seed)
  if (bad.length) {
    sum.problems.push(...bad.map((b) => `seed: ${b}`))
    return sum
  }
  const seedFile = {
    repo: 'socialus-web',
    commit: src.commits?.web ?? null,
    file: 'scripts/knowledge/practices-seed.json',
  }

  for (const p of src.seed.practices) {
    if (p.strength === 'absolute') {
      const { rows } = await db.query<{ id: string }>(
        `select id from knowledge.records where id = $1 and strength = 'absolute' and 'absolute' = any (tags)`,
        [p.slug],
      )
      if (rows.length) sum.absolutes.push(p.slug)
      else sum.problems.push(`absolute "${p.slug}" is not in the store as an absolute; it was not copied in as a practice`)
      continue
    }
    const dates = (p.evidence ?? []).map((e) => e.date).sort()
    await upsert(
      db,
      `practice.${p.slug}`,
      wantedPractice(p),
      { ...seedFile, failures: p.evidence ?? [] },
      dates[0] ?? src.today,
      dates[dates.length - 1] ?? src.today,
      sum,
    )
    for (const ph of p.applies ?? []) {
      const { rows } = await db.query<{ kind: string }>('select kind from knowledge.records where id = $1', [ph])
      if (!rows.length) {
        sum.problems.push(`practice.${p.slug} applies ${ph}, which is not in the store`)
        continue
      }
      const out = await q<{ id: number | null }>(db, 'select knowledge.link($1, $2, $3, $4, $5) as r', [
        `practice.${p.slug}`,
        ph,
        'applies',
        'stated',
        'Named in the practices seed.',
      ])
      if (out.id) sum.links++
    }
  }

  if (src.steps) {
    await upsert(
      db,
      REVIEW_METHOD_ID,
      {
        concern: 'how-agents',
        answer: src.steps,
        why: 'So any new tool, process or method is checked against how we work in one session, from the given material and the store, without a research project (F128, 2026-11-10).',
        strength: 'rule',
        ring: 'trial',
        holds: null,
        enforced_by:
          'socialus-web:src/lib/knowledge/tools.ts (the review_method verb); socialus-web:scripts/knowledge/pack.ts (the steps file beside the pack)',
        source: `socialus-ops:${REVIEW_METHOD_FILE}`,
      },
      {
        repo: 'socialus-ops',
        commit: src.commits?.ops ?? null,
        file: REVIEW_METHOD_FILE,
      },
      '2026-11-10',
      '2026-11-10',
      sum,
    )
  } else {
    sum.problems.push(`socialus-ops ${REVIEW_METHOD_FILE} was not found; the review-a-method steps were not loaded`)
  }

  for (const e of src.seed.experiments) {
    const id = `experiment.${e.slug}`
    const have = await haveOf(db, id)
    if (!have) {
      await q(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb) as r', [
        JSON.stringify({
          id,
          kind: 'experiment',
          status: 'running',
          answer: e.change.trim(),
          why: e.why ?? null,
          source: e.source,
          ...AUDIENCE,
        }),
        `Imported from ${e.source} (F128).`,
        JSON.stringify(seedFile),
      ])
      sum.experiments++
    } else if (have.kind !== 'experiment') {
      sum.problems.push(`${id} is already in the store as a ${have.kind}; it is left as it is`)
      continue
    }
    if (e.verdict_date === null) {
      sum.problems.push(`${id} has no verdict date yet: its terms wait for one, and the upkeep lists it`)
    } else {
      const terms = await q<{ unchanged?: boolean }>(db, 'select knowledge.set_experiment_terms($1, $2, $3, $4, $5::date) as r', [
        id,
        `practice.${e.practice}`,
        e.baseline,
        e.measure,
        e.verdict_date,
      ]).catch((err: Error) => {
        throw new Error(`${id}: ${err.message}`)
      })
      if (!terms.unchanged) sum.terms++
    }
    // A verdict comes in only when the seed gives a new one; a verdict given
    // in the store stands, and no verdict never means back to running.
    const last = have ? ((await lastImported(db, id))?.status ?? 'running') : 'running'
    const current = have?.status ?? 'running'
    if (e.verdict && e.verdict !== last && e.verdict !== current) {
      const r = await q<{ refused?: string }>(db, 'select knowledge.revise($1, $2::jsonb, $3) as r', [
        id,
        JSON.stringify({ status: e.verdict }),
        `Imported verdict ${e.verdict}, from ${e.source}.`,
      ])
      if (r.refused) sum.problems.push(`${id}: ${r.refused}`)
      else sum.verdicts++
    }
  }

  const seeded = new Set([
    ...src.seed.practices.filter((p) => p.strength !== 'absolute').map((p) => `practice.${p.slug}`),
    REVIEW_METHOD_ID,
  ])
  const { rows: inStore } = await db.query<{ id: string }>(
    `select id from knowledge.records where kind = 'practice' and id like 'practice.%' and status <> 'retired' order by id`,
  )
  sum.goneFromSeed = inStore.map((r) => r.id).filter((id) => !seeded.has(id))
  return sum
}

export function practiceReport(s: PracticeSummary): string[] {
  return [
    '',
    '### How we work (F128)',
    `- Practices recorded: ${s.recorded}, revised: ${s.revised}, unchanged: ${s.unchanged}`,
    `- Experiments recorded: ${s.experiments}, verdicts recorded: ${s.verdicts}, terms set: ${s.terms}`,
    `- Absolutes left to their own records, not copied: ${s.absolutes.length}`,
    `- Links to philosophies: ${s.links}`,
    ...(s.goneFromSeed.length
      ? ['- Gone from the seed, left live for the PM to retire or keep:', ...s.goneFromSeed.map((g) => `  - ${g}`)]
      : []),
    ...(s.problems.length ? ['- Problems:', ...s.problems.map((p) => `  - ${p}`)] : []),
  ]
}
