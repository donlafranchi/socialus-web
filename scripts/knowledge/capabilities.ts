// F129 (#1239): keeps "what SocialUs can and can't do" true, nightly, and
// writes the same answer as one Markdown pack for a chat project.
//
// Run by .github/workflows/knowledge-capabilities.yml after the overnight
// live smoke. Writes only through the store's functions (knowledge.record for
// a feature the store has not seen, knowledge.set_capability for each line),
// as the store's own login holding a key minted for the run.
//
// WHERE EACH LINE'S STATE COMES FROM
//   · Its words, who it is for and the routes that prove it:
//     scripts/knowledge/capability-words.json, hand-kept here.
//   · Shipped and checked: build-log/reports/rollup.json in this repo, the
//     same source as today's hand-run capabilities page. It stands in for
//     F127 slice state on features already shipped, because their scenarios
//     are deleted from socialus-plan at sync and the store holds no slice for
//     them. A line is proven built only when every criterion it names is
//     shipped, checked and not marked unsmoked. A feature the roll-up does not
//     hold is read from its F127 slices instead: a shipped slice is built.
//   · Proven live (F129.3, F129.7): the open `bug · live:` Issue the
//     overnight smoke files names the routes that failed; a line whose route
//     is named there is "can't right now" until that Issue closes.
//   · Can't yet (F129.4): the unmet F126 condition the feature or its slices
//     start_when, else "not planned" from the words file or a dropped feature,
//     else built but not yet proven, else not built yet.

import { Client, type ClientBase } from 'pg'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { enterStore, leaveStore } from './import'
import { readCapabilities, renderAnswer, wordCount, type CapabilityLine, type Who } from '../../src/lib/knowledge/capabilities'

export const WORDS_PATH = join(__dirname, 'capability-words.json')
export const ROLLUP_PATH = resolve(__dirname, '..', '..', 'build-log', 'reports', 'rollup.json')
const WORDS_SOURCE = 'socialus-web:scripts/knowledge/capability-words.json'
export const LIVE_BUG_TITLE = 'bug · live: the overnight smoke found a problem'

export interface WordLine {
  feature: string
  criteria?: string[]
  slice?: string
  who: Who[]
  words: string
  routes?: string[]
  notPlanned?: boolean
}

export interface Rollup {
  as_of: string
  features: {
    feature: string
    title: string
    retired: boolean
    criteria: { id: string; status: string; built?: string; shipped: string; checked: string; smoked: string }[]
  }[]
}

export function readWords(path = WORDS_PATH): WordLine[] {
  return (JSON.parse(readFileSync(path, 'utf8')) as { lines: WordLine[] }).lines
}

export function readRollup(path = ROLLUP_PATH): Rollup {
  return JSON.parse(readFileSync(path, 'utf8')) as Rollup
}

/** A line's stable key: its feature and the criteria (or slice) it stands on, so its words can change. */
export function sourceOf(l: WordLine): string {
  return `${WORDS_SOURCE}#${l.feature}:${l.slice ?? (l.criteria ?? []).join(',')}`
}

/**
 * The routes a live-bug text names as failing. Each failure line reads
 * "<who> › <route>: <reason>" (scripts/smoke-failures.cjs); only names in
 * `known` count, so a stray word is never taken for a route.
 */
export function failingRoutes(text: string, known: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const line of text.split('\n')) {
    const head = line.split(':')[0]
    const route = head.split('›').pop()?.trim() ?? ''
    if (known.has(route)) out.add(route)
  }
  return out
}

export const NOT_BUILT = 'Not built yet.'
export const BUILT_WAITING = 'Built, waiting on its checks.'

export interface StoreFeature {
  status: string
  slices: { id: string; status: string }[]
  waitsOn: { id: string; answer: string } | null
}

export interface Verdict {
  status: 'can' | 'cant_now' | 'cant_yet' | 'not_planned'
  why: string | null
  waitsOn: string | null
}

