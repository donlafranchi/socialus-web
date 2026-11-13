// F131 (#1249): three short answers, for the PM and for any agent starting
// work: what we built and the point of each part, where we are, and what's
// next. The lookup tool's `built`, `where` and `next`, and the renderer the
// job (scripts/knowledge/live-state.ts) writes as the phone page, so a chat
// answer and the page come from the same function and never disagree (F131.7).
//
// Rules every answer keeps (F131.1, F131.6):
//   · 10 lines or fewer; past that, the last line says how many more.
//   · Plain words: ticket numbers, record ids and title prefixes are taken out.
//   · Every line ends with its source: (store), (GitHub), (Vercel) or (both).
//     A line is only made from a row that backs it; nothing is written by hand.
//
// Reads: concepts and capabilities (F130, F129), versions and the roadmap
// (F127), conditions (F126), and knowledge.live_state, the job's snapshot of
// GitHub. Each through the store's own functions or row-level security, on a
// connection already holding the caller's key.

import type { ClientBase } from 'pg'
import type { KnowledgeTool } from './tools'

export const MAX_LINES = 10
export const MAX_NEXT = 5

export type Source = 'store' | 'github' | 'vercel' | 'both'
const SOURCE_WORDS: Record<Source, string> = { store: 'store', github: 'GitHub', vercel: 'Vercel', both: 'both' }

export interface Line {
  text: string
  source: Source
}

// ---------------------------------------------------------------------------
// Words.

/**
 * A title or record answer in plain words: no `F060 · T142 ·`, `bug ·`,
 * `live:` prefixes, no ticket, PR, scenario, slice or record numbers.
 */
