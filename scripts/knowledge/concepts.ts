// F130 (#1232): concepts into the knowledge store: the two traced timelines
// (concepts-seed.json, criterion 4), socialus-plan's IMAGINE.md ideas
// (criterion 5) and each scenario's `concept:` frontmatter (criterion 6).
//
// Called by the import (import.ts) inside its one transaction, as the store's
// login holding an operator key. Writes only through the store's functions:
// knowledge.record / revise / link / name_concept / concept_event.
//
// RE-RUNNABLE. A concept from the seed keeps the id the seed gives it; an idea
// is found again by its source (`socialus-plan:IMAGINE.md#<slug>`), so a
// second run, or a run after the idea has left IMAGINE.md, records nothing
// twice and drops nothing. Names and events are one row each however often
// they are sent (the store's own unique keys).

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { ClientBase } from 'pg'
import { slugOf, splitLines } from './plan-source'

// ---------------------------------------------------------------------------
// The seed.

export type EventType =
  | 'idea' | 'scoped' | 'ruling' | 'renamed' | 'split' | 'merged' | 'cut' | 'deferred' | 'built' | 'reversed'

export interface Evidence {
  kind: 'plan_commit' | 'web_commit' | 'web_pr' | 'scenario' | 'criterion' | 'doc'
  ref: string
  note?: string
}

export interface SeedConcept {
  id: string
  title: string
  status: string
  concern: string | null
  why: string
  names: {
    name: string
    on: string
    state: 'used' | 'refused'
    evidence: Evidence[]
    note?: string
    /** The dated ruling behind the name, by its date and bold words, as socialus-plan writes it. */
    ruling?: { on: string; words: string }
  }[]
  entries: {
    on: string
    text: string
    events: { type: EventType; what: string; evidence: Evidence[]; pm_words?: string }[]
  }[]
  /** From a scenario (F###) or an IMAGINE idea (by its name) to this concept. */
  lineage: ({ from: string; type: string } | { imagine: string; type: string })[]
}

export interface Seed {
  brief: string
  concepts: SeedConcept[]
}

export const SEED_PATH = join(__dirname, 'concepts-seed.json')

export function readSeed(path = SEED_PATH): Seed {
  return JSON.parse(readFileSync(path, 'utf8')) as Seed
}

/** The name a concept goes by: its latest used name. */
export function currentName(c: Pick<SeedConcept, 'names'>): string {
  const used = c.names.filter((n) => n.state === 'used').sort((a, b) => (a.on < b.on ? -1 : a.on > b.on ? 1 : 0))
  return used[used.length - 1].name
}

// ---------------------------------------------------------------------------
// IMAGINE.md.

export interface Idea {
  name: string
  slug: string
  /** The idea's date: its entry's own, else the date its section was distilled. */
  on: string
  /** What the idea is: the bullet's words, or the entry's words without the PM's quote or the analysis. */
  description: string
  /** The PM's own words, verbatim, when the entry gives them. */
  pmWords: string | null
  /** An agent's analysis, kept apart from the PM's words. */
  analysis: string | null
  lane: string | null
  line: number
}

/** Under `## Ideas` the bullets were distilled on this date (IMAGINE.md says so). */
export const IDEAS_DISTILLED_ON = '2026-09-09'

const LANE = /\s*\[lane:\s*([a-z -]+)\]\s*/i
const PM_MARK = /\*(?:Don|The PM),\s*(\d{4}-\d{2}-\d{2})[^*]*\*\s*/
const ANALYSIS_MARK = /\*Analysis[^*]*\*\s*/i
const REAL_MARK = /What would make it real:/i