/** One line's status, from its words, the roll-up, the store and tonight's failing routes. Pure. */
export function decide(
  l: WordLine,
  rollup: Rollup,
  store: StoreFeature | null,
  failing: Set<string>,
  problems: string[],
): Verdict {
  if (l.notPlanned) return { status: 'not_planned', why: 'Not planned.', waitsOn: null }
  if (store && (store.status === 'dropped' || (store.slices.length > 0 && store.slices.every((s) => s.status === 'withdrawn')))) {
    return { status: 'not_planned', why: 'Not planned.', waitsOn: null }
  }

  let built = false
  let live = false
  let proven = false
  const f = rollup.features.find((x) => x.feature === l.feature && !x.retired)
  if (l.slice) {
    built = live = proven = store?.slices.find((s) => s.id === l.slice)?.status === 'shipped'
  } else if (f && l.criteria?.length) {
    const named = l.criteria.map((id) => f.criteria.find((c) => c.id === id && c.status === 'active'))
    if (named.some((c) => !c)) {
      problems.push(`${l.feature} "${l.words}": names a criterion the roll-up does not hold as active (${l.criteria.join(', ')})`)
    } else {
      live = named.every((c) => c!.shipped === 'yes')
      built = live || named.every((c) => c!.built === 'yes')
      proven = live && named.every((c) => c!.checked === 'yes' && c!.smoked !== 'no')
    }
  } else if (store) {
    built = live = proven = store.slices.some((s) => s.status === 'shipped')
  } else {
    problems.push(`${l.feature} "${l.words}": neither the roll-up nor the store holds this feature`)
  }

  if (proven) {
    const bad = (l.routes ?? []).filter((r) => failing.has(r))
    if (bad.length) {
      return {
        status: 'cant_now',
        why: `The overnight check of the live site found a problem on the ${bad.join(' and ')} screen; back once it passes.`,
        waitsOn: null,
      }
    }
    return { status: 'can', why: null, waitsOn: null }
  }
  if (store?.waitsOn) return { status: 'cant_yet', why: null, waitsOn: store.waitsOn.id }
  return {
    status: 'cant_yet',
    // F129.4 as amended (socialus-plan #311): a can't-yet line names its
    // condition, or says not planned, not built yet, or built, waiting on its checks.
    why: live || built ? BUILT_WAITING : NOT_BUILT,
    waitsOn: null,
  }
}

async function storeFeature(db: ClientBase, id: string): Promise<StoreFeature | null> {
  const { rows } = await db.query<{ status: string }>(`select status from knowledge.records where id = $1 and kind = 'feature'`, [id])
  if (!rows[0]) return null
  const { rows: slices } = await db.query<{ id: string; status: string }>(
    `select s.id, s.status from knowledge.links l join knowledge.records s on s.id = l.from_id
      where l.to_id = $1 and l.type = 'slice_of' order by s.id`,
    [id],
  )
  // The first unmet condition the feature or any of its slices waits on.
  const { rows: waits } = await db.query<{ id: string; answer: string }>(
    `select c.id, c.answer from knowledge.links w join knowledge.records c on c.id = w.to_id
      where w.type = 'starts_when' and (w.from_id = $1 or w.from_id = any($2::text[]))
        and coalesce(knowledge.condition_status(c.id), '') not in ('met', 'withdrawn')
      order by c.id limit 1`,
    [id, slices.map((s) => s.id)],
  )
  return { status: rows[0].status, slices, waitsOn: waits[0] ?? null }
}

export interface CapabilitySummary {
  lines: number
  changed: { id: string; words: string; status: string }[]
  withdrawn: number
  featuresMade: number
  problems: string[]
}

