// F125 / T1017 (#1218) — the import: socialus-plan's live rulings and
// principles, the two absolutes files, and the ontology registry, into the
// knowledge store (#1217).
//
// WRITES ONLY THROUGH THE STORE'S FUNCTIONS, as its own login. The admin
// connection (the one the migrations use) does three things and no more: it
// mints a key for this run with knowledge.add_agent, lets this session act as
// `knowledge_store` for the length of the transaction, and revokes both at
// the end. Every record, revision, retirement and link in between is a call
// to knowledge.record / revise / retire / link, made as `knowledge_store`
// holding that key, so every history row names the person and this run.
//
// ONE TRANSACTION. A run lands whole or not at all.
//
// RE-RUNNABLE (the side-by-side week re-imports). A ruling is matched to its
// record by date and words, which a ruling never changes (PRINCIPLES.md:
// "their words are not edited"); so a ruling that moves files, gains a tag or
// a why is revised in place with a new version, and one that is unchanged is
// left alone. A ruling gone from socialus-plan is retired against the newer
// ruling whose `[replaces …]` names it; one with no replacement is left live
// and listed in the run's summary, because the store refuses to retire a
// decision without one (F125.2). Ontology entries are matched by name.
//
// Run: tsx scripts/knowledge/import.ts --plan <dir> --ops <dir> [--commit]
// with DATABASE_URL set. Without --commit it runs everything and rolls back.

import { Client, type ClientBase } from 'pg'
import { resolve } from 'node:path'
import {
  readRulings,
  readAbsolutes,
  readRegistry,
  slugOf,
  type Ruling,
  type Absolute,
  type Registry,
} from './plan-source'
import { placeOf, ABSOLUTE_CONCERN, CONCERN_DEPARTMENT } from './concerns'
import { inferApplies } from './infer'
import { loadConcepts, readSeed, readImagine, readScenarios, conceptReport, type ConceptSummary, type Seed } from './concepts'
import { loadPlans, readPlannedScenarios, planReport, type PlanSummary } from './plans'

export interface Sources {
  /** A checkout of socialus-plan. */
  planDir: string
  /** A checkout of socialus-ops, for process/ABSOLUTES.md. */
  opsDir: string
  /** src/ontology/registry.json. */
  registryPath: string
  /** The commits read, for each change's evidence. */
  commits?: { plan?: string; ops?: string; web?: string }
  /** F130: the traced concept timelines; scripts/knowledge/concepts-seed.json unless given. */
  seed?: Seed
}

export interface Summary {
  recorded: number
  revised: number
  unchanged: number
  retired: number
  links: number
  /** Rulings gone from socialus-plan that no newer ruling names as replaced. */
  goneWithoutReplacement: string[]
  /** Changes the store's functions do not offer (an ontology entry's status moving to live). */
  blocked: string[]
  /** F130: concepts, ideas and the scenarios that name them. */
  concepts?: ConceptSummary
  /** F127: each scenario as a feature with one slice, its horizon and rank. */
  plans?: PlanSummary
}

/** Who every change names. Rulings are the PM's; the import records them for him. */
export const PERSON = 'the PM'