function clean(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

function stripQuotes(s: string): string {
  return s.replace(/^["“]+|["”]+$/g, '').trim()
}

export function readImagine(path: string): Idea[] {
  if (!existsSync(path)) return []
  const lines = splitLines(readFileSync(path, 'utf8'))
  const out: Idea[] = []
  let section = ''
  let entry: { name: string; line: number; body: string[] } | null = null

  const closeEntry = () => {
    if (!entry) return
    const body = entry.body.join('\n')
    const flat = clean(body)
    const laneM = LANE.exec(flat)
    const lane = laneM ? laneM[1].trim() : null
    const text = clean(flat.replace(LANE, ' '))
    const pm = PM_MARK.exec(text)
    const an = ANALYSIS_MARK.exec(text)
    const real = REAL_MARK.exec(text)
    let pmWords: string | null = null
    let analysis: string | null = null
    let description = text
    if (pm) {
      const start = pm.index + pm[0].length
      const end = an && an.index > start ? an.index : real && real.index > start ? real.index : text.length
      pmWords = stripQuotes(text.slice(start, end).trim()) || null
      description = clean(text.slice(0, pm.index) + ' ' + text.slice(end))
    }
    if (an) {
      const start = an.index + an[0].length
      const end = real && real.index > start ? real.index : text.length
      analysis = text.slice(start, end).trim() || null
      description = clean(description.replace(text.slice(an.index, end), ' '))
    }
    out.push({
      name: entry.name,
      slug: slugOf(entry.name),
      on: pm ? pm[1] : IDEAS_DISTILLED_ON,
      description: description || entry.name,
      pmWords,
      analysis,
      lane,
      line: entry.line,
    })
    entry = null
  }

  lines.forEach((l, i) => {
    if (/^## /.test(l)) {
      closeEntry()
      section = l.slice(3).trim()
      return
    }
    if (section === 'Ideas') {
      const b = /^- \*\*(.+?)\*\*\s*(.*)$/.exec(l)
      if (b) {
        const name = b[1].replace(/[.:]\s*$/, '').trim()
        const laneM = LANE.exec(b[2])
        out.push({
          name,
          slug: slugOf(name),
          on: IDEAS_DISTILLED_ON,
          description: clean(b[2].replace(LANE, ' ')) || name,
          pmWords: null,
          analysis: null,
          lane: laneM ? laneM[1].trim() : null,
          line: i + 1,
        })
      }
      return
    }
    if (section.startsWith('Added under the house rules')) {
      const h = /^### (.+)$/.exec(l)
      if (h) {
        closeEntry()
        entry = { name: h[1].trim(), line: i + 1, body: [] }
      } else if (entry) {
        entry.body.push(l)
      }
    }
  })
  closeEntry()
  return out
}

export function ideaSource(slug: string): string {
  return `socialus-plan:IMAGINE.md#${slug}`
}

// ---------------------------------------------------------------------------
// Scenarios.

export interface Scenario {
  id: string
  title: string
  status: string | null
  concept: string | null
  file: string
}

/** The `key: value` lines of a file's opening `---` block. */
export function frontmatter(text: string): Record<string, string> {
  const lines = splitLines(text)
  if (lines[0]?.trim() !== '---') return {}
  const out: Record<string, string> = {}
  for (let i = 1; i < lines.length && lines[i].trim() !== '---'; i++) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i])
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return out
}

export const CONCEPT_ID = /^CO-\d{4}$/

/**
 * #1250: a scenario with no concept yet names `concept: new`, and the import
 * mints one from the scenario's title. Found again by this source, so a second
 * run mints nothing; the report names the id to put in place of `new`.
 */
export const NEW_CONCEPT = /^new$/i

export function scenarioConceptSource(file: string): string {
  return `socialus-plan:${file}#concept`
}

export function readScenarios(planDir: string): Scenario[] {
  const dir = join(planDir, 'planning')
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => /^scenario-F\d+\.md$/.test(f))
    .sort()
    .map((f) => {
      const fm = frontmatter(readFileSync(join(dir, f), 'utf8'))
      const id = fm.id || f.replace(/^scenario-|\.md$/g, '')
      return { id, title: fm.title || id, status: fm.status ?? null, concept: fm.concept || null, file: `planning/${f}` }
    })
}

const FEATURE_STATUS: Record<string, string> = {
  draft: 'draft',
  proposed: 'draft',
  approved: 'approved',
  building: 'building',
  built: 'shipped',
  shipped: 'shipped',
  done: 'shipped',
  dropped: 'dropped',
  cut: 'dropped',
  retired: 'dropped',
}

export function featureStatus(s: string | null): string {
  return (s && FEATURE_STATUS[s.toLowerCase()]) || 'approved'
}

// ---------------------------------------------------------------------------
// Writing.

export interface ConceptSummary {
  conceptsRecorded: number
  conceptsRevised: number
  ideasRecorded: number
  features: number
  names: number
  events: number
  links: number
  /** Ideas loaded this run or earlier, by name, with the id each has. */
  ideaIds: { name: string; id: string }[]
  /** Concepts minted for scenarios that name `concept: new`, this run or earlier. */
  minted: { scenario: string; file: string; id: string; fresh: boolean }[]
  problems: string[]
}

const AUDIENCE = { audience: 'department', departments: ['building'] }
const SEED_SOURCE = 'socialus-web:scripts/knowledge/concepts-seed.json'