/** As the store's login, holding an operator key: bring every line in line with tonight's evidence. */
export async function loadCapabilities(
  db: ClientBase,
  src: { words: WordLine[]; rollup: Rollup; failing: Set<string>; smokeEvidence?: string | null },
): Promise<CapabilitySummary> {
  const sum: CapabilitySummary = { lines: 0, changed: [], withdrawn: 0, featuresMade: 0, problems: [] }
  const evidence = JSON.stringify({ rollup_as_of: src.rollup.as_of, live_bug: src.smokeEvidence ?? null })
  const seen = new Set<string>()

  for (const l of src.words) {
    const source = sourceOf(l)
    if (seen.has(source)) {
      sum.problems.push(`${l.feature} "${l.words}": the same feature and criteria as another line; not loaded`)
      continue
    }
    seen.add(source)
    let store = await storeFeature(db, l.feature)
    if (!store) {
      const f = src.rollup.features.find((x) => x.feature === l.feature && !x.retired)
      if (!f) {
        sum.problems.push(`${l.feature} "${l.words}": neither the roll-up nor the store holds this feature`)
        continue
      }
      const active = f.criteria.filter((c) => c.status === 'active')
      await db.query('select knowledge.record($1::jsonb, $2, $3::jsonb)', [
        JSON.stringify({
          id: f.feature, kind: 'feature', answer: f.title,
          status: active.length && active.every((c) => c.shipped === 'yes') ? 'shipped' : 'building',
          source: 'socialus-web:build-log/reports/rollup.json', audience: 'department', departments: ['building'],
        }),
        'Imported: a feature named by what SocialUs can do (F129), read from the criteria roll-up.',
        evidence,
      ])
      sum.featuresMade++
      store = await storeFeature(db, l.feature)
    }
    const v = decide(l, src.rollup, store, src.failing, sum.problems)
    const reason =
      v.status === 'can' ? 'Shipped, checked and passing the overnight live check.'
      : v.status === 'cant_now' ? v.why!
      : v.status === 'not_planned' ? 'Not planned.'
      : v.waitsOn ? `Waiting on ${v.waitsOn}.`
      : v.why!
    const { rows } = await db.query<{ r: { id: string; changed: boolean } }>('select knowledge.set_capability($1::jsonb, $2, $3::jsonb) as r', [
      JSON.stringify({ source, answer: l.words, who: l.who, status: v.status, why: v.why, feature: l.feature,
                       ...(v.waitsOn ? { waits_on: v.waitsOn } : {}) }),
      `Nightly: ${reason}`,
      evidence,
    ])
    sum.lines++
    if (rows[0].r.changed) sum.changed.push({ id: rows[0].r.id, words: l.words, status: v.status })
  }

  // A line no longer in the words file is withdrawn, never deleted.
  const { rows: gone } = await db.query<{ source: string; answer: string; who: Who[]; feature: string }>(
    `select c.source, c.answer, c.who, l.to_id as feature from knowledge.records c
       join knowledge.links l on l.from_id = c.id and l.type = 'capability_of'
      where c.kind = 'capability' and c.status <> 'withdrawn' and c.source like $1`,
    [`${WORDS_SOURCE}#%`],
  )
  for (const g of gone.filter((x) => !seen.has(x.source))) {
    await db.query('select knowledge.set_capability($1::jsonb, $2)', [
      JSON.stringify({ source: g.source, answer: g.answer, who: g.who, status: 'withdrawn', feature: g.feature }),
      'Nightly: no longer in the words file.',
    ])
    sum.withdrawn++
  }
  return sum
}

/** The pack: one Markdown file for a chat project, dated, with where each part comes from. */
export function renderPack(lines: CapabilityLine[], asOf: string): string {
  return [
    '# What SocialUs can and can\'t do',
    '',
    `*As of ${asOf}* · Generated by socialus-web \`scripts/knowledge/capabilities.ts\` from the knowledge store; never hand-edited. ` +
      'A line says "can" only when it is live on socialus.org, checked, and passing the overnight live check. ' +
      'The id in brackets is the feature behind the line.',
    '',
    renderAnswer(lines, undefined, false).trimEnd(),
    '',
  ].join('\n')
}

/** The pack without its date line, for "did anything change since the last one". */
export function packBody(pack: string): string {
  return pack.split('\n').filter((l) => !l.startsWith('*As of ')).join('\n')
}

export interface SmokeReport {
  /** When this report was written. */
  at: string
  body: string
}

/**
 * Tonight's failures: the newest of the smoke's own reports on its open bug
 * (its "Again:" comments, else the Issue body), unless a smoke run that passed
 * finished after it. Pure, so it is tested without GitHub.
 */
export function tonightsFailures(reports: SmokeReport[], lastGreenRunAt: string | null): SmokeReport | null {
  const newest = [...reports].sort((x, y) => x.at.localeCompare(y.at)).pop() ?? null
  if (!newest) return null
  if (lastGreenRunAt && lastGreenRunAt > newest.at) return null
  return newest
}