export function plain(s: string): string {
  let t = s.replace(/\s+/g, ' ').trim()
  // Leading "F060 · T142 · ", "bug · ", "change · ", "chore · " segments.
  for (;;) {
    const m = /^(?:F\d+(?:-S\d+)?|T\d+|bug|change|chore|process|scenario)\s*[·:|-]\s*/i.exec(t)
    if (!m) break
    t = t.slice(m[0].length)
  }
  t = t.replace(/^live:\s*/i, '')
  t = t
    .replace(/\b(?:PR|Issue|ticket)\s*#\d+\b/gi, '')
    .replace(/#\d+\b/g, '')
    .replace(/\b(?:F\d{2,4}(?:-S\d+)?|T\d{2,4}|CO-\d{4}|CN-\d{4}|VN-\d{4}|CA-\d{4}|D-\d{4}|PH-\d{4}|PT-\d{4}|C-\d{4})(?:\.\d+)?\b/g, '')
    .replace(/\(\s*[,;·]?\s*\)/g, '')
    // A word left pointing at a removed id ("see #77", "for CO-0002") goes with it.
    .replace(/\b(?:see|for|in|of|on|to|from|by|via|per)\s*(?=[,.;:)]|$)/gi, '')
    .replace(/\s+([,.;:)])/g, '$1')
    .replace(/[,;:]+(?=[.,;:)]|$)/g, '')
    .replace(/\(\s+/g, '(')
    .replace(/\s*·\s*$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return t.replace(/^[,.;:·\s]+/, '')
}

/** The first sentence of a why: the point of a part. */
export function firstSentence(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.replace(/\s+/g, ' ').trim()
  if (!t) return null
  const m = /^(.+?[.!?])(\s|$)/.exec(t)
  return (m ? m[1] : t.endsWith('.') ? t : `${t}.`).trim()
}

const dot = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`)
const cap1 = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

/** Some names, then "and N more". */
export function some(names: string[], n = 2): string {
  const uniq = [...new Set(names.filter(Boolean))]
  if (uniq.length <= n) return uniq.join('; ')
  return `${uniq.slice(0, n).join('; ')} and ${uniq.length - n} more`
}

/** The lines as text: each ends with its source, and no more than MAX_LINES. */
export function render(lines: Line[], max = MAX_LINES, more = 'more'): string {
  const shown = lines.length > max ? lines.slice(0, max - 1) : lines
  const out = shown.map((l) => `- ${l.text} (${SOURCE_WORDS[l.source]})`)
  if (lines.length > max) {
    const rest = lines.slice(max - 1)
    const sources = [...new Set(rest.map((l) => l.source))]
    out.push(`- And ${rest.length} ${more} (${SOURCE_WORDS[sources.length === 1 ? sources[0] : 'both']})`)
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Reads.

export interface LiveRow {
  kind: 'broken' | 'slow' | 'bug' | 'blocker' | 'waiting' | 'in_flight'
  key: string
  words: string
  url: string | null
  source: 'github' | 'vercel'
  since: string | null
  taken_at: string
}

export async function readLive(db: ClientBase): Promise<LiveRow[]> {
  const { rows } = await db.query<LiveRow>('select * from knowledge.live_state()')
  return rows
}

/** Whether this key may read the live state at all (building, telemetry-and-bugs, operators). */
export async function canSeeLive(db: ClientBase): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    `select knowledge.can_see('department', array['building', 'telemetry-and-bugs']) as ok`,
  )
  return rows[0]?.ok ?? false
}

export async function liveTakenAt(db: ClientBase): Promise<Date | null> {
  const { rows } = await db.query<{ taken_at: Date }>('select taken_at from knowledge.live_state_taken')
  return rows[0]?.taken_at ?? null
}

interface RoadmapRow {
  horizon: 'now' | 'next' | 'later'
  rank: number
  slice: string
  answer: string
  status: string
  feature: string | null
  feature_answer: string | null
  waits_on: string[]
}

async function roadmap(db: ClientBase): Promise<RoadmapRow[]> {
  const { rows } = await db.query<RoadmapRow>('select * from knowledge.roadmap()')
  return rows
}

// ---------------------------------------------------------------------------
// What we built, and the point of each part (F131.2).

export async function builtLines(db: ClientBase): Promise<Line[]> {
  const { rows: concepts } = await db.query<{ id: string; answer: string; why: string | null; first_on: Date | null }>(
    `select r.id, r.answer, r.why,
            (select min(e.happened_on) from knowledge.concept_events e where e.concept_id = r.id) as first_on
       from knowledge.records r
      where r.kind = 'concept' and r.status = 'built'
      order by first_on nulls last, r.id`,
  )
  const lines: Line[] = []
  for (const c of concepts) {
    const point = firstSentence(c.why)
    // Only a concept with a point says what it is for (F131.2); one without is
    // not shown rather than shown bare.
    if (!point) continue
    lines.push({ text: `${dot(plain(c.answer))} ${plain(point)}`, source: 'store' })
  }
  // What a member can do that no built concept covers yet: F129's "can" lines,
  // shipped, checked and passing the live smoke, one per feature.
  const { rows: can } = await db.query<{ words: string; feature: string | null }>(
    `select c.words, c.feature
       from knowledge.capabilities(null) c
      where c.status = 'can'
        and not exists (select 1 from knowledge.links s join knowledge.records k on k.id = s.to_id
                         where s.from_id = c.feature and s.type = 'scopes' and k.kind = 'concept' and k.status = 'built')`,
  )
  const seen = new Set<string>()
  for (const c of can) {
    const key = c.feature ?? c.words
    if (seen.has(key)) continue
    seen.add(key)
    lines.push({ text: dot(cap1(plain(c.words))), source: 'store' })
  }
  return lines
}

// ---------------------------------------------------------------------------
// Where we are (F131.3).

export async function whereLines(db: ClientBase): Promise<Line[]> {
  const lines: Line[] = []
  const { rows: versions } = await db.query<{ answer: string; due_on: string | null }>(
    `select answer, to_char(due_on, 'FMMonth YYYY') as due_on from knowledge.records
      where kind = 'version' and status = 'current' order by id`,
  )
  for (const v of versions) {
    lines.push({ text: `Live: ${plain(v.answer)}${v.due_on ? `, until ${v.due_on}` : ''}.`, source: 'store' })
  }

  const taken = await liveTakenAt(db)
  const live = await readLive(db)
  const of = (k: LiveRow['kind']) => live.filter((r) => r.kind === k)
  const src = (rs: LiveRow[]): Source => (rs.every((r) => r.source === 'vercel') ? 'vercel' : rs.some((r) => r.source === 'vercel') ? 'both' : 'github')

  // A key that may not read the live state is told nothing about it: "not
  // read yet" would be a line nothing backs (F131.6) for a key that simply
  // cannot see it.
  const visible = await canSeeLive(db)
  if (!taken && visible) {
    lines.push({ text: "GitHub's state has not been read into the store yet, so broken, slow and waiting are not known.", source: 'store' })
  } else if (taken) {
    const broken = of('broken')
    if (broken.length) lines.push({ text: `Broken: ${some(broken.map((r) => plain(r.words)))}.`, source: src(broken) })
    const slow = of('slow')
    if (slow.length) lines.push({ text: `Slow: ${some(slow.map((r) => plain(r.words)))}.`, source: src(slow) })
  }

  const building = (await roadmap(db)).filter((r) => r.status === 'building')
  const prs = of('in_flight')
  if (building.length || prs.length) {
    const what = building.length
      ? some(building.map((r) => plain(r.feature_answer ?? r.answer)), 4)
      : `${prs.length} change${prs.length === 1 ? '' : 's'} open`
    const extra = building.length && prs.length ? `; ${prs.length} change${prs.length === 1 ? '' : 's'} open` : ''
    lines.push({ text: `In flight: ${what}${extra}.`, source: building.length && prs.length ? 'both' : building.length ? 'store' : 'github' })
  }

  if (taken) {
    const blockers = of('blocker')
    if (blockers.length) {
      lines.push({ text: `Before beta closes: ${blockers.length} launch blocker${blockers.length === 1 ? '' : 's'}, first ${plain(blockers[0].words)}.`, source: 'github' })
    }
    const waiting = of('waiting')
    if (waiting.length) {
      lines.push({ text: `Waiting on you: ${plain(waiting[0].words)}${waiting.length > 1 ? ` (first of ${waiting.length})` : ''}.`, source: 'github' })
    }
    const bugs = of('bug')
    if (bugs.length) lines.push({ text: `Open bugs: ${bugs.length}.`, source: 'github' })
    lines.push({ text: `GitHub read ${new Date(taken).toISOString().slice(0, 16).replace('T', ' ')} UTC.`, source: 'store' })
  }
  return lines
}

// ---------------------------------------------------------------------------
// What's next (F131.4): broken first, then what unblocks others, then the top of Now.

export type Who = 'Code' | 'You'

export interface NextItem {
  text: string
  who: Who
  source: Source
}

/** A condition's owner as who does it: the PM is "You", anyone else is Code. */
export function whoOf(owner: string | null | undefined): Who {
  return owner && /\b(?:the PM|Don|PM)\b/i.test(owner) ? 'You' : 'Code'
}

export async function nextItems(db: ClientBase): Promise<NextItem[]> {
  const items: NextItem[] = []
  const live = await readLive(db)

  // 1. Anything broken.
  for (const r of live.filter((x) => x.kind === 'broken')) {
    items.push({ text: `Fix: ${plain(r.words)}.`, who: 'Code', source: r.source })
  }

  // 2. What unblocks others: the unmet conditions most planned work waits on,
  //    then what is waiting on the PM.
  const plan = await roadmap(db)
  const waits = new Map<string, number>()
  for (const r of plan) {
    if (r.horizon === 'later') continue
    for (const c of r.waits_on) waits.set(c, (waits.get(c) ?? 0) + (r.horizon === 'now' ? 2 : 1))
  }
  if (waits.size) {
    const { rows: conds } = await db.query<{ id: string; answer: string; owner: string | null }>(
      'select id, answer, owner from knowledge.records where id = any($1)',
      [[...waits.keys()]],
    )
    const unblocked = (id: string) => plan.filter((r) => r.horizon !== 'later' && r.waits_on.includes(id))
    for (const c of conds.sort((a, b) => (waits.get(b.id) ?? 0) - (waits.get(a.id) ?? 0) || a.id.localeCompare(b.id))) {
      const held = unblocked(c.id)
      const what = some(held.map((r) => plain(r.feature_answer ?? r.answer)), 1)
      items.push({ text: `${dot(cap1(plain(c.answer))).replace(/\.$/, '')}; it unblocks ${what}.`, who: whoOf(c.owner), source: 'store' })
    }
  }
  for (const r of live.filter((x) => x.kind === 'waiting')) {
    items.push({ text: dot(cap1(plain(r.words))), who: 'You', source: r.source })
  }

  // 3. The top of Now: planned or building, waiting on nothing, by rank.
  for (const r of plan.filter((x) => x.horizon === 'now' && x.waits_on.length === 0)) {
    const name = plain(r.answer)
    const feature = r.feature_answer ? plain(r.feature_answer) : null
    items.push({
      text: `${r.status === 'building' ? 'Finish' : 'Build'}: ${name}${feature && feature !== name ? ` (${feature})` : ''}.`,
      who: 'Code',
      source: 'store',
    })
  }

  // The same thing twice (a broken site filed twice) is one item.
  const seen = new Set<string>()
  return items.filter((i) => (seen.has(i.text) ? false : (seen.add(i.text), true))).slice(0, MAX_NEXT)
}

export function renderNext(items: NextItem[]): string {
  return items.map((i, n) => `${n + 1}. ${i.text} ${i.who}. (${SOURCE_WORDS[i.source]})`).join('\n')
}

// ---------------------------------------------------------------------------
// The three answers, as text: the tool's and the page's.

export async function builtText(db: ClientBase): Promise<string> {
  const lines = await builtLines(db)
  return lines.length ? render(lines, MAX_LINES, 'more things built: ask can_do') : '- Nothing live recorded yet (store)'
}

export async function whereText(db: ClientBase): Promise<string> {
  return render(await whereLines(db))
}

export async function nextText(db: ClientBase): Promise<string> {
  const items = await nextItems(db)
  return items.length ? renderNext(items) : '- Nothing broken, waiting or planned for Now (store)'
}

export const HEADINGS = { built: 'What we built', where: 'Where we are', next: "What's next" } as const

/** The phone page: the three answers, word for word as the tool gives them. */
export function renderPage(a: { built: string; where: string; next: string }, on: Date): string {
  return [
    "# What we built, where we are, what's next",
    '',
    `Generated ${on.toISOString().slice(0, 16).replace('T', ' ')} UTC from the knowledge store and GitHub. Never edited by hand.`,
    '',
    `## ${HEADINGS.built}`,
    '',
    a.built,
    '',
    `## ${HEADINGS.where}`,
    '',
    a.where,
    '',
    `## ${HEADINGS.next}`,
    '',
    a.next,
    '',
  ].join('\n')
}