async function q<T>(db: ClientBase, sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query(sql, params)
  return rows[0].r as T
}

async function recordOf(db: ClientBase, id: string) {
  const { rows } = await db.query<{ id: string; kind: string; status: string; answer: string; why: string | null; concern: string | null; source: string | null }>(
    'select id, kind, status, answer, why, concern, source from knowledge.records where id = $1',
    [id],
  )
  return rows[0] ?? null
}

/** A scenario's record, made if the store does not hold it yet. Never deleted, so links to it outlive its file. */
async function ensureFeature(db: ClientBase, s: Scenario | { id: string }, sum: ConceptSummary, commit?: string): Promise<boolean> {
  const have = await recordOf(db, s.id)
  if (have) {
    if (have.kind !== 'feature') {
      sum.problems.push(`${s.id} is a ${have.kind} in the store, not a scenario`)
      return false
    }
    return true
  }
  const full = 'file' in s ? s : null
  await q(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb) as r', [
    JSON.stringify({
      id: s.id,
      kind: 'feature',
      answer: full ? full.title : `Scenario ${s.id}`,
      status: featureStatus(full?.status ?? null),
      source: full ? full.file : `planning/scenario-${s.id}.md`,
      ...AUDIENCE,
    }),
    full ? 'Imported: a scenario that names its concept.' : "Imported: a scenario named in a concept's lineage.",
    JSON.stringify({ repo: 'socialus-plan', commit: commit ?? null, file: full?.file ?? null }),
  ])
  sum.features++
  return true
}

async function link(db: ClientBase, from: string, to: string, type: string, reason: string, sum: ConceptSummary) {
  const r = await q<{ id: number | null }>(db, 'select knowledge.link($1, $2, $3, $4, $5) as r', [from, to, type, 'stated', reason])
  if (r.id) sum.links++
}

/** A ruling in the store, by the date and words the import keys rulings on. */
async function rulingId(db: ClientBase, r: { on: string; words: string }): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>(
    `select id from knowledge.records
      where kind in ('decision', 'philosophy') and decided_on = $1::date
        and answer in ($2, rtrim($2, '.'))
      order by id limit 1`,
    [r.on, r.words],
  )
  return rows[0]?.id ?? null
}

async function name(db: ClientBase, concept: string, n: SeedConcept['names'][number], sum: ConceptSummary) {
  let ruling: string | null = null
  if (n.ruling) {
    ruling = await rulingId(db, n.ruling)
    if (!ruling) sum.problems.push(`${concept} "${n.name}": no ruling ${n.ruling.on} "${n.ruling.words}" in the store, so the name is recorded without it`)
  }
  const id = await q<number | null>(db, 'select knowledge.name_concept($1, $2, $3::date, $4, $5::jsonb, $6, $7) as r', [
    concept, n.name, n.on, n.state, JSON.stringify(n.evidence), ruling, n.note ?? null,
  ])
  if (id) sum.names++
}

async function event(
  db: ClientBase,
  concept: string,
  on: string,
  e: { type: EventType; what: string; evidence: Evidence[]; pm_words?: string | null },
  sum: ConceptSummary,
) {
  const id = await q<number | null>(db, 'select knowledge.concept_event($1, $2, $3::date, $4, $5::jsonb, $6) as r', [
    concept, e.type, on, e.what, JSON.stringify(e.evidence), e.pm_words ?? null,
  ])
  if (id) sum.events++
}

export interface ConceptSources {
  seed: Seed
  ideas: Idea[]
  scenarios: Scenario[]
  commits?: { plan?: string; web?: string }
  /** The import's date, for a concept minted for a scenario; today unless given. */
  today?: string
}