const PLAN_SOURCE = /^([^:#]+\.md):(\d+)$/

// ---------------------------------------------------------------------------
// Entering and leaving the store's login.

/** Inside an open transaction, on the admin connection: mint this run's key and act as the store's login. */
export async function enterStore(db: ClientBase, agent: string, person = PERSON): Promise<void> {
  const { rows } = await db.query<{ key: string }>(
    `select knowledge.add_agent($1, $2, '{}', true) as key`,
    [agent, person],
  )
  await db.query('grant knowledge_store to current_user')
  await db.query('set local role knowledge_store')
  await db.query(`select set_config('knowledge.key', $1, true)`, [rows[0].key])
}

/** Back to the admin connection; the role grant and this run's key are both withdrawn before commit. */
export async function leaveStore(db: ClientBase, agent: string): Promise<void> {
  await db.query(`select set_config('knowledge.key', '', true)`)
  await db.query('reset role')
  await db.query('revoke knowledge_store from current_user')
  await db.query('select knowledge.revoke_agent($1)', [agent])
}

// ---------------------------------------------------------------------------
// What the files say, as the record each should be.

export interface Wanted {
  /** Explicit id, or null to let the store number it (D-0001). */
  id: string | null
  /** How a later run finds it again. */
  key: string
  fields: Record<string, unknown>
  effective: string | null
  evidence: Record<string, unknown>
}

function dateOnly(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function pathOf(rest: string): 'well-worn' | 'new territory' | null {
  if (/new territory/i.test(rest)) return 'new territory'
  if (/well-worn/i.test(rest)) return 'well-worn'
  return null
}

function rulingTags(r: Ruling): string[] {
  const tags: string[] = []
  if (r.binds) {
    tags.push(...(r.binds.tiers.length ? r.binds.tiers.map((t) => `tier:${t}`) : ['tier:none']))
    if (r.binds.buildNone) tags.push('build:none')
    tags.push(...r.binds.surfaces)
  }
  if (r.anchor) tags.push(`anchor:${r.anchor}`)
  if (r.principle && !r.listed) tags.push('unlisted')
  return tags
}

export function rulingKey(date: string, words: string): string {
  return `${date} ${words}`
}

export function wantedFromRuling(r: Ruling, today: string, commit?: string): Wanted {
  const placed = placeOf(r.binds?.surfaces ?? [])
  const { concern } = placed
  // A ruling that binds the code tier is handed to every build session by
  // constraints/code.md; when its surfaces reach no department (the method,
  // the soul), building reads it rather than operators alone (bug #1230).
  const departments =
    placed.departments.length === 0 && r.binds?.tiers.includes('code') ? ['building'] : placed.departments
  const principle = r.principle
  const neverExtractive = r.anchor === 'never-extractive'
  return {
    id: null,
    key: rulingKey(r.date, r.words),
    fields: {
      kind: principle ? 'philosophy' : 'decision',
      concern,
      answer: r.words,
      why:
        r.rest ||
        `Ruled on ${r.date}; its reasons are in ${r.file}, where it was ruled, and git holds what it replaced.`,
      status: 'live',
      // Absolutes come from the two absolutes files; product/ABSOLUTES.md
      // names never-extractive as the product's one value absolute, kept in
      // the charter rather than there. Everything else is a guideline.
      strength: neverExtractive ? 'absolute' : 'guideline',
      scope: principle ? 'product' : null,
      // The brief: philosophies start for operators. A ruling is read by the
      // departments its surfaces reach, or by operators when they reach none.
      audience: !principle && departments.length ? 'department' : 'operators',
      departments: !principle ? departments : [],
      decided_by: PERSON,
      decided_on: r.date,
      path: pathOf(r.rest),
      holds: r.holds,
      source: `${r.file}:${r.line}`,
      tags: rulingTags(r),
    },
    effective: r.date <= today ? r.date : null,
    evidence: { repo: 'socialus-plan', commit: commit ?? null, file: r.file, line: r.line },
  }
}

const ABSOLUTE_WHY =
  'An absolute: breaking it once causes harm the next session cannot undo (the four-harms test, socialus-ops process/ABSOLUTES.md).'

export function wantedFromAbsolute(a: Absolute, today: string, commit?: string): Wanted {
  const concern = ABSOLUTE_CONCERN[a.slug] ?? null
  const departments = concern ? [CONCERN_DEPARTMENT[concern]] : []
  return {
    id: a.slug,
    key: a.slug,
    fields: {
      kind: 'decision',
      concern,
      answer: a.words,
      why: a.rest ? `${ABSOLUTE_WHY}\n\n${a.rest}` : ABSOLUTE_WHY,
      status: 'live',
      strength: 'absolute',
      scope: a.scope,
      audience: departments.length ? 'department' : 'operators',
      departments,
      decided_by: PERSON,
      holds: 'always',
      source: `${a.file}#${a.slug}`,
      tags: ['absolute'],
    },
    effective: null,
    evidence: { repo: a.file.split('/')[0], commit: commit ?? null, file: a.file, slug: a.slug },
  }
}

const NOUN_STATUS = new Set(['live', 'coming', 'refused', 'retired'])

export function wantedFromRegistry(reg: Registry, commit?: string): Wanted[] {
  const base = {
    concern: 'ontology',
    audience: 'department',
    departments: ['building'],
    source: 'socialus-web:src/ontology/registry.json',
  }
  const evidence = { repo: 'socialus-web', commit: commit ?? null, file: 'src/ontology/registry.json' }
  const nouns: Wanted[] = reg.objectTypes.map((o) => ({
    id: `noun.${slugOf(o.name)}`,
    key: `noun.${slugOf(o.name)}`,
    fields: {
      ...base,
      kind: 'noun',
      answer: o.name,
      why: o.note ?? null,
      status: NOUN_STATUS.has(o.status) ? o.status : 'coming',
      tags: o.definedIn ? [`defined:${o.definedIn}`] : [],
    },
    effective: null,
    evidence,
  }))
  const refused: Wanted[] = reg.rejectedAsNouns.map((name) => ({
    id: `noun.${slugOf(name)}`,
    key: `noun.${slugOf(name)}`,
    fields: { ...base, kind: 'noun', answer: name, why: null, status: 'refused', tags: [] },
    effective: null,
    evidence,
  }))
  const links: Wanted[] = reg.links.map((l) => ({
    id: `link.${slugOf(l.name)}`,
    key: `link.${slugOf(l.name)}`,
    fields: {
      ...base,
      kind: 'link',
      answer: l.name,
      why: l.note ?? null,
      status: l.built ? 'live' : 'coming',
      decided_on: l.ruled ?? undefined,
      tags: [`from:${l.from}`, `to:${l.to}`, ...(l.via ? [`via:${l.via.table}.${l.via.column}`] : [])],
    },
    effective: null,
    evidence,
  }))
  const verbs: Wanted[] = reg.handlers.map((h) => ({
    id: `verb.${h}`,
    key: `verb.${h}`,
    fields: { ...base, kind: 'verb', answer: h, why: null, status: 'live', tags: [] },
    effective: null,
    evidence,
  }))
  return [...nouns, ...refused, ...links, ...verbs]
}

// ---------------------------------------------------------------------------
// Writing it.

interface Existing {
  id: string
  kind: string
  status: string
  answer: string
  decided_on: string | null
  source: string | null
  settled: boolean
  [field: string]: unknown
}

const COMPARED = ['concern', 'why', 'strength', 'scope', 'audience', 'departments', 'path', 'holds', 'source', 'tags']

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
}

function keyOf(r: Existing): string {
  if (r.source && PLAN_SOURCE.test(r.source) && r.decided_on) return rulingKey(r.decided_on, r.answer)
  return r.id
}

/** As the store's login, holding a key: bring the store in line with the sources. */
export async function importAll(db: ClientBase, src: Sources, today = dateOnly(new Date())): Promise<Summary> {
  const summary: Summary = {
    recorded: 0, revised: 0, unchanged: 0, retired: 0, links: 0, goneWithoutReplacement: [], blocked: [],
  }
  const rulings = readRulings(src.planDir)
  if (!rulings.length) throw new Error(`No rulings found under ${src.planDir}: is it a checkout of socialus-plan?`)
  const absolutes = [
    ...readAbsolutes(resolve(src.planDir, 'product/ABSOLUTES.md'), 'socialus-plan/product/ABSOLUTES.md', 'product'),
    ...readAbsolutes(resolve(src.opsDir, 'process/ABSOLUTES.md'), 'socialus-ops/process/ABSOLUTES.md', 'process'),
  ]
  if (!absolutes.length) throw new Error('No absolutes found: check the socialus-plan and socialus-ops checkouts.')
  const registry = readRegistry(src.registryPath)

  const wanted: Wanted[] = [
    ...rulings.map((r) => wantedFromRuling(r, today, src.commits?.plan)),
    ...absolutes.map((a) =>
      wantedFromAbsolute(a, today, a.file.startsWith('socialus-ops') ? src.commits?.ops : src.commits?.plan),
    ),
    ...wantedFromRegistry(registry, src.commits?.web),
  ]

  const { rows: existingRows } = await db.query<Existing>(
    `select id, kind, status, answer, to_char(decided_on, 'YYYY-MM-DD') as decided_on, source, settled,
            concern, why, strength, scope, audience, departments, path, holds, tags
       from knowledge.records`,
  )
  const existing = new Map(existingRows.map((r) => [keyOf(r), r]))
  const idOfKey = new Map<string, string>()

  for (const w of wanted) {
    const have = existing.get(w.key)
    if (!have) {
      const p = Object.fromEntries(Object.entries({ id: w.id ?? undefined, ...w.fields }).filter(([, v]) => v !== undefined && v !== null))
      const { rows } = await db.query<{ id: string }>(
        'select knowledge.record($1::jsonb, $2, $3::jsonb, $4::timestamptz) as id',
        [JSON.stringify(p), 'Imported from where it was ruled.', JSON.stringify(w.evidence), w.effective],
      )
      idOfKey.set(w.key, rows[0].id)
      summary.recorded++
      continue
    }
    idOfKey.set(w.key, have.id)
    existing.delete(w.key)
    const changes: Record<string, unknown> = {}
    for (const f of COMPARED) if (f in w.fields && !same(have[f], w.fields[f])) changes[f] = w.fields[f] ?? null
    if (w.fields.status !== have.status) {
      summary.blocked.push(`${have.id}: is ${have.status} in the store, ${String(w.fields.status)} in its source`)
    }
    if (!Object.keys(changes).length) {
      summary.unchanged++
      continue
    }
    const { rows } = await db.query<{ r: { refused?: string } }>(
      'select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r',
      [have.id, JSON.stringify(changes), `Re-imported: ${Object.keys(changes).join(', ')} changed where it was ruled.`, JSON.stringify(w.evidence)],
    )
    if (rows[0].r.refused) summary.blocked.push(`${have.id}: ${rows[0].r.refused}`)
    else summary.revised++
  }

  // Whatever is left was in the store and is gone from its source.
  for (const [, gone] of existing) {
    if (gone.status === 'retired' || gone.status === 'refused') continue
    const fromRulings = !!gone.source && PLAN_SOURCE.test(gone.source)
    const fromRegistry = gone.source === 'socialus-web:src/ontology/registry.json'
    if (!fromRulings && !fromRegistry) continue
    let replacedBy: string | null = null
    if (fromRulings) {
      const newer = rulings.find((r) =>
        r.replaces.some((t) => {
          const m = /^\[replaces (\d{4}-\d{2}-\d{2}): (.+)\]$/.exec(t)
          return !!m && m[1] === gone.decided_on && (gone.answer.includes(m[2].trim()) || m[2].includes(gone.answer))
        }),
      )
      replacedBy = newer ? idOfKey.get(rulingKey(newer.date, newer.words)) ?? null : null
      if (!replacedBy) {
        summary.goneWithoutReplacement.push(`${gone.id} (${gone.decided_on}): ${gone.answer}`)
        continue
      }
    }
    const { rows } = await db.query<{ r: { refused?: string } }>(
      'select knowledge.retire($1, $2, $3) as r',
      [gone.id, replacedBy, replacedBy ? 'Replaced where it was ruled.' : 'Gone from the ontology registry.'],
    )
    if (rows[0].r.refused) summary.blocked.push(`${gone.id}: ${rows[0].r.refused}`)
    else summary.retired++
  }

  // Links: what each ruling applies, and how the ontology hangs together.
  const live = rulings.filter((r) => idOfKey.has(rulingKey(r.date, r.words)))
  const idOf = (r: Ruling) => idOfKey.get(rulingKey(r.date, r.words))!
  const applies = inferApplies(
    live.filter((r) => !r.principle).map((r) => ({ id: idOf(r), text: `${r.words}\n${r.rest}` })),
    live.filter((r) => r.principle).map((r) => ({ id: idOf(r), text: `${r.words}\n${r.rest}`, anchor: r.anchor })),
  )
  const ontologyLinks = registry.links.flatMap((l) => {
    const id = `link.${slugOf(l.name)}`
    return [
      { from: id, to: `noun.${slugOf(l.from)}`, type: 'relates', reason: `${l.name}: from ${l.from}.` },
      { from: id, to: `noun.${slugOf(l.to)}`, type: 'relates', reason: `${l.name}: to ${l.to}.` },
      ...(l.writtenBy ?? []).map((h) => ({ from: `verb.${h}`, to: id, type: 'implements', reason: `${h} writes ${l.name}.` })),
    ]
  })
  const known = new Set(idOfKey.values())
  const all = [
    ...applies.map((a) => ({ from: a.from, to: a.to, type: 'applies', basis: a.basis, reason: a.reason })),
    ...ontologyLinks
      .filter((l) => known.has(l.from) && known.has(l.to) && l.from !== l.to)
      .map((l) => ({ ...l, basis: 'stated' })),
  ]
  for (const l of all) {
    const { rows } = await db.query<{ r: { id: number | null } }>(
      'select knowledge.link($1, $2, $3, $4, $5) as r',
      [l.from, l.to, l.type, l.basis, l.reason],
    )
    if (rows[0].r.id) summary.links++
  }

  // F130: concepts. The traced timelines, IMAGINE.md's ideas, and each
  // scenario's `concept:` frontmatter.
  summary.concepts = await loadConcepts(db, {
    seed: src.seed ?? readSeed(),
    ideas: readImagine(resolve(src.planDir, 'IMAGINE.md')),
    scenarios: readScenarios(src.planDir),
    commits: { plan: src.commits?.plan, web: src.commits?.web },
  })
  // F127: today's plan, after concepts so a scenario they made is not made twice.
  summary.plans = await loadPlans(db, readPlannedScenarios(src.planDir), src.commits?.plan)
  return summary
}

// ---------------------------------------------------------------------------
// The command line, for the workflow.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const planDir = resolve(arg('plan') ?? '../socialus-plan')
  const opsDir = resolve(arg('ops') ?? '../socialus-ops')
  const commit = process.argv.includes('--commit')
  const agent = arg('agent') ?? `import-${dateOnly(new Date())}-${process.env.GITHUB_RUN_ID ?? 'local'}`
  const src: Sources = {
    planDir,
    opsDir,
    registryPath: resolve(__dirname, '..', '..', 'src', 'ontology', 'registry.json'),
    commits: { plan: process.env.PLAN_COMMIT, ops: process.env.OPS_COMMIT, web: process.env.GITHUB_SHA },
  }
  const { exportConstraints } = await import('./export')
  const { readFileSync } = await import('node:fs')

  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    const { rows } = await db.query(`select to_regnamespace('knowledge') is not null as ready`)
    if (!rows[0].ready) throw new Error('The knowledge store is not in this database yet: apply its migration (#1221) first.')
    await db.query('begin')
    await enterStore(db, agent)
    const summary = await importAll(db, src)
    const exported = await exportConstraints(db, 'code')
    const handBuilt = readFileSync(resolve(planDir, 'constraints/code.md'), 'utf8')
    await leaveStore(db, agent)
    const matches = exported === handBuilt
    const report = [
      `## Knowledge import ${commit ? '' : '(dry run, rolled back)'}`,
      '',
      `- Recorded: ${summary.recorded}`,
      `- Revised: ${summary.revised}`,
      `- Unchanged: ${summary.unchanged}`,
      `- Retired: ${summary.retired}`,
      `- New links: ${summary.links}`,
      `- The store's constraints/code.md matches socialus-plan's: ${matches ? 'yes' : 'NO'}`,
      ...(summary.concepts ? conceptReport(summary.concepts) : []),
      ...(summary.plans ? planReport(summary.plans) : []),
      ...(summary.goneWithoutReplacement.length
        ? ['', 'Gone from socialus-plan with no ruling naming its replacement, so still live in the store:', ...summary.goneWithoutReplacement.map((g) => `- ${g}`)]
        : []),
      ...(summary.blocked.length ? ['', 'Not changed (the store offers no way to):', ...summary.blocked.map((b) => `- ${b}`)] : []),
    ].join('\n')
    console.log(report)
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFileSync } = await import('node:fs')
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
    }
    if (!matches) {
      await db.query('rollback')
      throw new Error("The store's export of constraints/code.md differs from socialus-plan's; nothing was written.")
    }
    await db.query(commit ? 'commit' : 'rollback')
  } catch (e) {
    await db.query('rollback').catch(() => {})
    throw e
  } finally {
    await db.end()
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