async function getAll<T>(url: string, h: Record<string, string>): Promise<T[]> {
  const out: T[] = []
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${url}${url.includes('?') ? '&' : '?'}per_page=100&page=${page}`, { headers: h })
    if (!res.ok) throw new Error(`GitHub read failed: ${res.status} ${url}`)
    const rows = (await res.json()) as T[]
    out.push(...rows)
    if (rows.length < 100) break
  }
  return out
}

async function openLiveBug(repo: string, token: string): Promise<{ url: string; text: string } | null> {
  const h = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json' }
  const api = `https://api.github.com/repos/${repo}`
  const issue = (await getAll<{ number: number; title: string; body: string | null; html_url: string; created_at: string }>(
    `${api}/issues?state=open&labels=bug`, h,
  )).find((i) => i.title === LIVE_BUG_TITLE)
  if (!issue) return null
  // Only the smoke's own reports count, never a person's comment or a cross-reference.
  const comments = await getAll<{ body: string; created_at: string }>(`${api}/issues/${issue.number}/comments`, h)
  const reports: SmokeReport[] = [
    { at: issue.created_at, body: issue.body ?? '' },
    ...comments.filter((c) => c.body.startsWith('Again:')).map((c) => ({ at: c.created_at, body: c.body })),
  ]
  // A smoke run that passed after the last report clears it: the smoke files nothing on a pass.
  const runs = await fetch(`${api}/actions/workflows/smoke-live.yml/runs?status=success&per_page=1`, { headers: h })
  const green = runs.ok ? ((await runs.json()) as { workflow_runs: { updated_at: string }[] }).workflow_runs[0]?.updated_at ?? null : null
  const t = tonightsFailures(reports, green)
  return t ? { url: issue.html_url, text: t.body } : null
}

export const ROUTES_PATH = resolve(__dirname, '..', '..', 'evals', 'screens', 'routes.ts')

/** The smoke's route names, read from evals/screens/routes.ts as text (it imports the browser test kit). */
export function routeNames(path = ROUTES_PATH): Set<string> {
  return new Set([...readFileSync(path, 'utf8').matchAll(/\bname: '([a-z0-9-]+)'/g)].map((m) => m[1]))
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL is not set.')
  const commit = process.argv.includes('--commit')
  const out = arg('--out')
  const repo = process.env.GITHUB_REPOSITORY
  const token = process.env.GITHUB_TOKEN

  const bug = repo && token ? await openLiveBug(repo, token) : null
  const failing = bug ? failingRoutes(bug.text, routeNames()) : new Set<string>()

  const db = new Client({ connectionString: url })
  await db.connect()
  const agent = `capabilities-${process.env.GITHUB_RUN_ID ?? Date.now()}`
  try {
    await db.query('begin')
    await enterStore(db, agent)
    const sum = await loadCapabilities(db, { words: readWords(), rollup: readRollup(), failing, smokeEvidence: bug?.url ?? null })
    const lines = await readCapabilities(db)
    const answer = renderAnswer(lines)
    await leaveStore(db, agent)
    await db.query(commit ? 'commit' : 'rollback')

    const pack = renderPack(lines, new Date().toISOString().slice(0, 10))
    if (out) {
      const before = existsSync(out) ? readFileSync(out, 'utf8') : ''
      writeFileSync(out, pack)
      const changed = packBody(before) !== packBody(pack)
      console.log(`pack ${changed ? 'changed' : 'unchanged'}: ${out}`)
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `pack_changed=${changed}\n`)
    }
    const report = [
      `## What SocialUs can do${commit ? '' : ' (dry run, rolled back)'}`,
      `- Lines: ${sum.lines}; changed tonight: ${sum.changed.length}; withdrawn: ${sum.withdrawn}; features added to the store: ${sum.featuresMade}.`,
      ...sum.changed.map((c) => `- ${c.id} now ${c.status}: ${c.words}`),
      `- Live smoke: ${bug ? `failing routes ${[...failing].join(', ') || '(none named)'} (${bug.url})` : 'no open live bug'}.`,
      `- Answer: ${wordCount(answer)} words.`,
      ...sum.problems.map((p) => `- Problem (the pack is still pushed): ${p}`),
    ].join('\n')
    console.log(report)
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report + '\n')
    if (sum.problems.length) process.exitCode = 1
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
