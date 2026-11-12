// F132 (#1256): the lookup tool's verbs for story maps: a journey or any item
// in its bigger picture, where a new idea would fit, placing a feature or an
// idea, and proposing a change that is answered with the picture around it.
//
// Kept in its own file so the verb list in tools.ts grows by one line. Each
// verb reads through the store's own functions (map_of, map_place, fit,
// fit_rules, map_propose, place) on a connection already holding the caller's
// key, so row-level security decides what comes back.
//
// Answers fit a phone screen (F132.8): twelve lines at most, plain words, no
// ticket numbers. An item's own id is given once, in brackets, so a caller can
// ask the next question.

import { z } from 'zod'
import type { ClientBase } from 'pg'
import type { KnowledgeTool, ToolResult } from './tools'

const define = <S extends z.ZodRawShape>(t: KnowledgeTool<S>) => t as unknown as KnowledgeTool

/** At most this many lines in an answer: one phone screen. */
export const PHONE_LINES = 12
/** At most this many characters on a line before it is cut. */
export const PHONE_WIDTH = 220

/** Scenario, ticket, concept and issue numbers out of words meant for a person. */
export function plain(s: string): string {
  return s
    .replace(/\s*[[(]?\b(?:F\d{2,4}(?:\.\d+[a-z]?)?|T\d{3,4}|CO-\d{4}|VN-\d{4})\b[\])]?/g, '')
    .replace(/\s*\(?#\d+\)?/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .trim()
}

/** One phone screen: plain words, short lines, twelve at most. */
export function phone(lines: (string | null | undefined | false)[]): string {
  const kept = lines.filter((l): l is string => !!l).map((l) => {
    const p = plain(l)
    return p.length > PHONE_WIDTH ? `${p.slice(0, PHONE_WIDTH - 1)}…` : p
  })
  if (kept.length <= PHONE_LINES) return kept.join('\n')
  return [...kept.slice(0, PHONE_LINES - 1), `…and ${kept.length - PHONE_LINES + 1} more lines; ask about one item.`].join('\n')
}

type Built = 'built' | 'partly' | 'not' | null
const builtWords = (b: Built) => (b === 'built' ? 'built' : b === 'partly' ? 'part built' : 'not built')
const q = (s: string) => `"${s}"`

interface Line { id: string; kind: string; answer: string; status: string; built: Built }
interface Placed { id: string; answer: string; status: string; on: string; basis?: string }
interface SliceView { id: string; outcome: string; status: string; horizon: string; rank: number; takes_it?: boolean; takes?: string[] }
interface PlaceView {
  item: Line & { why: string | null }
  place: Partial<Record<'journey' | 'activity' | 'task' | 'detail', { id: string; answer: string }>>
  before: Line | null
  after: Line | null
  made_of: Line[]
  slices: SliceView[]
  features: Placed[]
  ideas: Placed[]
}
interface MapView {
  journey: Line & { why: string | null }
  activities: (Line & { tasks: (Line & { details: Line[] })[] })[]
  slices: SliceView[]
}

const list = (xs: string[], none = 'none') => (xs.length ? xs.join('; ') : none)
/** The first few of a list, and how many more. */
const few = (xs: string[], n: number) => (xs.length > n ? [...xs.slice(0, n), `${xs.length - n} more`] : xs)
const RANK: Record<string, number> = { shipped: 0, building: 1, approved: 2, draft: 3, dropped: 4 }
const byBuilt = (a: Placed, b: Placed) => (RANK[a.status] ?? 5) - (RANK[b.status] ?? 5) || a.id.localeCompare(b.id)
const featureWords = (f: Placed) => `${f.answer} (${f.status === 'shipped' ? 'built' : f.status === 'building' ? 'part built' : f.status === 'dropped' ? 'retired' : 'not built'})`

/** An item by id, or a journey, activity, task or detail by its words. */
async function findItem(db: ClientBase, s: string): Promise<{ id: string; kind: string }[]> {
  const { rows } = await db.query<{ id: string; kind: string }>(
    `select id, kind from knowledge.records
      where kind in ('journey', 'activity', 'task', 'detail') and status <> 'retired'
        and (id = $1 or lower(answer) = lower(btrim($1)) or lower(answer) like '%' || lower(btrim($1)) || '%')
      order by (id = $1) desc, (lower(answer) = lower(btrim($1))) desc,
               array_position(array['journey', 'activity', 'task', 'detail'], kind), id
      limit 5`,
    [s],
  )
  return rows
}

async function placeView(db: ClientBase, id: string): Promise<PlaceView | null> {
  const { rows } = await db.query<{ p: PlaceView | null }>('select knowledge.map_place($1) as p', [id])
  return rows[0]?.p ?? null
}

function placeLines(p: PlaceView): string[] {
  const path = (['journey', 'activity', 'task'] as const)
    .filter((k) => p.place[k] && p.place[k]!.id !== p.item.id)
    .map((k) => (k === 'journey' ? q(p.place[k]!.answer) : p.place[k]!.answer))
  return [
    `${p.item.answer} [${p.item.id}]: a ${p.item.kind}, ${builtWords(p.item.built)}${p.item.status === 'live' ? '' : `, ${p.item.status}`}.`,
    path.length ? `In: ${path.join(' › ')}` : null,
    p.before || p.after
      ? `Around it: ${[p.before ? `before, ${p.before.answer} (${builtWords(p.before.built)})` : null, p.after ? `after, ${p.after.answer} (${builtWords(p.after.built)})` : null].filter(Boolean).join('; ')}`
      : null,
    p.made_of.length ? `Made of: ${p.made_of.map((c) => `${c.answer} (${builtWords(c.built)})`).join('; ')}` : null,
    p.slices.length
      ? `Slices: ${p.slices.map((s) => `${q(s.outcome)}, ${s.horizon}, ${s.status}${s.takes_it === false ? ', takes part of it' : ''}`).join('; ')}`
      : 'Slices: none cross it yet',
    p.features.length ? `Features: ${few([...p.features].sort(byBuilt).map(featureWords), 3).join('; ')}` : 'Features: none placed here yet',
    p.ideas.length ? `Ideas waiting here: ${few(p.ideas.map((i) => i.answer), 3).join('; ')}` : null,
  ].filter((l): l is string => !!l)
}

export async function mapText(db: ClientBase, journeyId: string): Promise<string | null> {
  const { rows } = await db.query<{ m: MapView | null }>('select knowledge.map_of($1) as m', [journeyId])
  const m = rows[0]?.m
  if (!m) return null
  return phone([
    `${q(m.journey.answer)} [${m.journey.id}]: ${builtWords(m.journey.built)}.`,
    ...m.activities.map(
      (a) => `${a.answer}: ${list(a.tasks.map((t) => `${t.answer} (${builtWords(t.built)}${t.details.length ? `, ${t.details.length} details` : ''})`))}`,
    ),
    m.slices.length ? `Slices: ${m.slices.map((s) => `${q(s.outcome)}, ${s.horizon}, ${s.status}`).join('; ')}` : 'Slices: none drawn yet',
  ])
}

export async function itemText(db: ClientBase, id: string): Promise<string | null> {
  const p = await placeView(db, id)
  return p ? phone(placeLines(p)) : null
}

interface Placement { item_id: string; on_id: string | null; stands_on: string[]; needs_first: string[]; clashes: string[]; basis: string }

async function wordsOf(db: ClientBase, ids: string[]): Promise<string[]> {
  if (!ids.length) return []
  const { rows } = await db.query<{ id: string; answer: string; status: string; kind: string }>(
    'select id, answer, status, kind from knowledge.records where id = any($1::text[])',
    [ids],
  )
  const byId = new Map(rows.map((r) => [r.id, r]))
  // An id this key cannot read is left out, never shown bare; words stay.
  const looksLikeId = (i: string) => /^[A-Z]{1,3}-?[A-Za-z0-9]*\d[\w.-]*$/.test(i) && !/\s/.test(i)
  return ids.flatMap((i) => {
    const r = byId.get(i)
    if (!r) return looksLikeId(i) ? [] : [i]
    return [r.kind === 'feature' ? featureWords({ id: r.id, answer: r.answer, status: r.status, on: '' }) : r.answer]
  })
}

/**
 * Where an idea fits. A known idea (by id or any name it had) answers with
 * where it was placed; anything else is matched by its words against every
 * task and detail on the maps.
 */
export async function fitText(db: ClientBase, idea: string): Promise<string> {
  const { rows: known } = await db.query<{ id: string; answer: string }>(
    `select r.id, r.answer from knowledge.records r
      where r.kind = 'concept'
        and (r.id in (select f.id from knowledge.find_concept($1) f)
             or (length(btrim($1)) >= 5 and lower(r.answer) like '%' || lower(btrim($1)) || '%'))
        and exists (select 1 from knowledge.placements p where p.item_id = r.id)
      order by (r.id in (select f.id from knowledge.find_concept($1) f)) desc, r.id limit 1`,
    [idea],
  )
  let placement: Placement | null = null
  let named = idea
  if (known[0]) {
    named = known[0].answer
    const { rows } = await db.query<Placement>('select * from knowledge.current_placements where item_id = $1', [known[0].id])
    placement = rows[0] ?? null
  }
  let on: string | null = placement ? placement.on_id : null
  if (!placement) {
    const { rows } = await db.query<{ on_id: string }>('select on_id from knowledge.fit($1, 1)', [idea])
    on = rows[0]?.on_id ?? null
  }
  const { rows: rules } = await db.query<{ answer: string; strength: string }>(
    'select answer, strength from knowledge.fit_rules($1, 2)',
    [idea],
  )
  const ruleWords = rules.map((r) => r.answer)
  // A clash is judged by whoever places the idea; until then the answer names
  // the live rules it may clash with, and says it is not judged yet.
  const clashLine = (judged: string[] | null) =>
    judged
      ? `Clashes with: ${list(judged, 'nothing, as judged when it was placed')}`
      : `Clashes with: not judged yet; ${ruleWords.length ? `may clash with: ${ruleWords.join('; ')}` : 'no live rule shares its words'}`

  if (!on) {
    return phone([
      `${q(named)}: no journey yet${placement ? ', as placed by hand' : ': nothing on the maps shares its words'}.`,
      placement && placement.needs_first.length ? `Must be built first: ${list(await wordsOf(db, placement.needs_first))}` : null,
      clashLine(placement ? await wordsOf(db, placement.clashes) : null),
      'A new journey would hold it; propose one with propose_map_change or place it with place_on_map.',
    ])
  }
  const p = await placeView(db, on)
  if (!p) return phone([`${q(named)}: no journey yet.`])
  const task = p.place.task ?? { id: on, answer: p.item.answer }
  const taskView = p.item.kind === 'task' ? p : await placeView(db, task.id)
  const builtHere = (taskView?.made_of ?? []).filter((d) => d.built !== 'not').map((d) => d.answer)
  const featuresHere = (taskView?.features ?? []).filter((f) => f.status === 'shipped' || f.status === 'building').map(featureWords)
  const notBuilt = (taskView?.made_of ?? []).filter((d) => d.built === 'not').map((d) => d.answer)
  const standsOn = placement?.stands_on.length ? await wordsOf(db, placement.stands_on) : [...featuresHere, ...builtHere]
  const needs = placement?.needs_first.length ? await wordsOf(db, placement.needs_first) : []
  return phone([
    `${q(named)} fits under ${q(p.place.activity?.answer ?? '')} in the journey ${q(p.place.journey?.answer ?? '')}, ` +
      `next to ${q(p.item.kind === 'detail' ? p.item.answer : task.answer)}.`,
    `Stands on: ${list(standsOn, 'nothing built there yet')}`,
    `Must be built first: ${list(needs, notBuilt.length ? `nothing named; not built there yet: ${notBuilt.slice(0, 3).join('; ')}` : 'nothing named')}`,
    clashLine(placement ? await wordsOf(db, placement.clashes) : null),
    (taskView?.slices ?? []).length ? `Slices across it: ${taskView!.slices.map((s) => q(s.outcome)).join('; ')}` : null,
    placement ? null : 'A guess from its words: place it with place_on_map to keep it.',
  ])
}

export const MAP_TOOLS: KnowledgeTool[] = [
  define({
    name: 'story_map',
    description:
      'The bigger picture, on one phone screen. With a journey: its activities left to right, the tasks under each with whether each is ' +
      'built, and the slices across it. With any other item (id or words): where it sits (journey, activity, task), what is before and ' +
      'after it, what it is made of, the slices that cross it, and the features and ideas placed on it. With nothing: every journey.',
    input: { item: z.string().optional().describe('A map item id, such as JY-WEEKEND or JY-WEEKEND.A1.T1, or its words.') },
    run: async (db, { item }): Promise<ToolResult> => {
      if (!item) {
        const { rows } = await db.query<{ id: string; answer: string; built: Built }>(
          `select id, answer, knowledge.built(id) as built from knowledge.records
            where kind = 'journey' and status <> 'retired' order by (id like 'JY-J%'), id`,
        )
        if (!rows.length) return { text: 'No journey on the maps that this key can read.' }
        return { text: phone([`Journeys (${rows.length}):`, ...rows.map((r) => `${q(r.answer)} [${r.id}], ${builtWords(r.built)}`)]) }
      }
      const found = await findItem(db, item)
      if (!found.length) return { text: `No journey, activity, task or detail "${item}" that this key can read.`, isError: true }
      const it = found[0]
      const text = it.kind === 'journey' ? await mapText(db, it.id) : await itemText(db, it.id)
      return { text: text ?? `No map item ${it.id}.` }
    },
  }),

  define({
    name: 'fits',
    description:
      'Where a new idea fits, in plain words: the journey, activity and task it would sit under (or "no journey yet"), what built ' +
      'things it stands on, what must be built first, and what it clashes with. An idea already placed answers with its placement.',
    input: { idea: z.string().min(1).describe('The idea in plain words, such as "holiday specials", or a concept id.') },
    run: async (db, { idea }) => ({ text: await fitText(db, idea) }),
  }),

  define({
    name: 'place_on_map',
    description:
      'Place a feature or an idea on the task or detail it serves, or nowhere yet (leave out `on`: "no journey yet"), with what it ' +
      'stands on, what must be built first and what it clashes with. Any key. A stated place is not replaced by a guess.',
    input: {
      item: z.string().describe('A feature (F###) or concept (CO-####) id.'),
      on: z.string().optional().describe('A task or detail id; leave out for "no journey yet".'),
      reason: z.string().min(1),
      stands_on: z.array(z.string()).optional().describe('Built features or map items it stands on.'),
      needs_first: z.array(z.string()).optional().describe('What must be built first, as ids or words.'),
      clashes: z.array(z.string()).optional().describe('Philosophies or decisions it clashes with, as ids.'),
    },
    run: async (db, a) => {
      const { rows } = await db.query<{ r: { on: string | null; unchanged?: boolean; kept?: string } }>(
        'select knowledge.place($1, $2, $3, $4::text[], $5::text[], $6::text[]) as r',
        [a.item, a.on ?? null, a.reason, a.stands_on ?? [], a.needs_first ?? [], a.clashes ?? []],
      )
      const r = rows[0].r
      if (r.kept) return { text: `Kept where it was: ${r.kept}.` }
      if (r.unchanged) return { text: 'Already placed there.' }
      return { text: `Placed ${r.on ? `on ${r.on}` : 'as no journey yet'}.\n${await fitText(db, a.item)}` }
    },
  }),

  define({
    name: 'propose_map_change',
    description:
      'Propose a change to a journey, activity, task or detail: new words, a move (parent, place) or a status. Answers with the ' +
      'picture before it is decided: the journey around it, the slices and features it touches, and what is built, and where a move ' +
      'would take it. The PM decides it with decide_map_change.',
    input: {
      id: z.string().describe('The map item to change.'),
      changes: z
        .object({
          answer: z.string().optional(),
          why: z.string().optional(),
          parent: z.string().optional(),
          place: z.number().int().positive().optional(),
          status: z.enum(['proposed', 'live', 'retired']).optional(),
        })
        .describe('The fields to change.'),
      reason: z.string().min(1),
    },
    run: async (db, { id, changes, reason }) => {
      const { rows } = await db.query<{ r: { proposal: number; picture: PlaceView; moving_to: PlaceView | null } }>(
        'select knowledge.map_propose($1, $2::jsonb, $3) as r',
        [id, JSON.stringify(changes), reason],
      )
      const r = rows[0].r
      const what = Object.entries(changes).map(([k, v]) => `${k} to ${q(String(v))}`).join(', ')
      return {
        text: phone([
          `Proposal ${r.proposal}: ${what}. Not decided yet.`,
          ...placeLines(r.picture),
          r.moving_to ? `Would move to: ${r.moving_to.item.answer} (${builtWords(r.moving_to.item.built)}), in ${q(r.moving_to.place.journey?.answer ?? '')}` : null,
        ]),
      }
    },
  }),

  define({
    name: 'decide_map_change',
    description: "Internal, the PM's key only. Accept or decline a proposed change to a map item, with a reason.",
    input: { proposal: z.number().int().positive(), accept: z.boolean(), reason: z.string().min(1) },
    run: async (db, { proposal, accept, reason }) => {
      const { rows } = await db.query<{ r: { id: string; version: number | null } }>(
        'select knowledge.map_decide($1, $2, $3) as r',
        [proposal, accept, reason],
      )
      const r = rows[0].r
      return { text: accept ? `Accepted: ${r.id} is now version ${r.version}.` : `Declined; ${r.id} is unchanged.` }
    },
  }),
]