/** As the store's login, holding an operator key: bring concepts in line with the seed, IMAGINE.md and the scenarios. */
export async function loadConcepts(db: ClientBase, src: ConceptSources): Promise<ConceptSummary> {
  const sum: ConceptSummary = {
    conceptsRecorded: 0, conceptsRevised: 0, ideasRecorded: 0, features: 0, names: 0, events: 0, links: 0,
    ideaIds: [], minted: [], problems: [],
  }

  // The traced timelines, first: their ids are fixed (CO-0001, CO-0002).
  for (const c of src.seed.concepts) {
    const answer = currentName(c)
    const have = await recordOf(db, c.id)
    const firstOn = c.entries.map((e) => e.on).concat(c.names.map((n) => n.on)).sort()[0]
    if (!have) {
      await q(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb, $4::timestamptz) as r', [
        JSON.stringify({ id: c.id, kind: 'concept', concern: c.concern ?? undefined, answer, why: c.why, status: c.status,
                         source: SEED_SOURCE, ...AUDIENCE }),
        `Imported: ${c.title.replace(/\*\*/g, '')}, as traced in ${src.seed.brief}.`,
        JSON.stringify({ repo: 'socialus-web', commit: src.commits?.web ?? null, file: 'scripts/knowledge/concepts-seed.json' }),
        firstOn,
      ])
      sum.conceptsRecorded++
    } else if (have.kind !== 'concept' || have.source !== SEED_SOURCE) {
      // Never turn another record into a traced concept: the migration keeps
      // these ids free, so this is a record someone made by hand.
      sum.problems.push(`${c.id} is already in the store and did not come from the traced timelines; it is left as it is`)
      continue
    } else {
      const changes: Record<string, unknown> = {}
      if (have.answer !== answer) changes.answer = answer
      if (have.why !== c.why) changes.why = c.why
      if (have.status !== c.status) changes.status = c.status
      if ((have.concern ?? null) !== (c.concern ?? null)) changes.concern = c.concern
      if (Object.keys(changes).length) {
        const r = await q<{ refused?: string }>(db, 'select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r', [
          c.id, JSON.stringify(changes), `Re-imported: ${Object.keys(changes).join(', ')} changed in the traced timeline.`,
          JSON.stringify({ repo: 'socialus-web', commit: src.commits?.web ?? null, file: 'scripts/knowledge/concepts-seed.json' }),
        ])
        if (r.refused) sum.problems.push(`${c.id}: ${r.refused}`)
        else sum.conceptsRevised++
      }
    }
    for (const n of c.names) await name(db, c.id, n, sum)
    for (const entry of c.entries) for (const e of entry.events) await event(db, c.id, entry.on, e, sum)
  }

  // Ideas, after the seeded concepts so a numbered idea never takes a seeded id.
  const { rows: bySource } = await db.query<{ id: string; source: string }>(
    `select id, source from knowledge.records where kind = 'concept' and source like 'socialus-plan:IMAGINE.md#%'`,
  )
  const ideaId = new Map(bySource.map((r) => [r.source, r.id]))
  const seen = new Map<string, string>()
  for (const idea of src.ideas) {
    const source = ideaSource(idea.slug)
    if (seen.has(idea.slug)) {
      sum.problems.push(`IMAGINE.md: "${idea.name}" (line ${idea.line}) has the same slug as "${seen.get(idea.slug)}"; rename one, it was not loaded`)
      continue
    }
    seen.set(idea.slug, idea.name)
    let id = ideaId.get(source)
    if (!id) {
      id = await q<string>(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb, $4::timestamptz) as r', [
        JSON.stringify({
          kind: 'concept',
          answer: idea.name,
          why: [idea.description, idea.analysis ? `Analysis, agent: ${idea.analysis}` : null].filter(Boolean).join('\n\n'),
          status: 'idea',
          source,
          tags: idea.lane ? [`lane:${idea.lane}`] : [],
          ...AUDIENCE,
        }),
        'Imported from IMAGINE.md: an idea becomes a concept.',
        JSON.stringify({ repo: 'socialus-plan', commit: src.commits?.plan ?? null, file: 'IMAGINE.md', line: idea.line }),
        idea.on,
      ])
      ideaId.set(source, id)
      sum.ideasRecorded++
      // Its name and idea event come with it, once: an idea is found again by
      // its source, so words edited while it waits in IMAGINE.md add nothing.
      const evidence: Evidence[] = [
        { kind: 'doc', ref: `IMAGINE.md#${idea.slug}` },
        ...(src.commits?.plan ? [{ kind: 'plan_commit' as const, ref: src.commits.plan.slice(0, 7) }] : []),
      ]
      await name(db, id, { name: idea.name, on: idea.on, state: 'used', evidence }, sum)
      await event(db, id, idea.on, { type: 'idea', what: idea.description, evidence, pm_words: idea.pmWords }, sum)
    }
    sum.ideaIds.push({ name: idea.name, id })
  }

  // The seed's lineage, once the ideas it may point at are in. A scenario
  // whose file is still there is recorded with its own title and status.
  const scenarioById = new Map(src.scenarios.map((s) => [s.id, s]))
  for (const c of src.seed.concepts) {
    for (const l of c.lineage) {
      if ('from' in l) {
        if (await ensureFeature(db, scenarioById.get(l.from) ?? { id: l.from }, sum, src.commits?.plan)) {
          await link(db, l.from, c.id, l.type, `${l.from} ${l.type} ${c.id}, as traced in ${src.seed.brief}.`, sum)
        }
      } else {
        const from = ideaId.get(ideaSource(slugOf(l.imagine)))
        if (!from) {
          sum.problems.push(`${c.id}: no idea "${l.imagine}" in IMAGINE.md or the store yet, so its ${l.type} link waits`)
          continue
        }
        await link(db, from, c.id, l.type, `"${l.imagine}" ${l.type} ${c.id}, as traced in ${src.seed.brief}.`, sum)
      }
    }
  }

  // Scenarios that name their concept.
  for (const s of src.scenarios) {
    if (!s.concept) continue
    if (NEW_CONCEPT.test(s.concept)) {
      const id = await mintForScenario(db, s, sum, src.today ?? new Date().toISOString().slice(0, 10), src.commits?.plan)
      if (id && (await ensureFeature(db, s, sum, src.commits?.plan))) {
        await link(db, s.id, id, 'scopes', `${s.file} names \`concept: new\`; ${id} was minted for it.`, sum)
      }
      continue
    }
    if (!CONCEPT_ID.test(s.concept)) {
      sum.problems.push(`${s.file}: concept "${s.concept}" is not a concept id (CO-0001) or \`new\``)
      continue
    }
    const target = await recordOf(db, s.concept)
    if (!target || target.kind !== 'concept') {
      sum.problems.push(`${s.file}: no concept ${s.concept} in the store`)
      continue
    }
    if (await ensureFeature(db, s, sum, src.commits?.plan)) {
      await link(db, s.id, s.concept, 'scopes', `${s.file} names ${s.concept} in its frontmatter.`, sum)
    }
  }
  return sum
}