/**
 * The page without what moves on every merge (when it was generated, when GitHub
 * was read, how many changes are open), for telling whether anything changed:
 * so a merge to main sends no page unless a line that matters changed.
 */
export const pageBody = (page: string) =>
  page.replace(/^Generated .*$/m, '').replace(/^- GitHub read .*$/m, '').replace(/\d+ changes? open/g, 'changes open')

const define = <S extends import('zod').ZodRawShape>(t: KnowledgeTool<S>) => t as unknown as KnowledgeTool

export const ANSWER_TOOLS: KnowledgeTool[] = [
  define({
    name: 'built',
    description:
      'What we built, and the point of each part: one line per live area, in plain words, 10 lines or fewer. ' +
      'Each line is a built concept and the first sentence of its why, or a thing a member can do today. Ask this first when starting work.',
    input: {},
    run: async (db) => ({ text: await builtText(db) }),
  }),
  define({
    name: 'where',
    description:
      'Where we are, in 10 lines or fewer: live, broken, slow, in flight, launch blockers, waiting on the PM, open bugs. ' +
      'Broken, slow, blockers and waiting come from GitHub and Vercel, read into the store by a job; the rest from the store. Each line names its source.',
    input: {},
    run: async (db) => ({ text: await whereText(db) }),
  }),
  define({
    name: 'next',
    description:
      "What's next: at most five things, in order, each marked Code or You. Anything broken comes first, then what unblocks " +
      'other work (unmet conditions, items waiting on the PM), then the top of Now. Each line names its source.',
    input: {},
    run: async (db) => ({ text: await nextText(db) }),
  }),
]