/** The concept a scenario that names `concept: new` scopes: found by its source, else minted, scoped, from its title. */
async function mintForScenario(db: ClientBase, s: Scenario, sum: ConceptSummary, on: string, commit?: string): Promise<string | null> {
  const source = scenarioConceptSource(s.file)
  const { rows } = await db.query<{ id: string; kind: string }>('select id, kind from knowledge.records where source = $1', [source])
  if (rows[0]) {
    sum.minted.push({ scenario: s.id, file: s.file, id: rows[0].id, fresh: false })
    return rows[0].id
  }
  const evidence: Evidence[] = [
    { kind: 'scenario', ref: s.id },
    ...(commit ? [{ kind: 'plan_commit' as const, ref: commit.slice(0, 7) }] : []),
  ]
  const id = await q<string>(db, 'select knowledge.record($1::jsonb, $2, $3::jsonb) as r', [
    JSON.stringify({
      kind: 'concept',
      answer: s.title,
      why: `Started by ${s.id}, which had no concept to name: ${s.title}.`,
      status: 'scoped',
      source,
      ...AUDIENCE,
    }),
    `Imported: ${s.file} names \`concept: new\`, so the scenario starts its own concept.`,
    JSON.stringify({ repo: 'socialus-plan', commit: commit ?? null, file: s.file }),
  ])
  sum.conceptsRecorded++
  await name(db, id, { name: s.title, on, state: 'used', evidence }, sum)
  await event(db, id, on, { type: 'scoped', what: `${s.id} starts this concept: ${s.title}.`, evidence }, sum)
  sum.minted.push({ scenario: s.id, file: s.file, id, fresh: true })
  return id
}

export function conceptReport(sum: ConceptSummary): string[] {
  return [
    `- Concepts recorded: ${sum.conceptsRecorded}, revised: ${sum.conceptsRevised}; ideas recorded: ${sum.ideasRecorded}`,
    `- Scenario records made: ${sum.features}; new names: ${sum.names}; new events: ${sum.events}; new concept links: ${sum.links}`,
    ...(sum.ideaIds.length ? ['', 'Ideas in the store, from IMAGINE.md:', ...sum.ideaIds.map((i) => `- ${i.id}: ${i.name}`)] : []),
    ...(sum.minted.length
      ? ['', 'Scenarios that started their own concept (put the id in place of `concept: new`):',
         ...sum.minted.map((m) => `- ${m.file}: \`concept: ${m.id}\`${m.fresh ? ' (minted this run)' : ''}`)]
      : []),
    ...(sum.problems.length ? ['', 'Concepts not linked:', ...sum.problems.map((p) => `- ${p}`)] : []),
  ]
}
