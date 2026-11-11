// F125 / T1018 (#1219) — the lookup tool's verbs, as one list.
//
// The route (src/app/api/knowledge/[transport]/route.ts) registers every entry
// here; a later verb is one more entry (the conditions' unlocks and waits_on,
// #1223, come here). Each entry is a name, words for whoever calls it, an
// input shape, and a run that takes a connection already holding the caller's
// key. Answers are plain text, kept short: the caller reads them into its own
// context, so every token here is one it pays for. `live` is held to under
// 2,000 tokens for moderation (F125.9).
//
// Words in these descriptions say what each verb returns. They name no model
// and no agent: any caller holding a key reads the same thing (F125.6).

import { z, type ZodRawShape } from 'zod'
import type { ClientBase } from 'pg'
import * as k from './lookups'
import { PLAN_TOOLS } from './plans' // F127
import { renderPack, REVIEW_METHOD_ID } from './pack'
import { MAP_TOOLS } from './maps' // F132

export interface ToolResult {
  text: string
  isError?: boolean
}

export interface KnowledgeTool<S extends ZodRawShape = ZodRawShape> {
  name: string
  description: string
  input: S
  run: (db: ClientBase, args: z.infer<z.ZodObject<S>>) => Promise<ToolResult>
}

const define = <S extends ZodRawShape>(t: KnowledgeTool<S>) => t as unknown as KnowledgeTool

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'A date as YYYY-MM-DD.')
  .describe('A date, YYYY-MM-DD; read as the end of that day.')

const notFound = (id: string): ToolResult => ({
  text: `No record ${id} that this key can read.`,
  isError: true,
})

const json = (v: unknown): ToolResult => ({ text: JSON.stringify(v) })

/** One line per record: id, how strict, how long it holds, when, the words, what it applies. */
function line(r: k.RecordRow & { applies?: { id: string; basis: string }[] }): string {
  const meta = [
    r.kind === 'decision' ? null : r.kind,
    // A guideline is the default; only a stricter strength is spelled out.
    r.strength === 'guideline' ? null : r.strength,
    r.holds === 'for now' ? `for now${r.until ? ` (until ${r.until})` : ''}` : r.holds,
    r.settled ? 'settled' : null,
    r.status === 'live' ? null : r.status,
    r.decided_on,
  ].filter(Boolean)
  const applies = r.applies?.length
    ? ` [applies ${r.applies.map((a) => (a.basis === 'inferred' ? `${a.id}~` : a.id)).join(', ')}]`
    : ''
  return `- ${r.id} · ${meta.join(' · ')}: ${r.answer}${applies}`
}

async function concernList(db: ClientBase): Promise<string> {
  const all = await k.concerns(db)
  const byDept = new Map<string, string[]>()
  for (const c of all) byDept.set(c.department, [...(byDept.get(c.department) ?? []), c.slug])
  return [...byDept].map(([d, cs]) => `${d}: ${cs.join(', ')}`).join('\n')
}

export const TOOLS: KnowledgeTool[] = [
  define({
    name: 'live',
    description:
      'Every live decision and principle for one concern, strictest first, one line each: id, strength (absolute or rule; unmarked is a guideline), ' +
      'whether it holds always or for now, its date, its words, and the principles it applies (~ marks a link inferred at import). ' +
      'Start here before building in a concern; ask why(id) for the reason behind one.',
    input: { concern: z.string().describe('A concern slug, such as moderation-and-reports or explore-and-map.') },
    run: async (db, { concern }) => {
      const out = await k.live(db, concern)
      if (!out) return { text: `No concern "${concern}". The concerns, by department:\n${await concernList(db)}`, isError: true }
      if (out.records.length === 0) return { text: `Nothing live for ${concern} that this key can read.` }
      const follows = out.follows.length
        ? `Follows: ${out.follows.map((f) => `${f.id} ${f.answer} (${f.here})`).join(' · ')}\n`
        : ''
      return {
        text:
          `Live for ${out.concern.slug} (${out.concern.department}): ${out.records.length}, strictest first; ` +
          `unmarked ones are guidelines, departed from only with a reason.\n` +
          follows +
          out.records.map(line).join('\n'),
      }
    },
  }),

  define({
    name: 'search',
    description:
      'Find records by their words or id, live ones first. Narrow by concern, kind (decision, philosophy, pattern, correction, ' +
      'noun, verb, link) or status. Each hit lists the links it makes. A search that finds nothing is kept as an unanswered question.',
    input: {
      question: z.string().min(1).describe('The question or words to look for.'),
      concern: z.string().optional(),
      kind: z.string().optional(),
      status: z.string().optional().describe('live, proposed, retired, …'),
      limit: z.number().int().min(1).max(25).optional(),
    },
    run: async (db, args) => {
      const hits = await k.search(db, args)
      if (hits.length === 0) return { text: 'Nothing found. The question is kept as unanswered, so the gap can be filled.' }
      return {
        text: hits
          .map((h) => {
            const links = h.links.length ? ` {${h.links.map((l) => `${l.type} ${l.to}${l.basis === 'inferred' ? '~' : ''}`).join(', ')}}` : ''
            return `${line(h)}${h.concern ? ` (${h.concern})` : ''}${links}`
          })
          .join('\n'),
      }
    },
  }),

  define({
    name: 'get',
    description: 'One record in full: every field, its links both ways, its references out to issues and pull requests, and a list of its versions.',
    input: { id: z.string().describe('A record id, such as D-0073 or PH-0004.') },
    run: async (db, { id }) => {
      const out = await k.get(db, id)
      return out ? json(out) : notFound(id)
    },
  }),

  define({
    name: 'related',
    description:
      'What a record is linked to, either way (replaces, implements, governs, depends_on, guards, relates, applies, departs_from, ' +
      'corrects, explains), followed as many hops as asked, one by default.',
    input: {
      id: z.string(),
      hops: z.number().int().min(1).max(5).optional(),
      types: z.array(z.string()).optional().describe('Only these link types.'),
    },
    run: async (db, { id, hops, types }) => {
      const out = await k.related(db, id, hops ?? 1, types)
      if (!out) return notFound(id)
      if (out.edges.length === 0) return { text: `${id} has no links this key can read.` }
      return {
        text:
          out.edges.map((e) => `${e.from} ${e.type} ${e.to}${e.basis === 'inferred' ? ' (inferred)' : ''}`).join('\n') +
          '\n\n' +
          out.records.map((r) => `${r.id} · ${r.kind} · ${r.status}: ${r.answer}`).join('\n'),
      }
    },
  }),

  define({
    name: 'history',
    description:
      'Every version a record has had, in full, with when each became true and stopped, who changed it, through which agent, why and on ' +
      'what evidence; and the chain of decisions it replaced (older) and was replaced by (newer).',
    input: { id: z.string() },
    run: async (db, { id }) => {
      const out = await k.history(db, id)
      return out ? json(out) : notFound(id)
    },
  }),

  define({
    name: 'as_of',
    description:
      'What was true on a past date: give a concern for everything live in it that day, each as it read then; or an id for that one record ' +
      "as it read then (the platform's why is the id platform-why).",
    input: { date, concern: z.string().optional(), id: z.string().optional() },
    run: async (db, { date: at, concern, id }) => {
      if (id) {
        const r = await k.asOfRecord(db, id, at)
        return r ? json(r) : { text: `${id} did not exist on ${at}, or this key cannot read it.`, isError: true }
      }
      if (!concern) return { text: 'Give a concern or an id.', isError: true }
      const rows = await k.asOfConcern(db, concern, at)
      if (rows.length === 0) return { text: `Nothing was live for ${concern} on ${at} that this key can read.` }
      return {
        text:
          `Live for ${concern} on ${at}: ${rows.length}.\n` +
          rows.map((r) => `- ${r.id} v${r.version} · ${r.kind === 'decision' ? '' : `${r.kind} · `}${r.strength}: ${r.answer}`).join('\n'),
      }
    },
  }),

  define({
    name: 'precedents',
    description:
      'Case law. Give a pattern or philosophy id for every live decision that applies it and every one that departs from it, with the ' +
      'reason; links guessed at import are marked inferred. Or give a question for the closest live decisions, grouped by the principles ' +
      'they apply, with how many live decisions apply each and how many depart.',
    input: {
      pattern: z.string().optional().describe('A philosophy or pattern id, such as PH-0004.'),
      question: z.string().optional(),
      concern: z.string().optional(),
    },
    run: async (db, { pattern, question, concern }) => {
      if (pattern) {
        const p = await k.precedentsOf(db, pattern)
        if (!p) return notFound(pattern)
        const inferred = p.applies.filter((a) => a.basis === 'inferred').length
        return {
          text:
            `${p.pattern.id} · ${p.pattern.kind} · ${p.pattern.status}: ${p.pattern.answer}\n` +
            `Applies (${p.applies.length}, ${inferred} inferred):\n` +
            (p.applies.map((a) => `- ${a.id}${a.basis === 'inferred' ? ' (inferred)' : ''}: ${a.answer}`).join('\n') || '- none') +
            `\nDeparts from (${p.departs.length}):\n` +
            (p.departs.map((d) => `- ${d.id}: ${d.answer} — because ${d.reason ?? 'no reason given'}`).join('\n') || '- none'),
        }
      }
      if (!question) return { text: 'Give a pattern id or a question.', isError: true }
      const q = await k.precedentsFor(db, question, concern)
      if (q.groups.length === 0 && q.unprincipled.length === 0) {
        return { text: 'No live decision is close to that. The question is kept as unanswered.' }
      }
      const groups = q.groups.map(
        (g) =>
          `${g.principle.id} (${g.principle.kind}, ${g.applying} live apply, ${g.departing} depart): ${g.principle.answer}\n` +
          g.near.map((n) => `- ${n.id}${n.link === 'departs_from' ? ' DEPARTS' : ''}: ${n.answer}`).join('\n'),
      )
      const loose = q.unprincipled.length
        ? `These rest on no principle yet:\n${q.unprincipled.map((u) => `- ${u.id}: ${u.answer}`).join('\n')}`
        : ''
      return { text: [...groups, loose].filter(Boolean).join('\n\n') }
    },
  }),

  define({
    name: 'why',
    description:
      "Why a record holds: its current why, the principles it rests on up to the platform's own why, and every earlier wording of " +
      'its why with when it changed, who changed it and on what evidence.',
    input: { id: z.string() },
    run: async (db, { id }) => {
      const w = await k.why(db, id)
      if (!w) return notFound(id)
      const parts = [`${w.record.id} · ${w.record.kind} · ${w.record.status}: ${w.record.answer}`, `Why: ${w.record.why ?? '(none recorded)'}`]
      if (w.chain.length) {
        parts.push(
          'Rests on:\n' + w.chain.map((c) => `${'  '.repeat(c.depth - 1)}- ${c.id} (${c.kind}): ${c.answer}${c.why ? ` Why: ${c.why}` : ''}`).join('\n'),
        )
      } else {
        parts.push('Rests on: no principle linked yet.')
      }
      parts.push(w.platform ? `The platform's why: ${w.platform.why ?? w.platform.answer}` : "The platform's why: not recorded, or not readable with this key.")
      if (w.current) {
        const c = w.current
        parts.push(
          `This wording since v${c.version}, ${new Date(c.valid_from).toISOString().slice(0, 10)}, ${c.person} through ${c.agent} (${c.reason}` +
            `${c.evidence ? `; evidence ${JSON.stringify(c.evidence)}` : ''}).`,
        )
      }
      if (w.earlier.length) {
        parts.push(
          'Earlier wordings:\n' +
            w.earlier
              .map(
                (e) =>
                  `- v${e.version}, from ${new Date(e.valid_from).toISOString().slice(0, 10)}, ${e.person} through ${e.agent} (${e.reason}` +
                  `${e.evidence ? `; evidence ${JSON.stringify(e.evidence)}` : ''}): ${e.why ?? '(none)'}`,
              )
              .join('\n'),
        )
      }
      return { text: parts.join('\n') }
    },
  }),

  define({
    name: 'concept',
    description:
      'How a concept changed and why, in one call. Give a concept id (CO-0001) or any name it ever had, refused names included. ' +
      'Returns its current name and status, every name with its date and whether it was used or refused, every change by date ' +
      '(idea, scoped, ruling, renamed, split, merged, cut, deferred, built, reversed) with its evidence and the PM\'s own words, ' +
      'and its lineage: what it split from, merged into or became, and the scenarios that scope it.',
    input: { concept: z.string().min(1).describe('A concept id, such as CO-0001, or a name it has had, such as Bulletins.') },
    run: async (db, { concept }) => {
      const found = await k.findConcept(db, concept)
      const ids = [...new Set(found.map((f) => f.id))]
      if (ids.length === 0) {
        await db.query('select knowledge.log_unanswered($1, null, $2)', [concept, 'concept'])
        return { text: `No concept called or numbered "${concept}" that this key can read. The question is kept as unanswered.`, isError: true }
      }
      if (ids.length > 1) {
        return { text: `"${concept}" names more than one concept: ${found.map((f) => `${f.id} (${f.state} "${f.matched}")`).join(', ')}. Ask by id.` }
      }
      const t = await k.conceptTimeline(db, ids[0])
      if (!t) return notFound(ids[0])
      const ev = (e: { kind: string; ref: string }[]) => e.map((x) => `${x.kind.replace('_', ' ')} ${x.ref}`).join(', ')
      const lines = [
        `${t.concept.id} · ${t.concept.status}: ${t.concept.name}${t.concept.concern ? ` (${t.concept.concern})` : ''}`,
        t.concept.why ? `Why: ${t.concept.why}` : null,
        'Names:',
        ...t.names.map((n) => `- ${n.on} ${n.state === 'refused' ? 'REFUSED ' : ''}"${n.name}"${n.ruling ? ` [ruling ${n.ruling}]` : ''} (${ev(n.evidence)})${n.note ? ` ${n.note}` : ''}`),
        'Changes:',
        ...(t.events.length
          ? t.events.map((e) => `- ${e.on} ${e.type}: ${e.what} (${ev(e.evidence)})${e.pm_words ? ` The PM: "${e.pm_words}"` : ''}${e.ruling ? ` [ruling ${e.ruling}]` : ''}`)
          : ['- none recorded']),
        'Lineage:',
        ...(t.lineage.length
          ? t.lineage.map((l) => `- ${l.from} ${l.type} ${l.to}: ${l.other} (${l.other_kind}, ${l.other_status})`)
          : ['- none']),
      ].filter((x): x is string => x !== null)
      return { text: lines.join('\n') }
    },
  }),

  ...PLAN_TOOLS, // F127: plan, plan_changes, roadmap
  ...MAP_TOOLS, // F132: story_map, fits, place_on_map, propose_map_change, decide_map_change

  define({
    name: 'how',
    description:
      'How something in our way of working runs, from the live practices: give a question ("how does our DevOps work") or an area ' +
      '(deciding, planning, building, reviewing, shipping, words, agents, docs). DevOps reads building, reviewing and shipping. ' +
      'One line per practice, strictest first: its id, strength, ring (adopt, trial, assess, hold), its words, the check that enforces it ' +
      'and the philosophies it applies. Ask why(id) for the reason behind one.',
    input: { question: z.string().min(1).describe('A question or an area, such as "how does our DevOps work" or "review".') },
    run: async (db, { question }) => {
      const out = await k.how(db, question)
      if (out.areas.length === 0) {
        await db.query('select knowledge.log_unanswered($1, null, $2)', [question, 'practice'])
        const areas = await k.howAreas(db)
        return {
          text:
            `"${question}" names no area of how we work. The areas, and words that reach them:\n` +
            areas.map((a) => `- ${a.slug.replace(/^how-/, '')} (${a.name}): ${a.words.join(', ')}`).join('\n'),
          isError: true,
        }
      }
      const parts: string[] = []
      if (out.lines.length === 0) {
        parts.push(`No live practice for ${out.areas.map((a) => a.name.toLowerCase()).join(', ')} that this key can read.`)
      }
      if (out.absolutes.length && out.lines.length) {
        parts.push(`Absolutes, which bind every area:\n${out.absolutes.map((x) => `- ${x.id}: ${x.answer}`).join('\n')}`)
      }
      for (const a of out.areas) {
        const lines = out.lines.filter((l) => l.concern === a.slug)
        if (!lines.length) continue
        parts.push(
          `${a.name}:\n` +
            lines
              .map((l) => {
                const meta = [l.strength, l.ring, l.holds === 'for now' ? 'for now' : null].filter(Boolean).join(', ')
                const applies = l.applies.length ? ` [applies ${l.applies.join(', ')}]` : ''
                return `- ${l.id} · ${meta}: ${l.answer} Enforced by: ${l.enforced_by ?? 'nothing yet'}.${applies}`
              })
              .join('\n'),
        )
      }
      // The review-a-method steps are a procedure, not a line: point at the verb that returns them.
      if (out.areas.some((a) => a.slug === 'how-agents')) {
        parts.push(`To review a new method against all of this: call review_method (${REVIEW_METHOD_ID}).`)
      }
      return { text: parts.join('\n\n') }
    },
  }),

  define({
    name: 'review_method',
    description:
      'Review a new tool, process or method against how we work, in one call and with no research: returns the review-a-method steps ' +
      'and the pack of every live practice by area (its why, strictness and ring). Read only the material you were given and this; ' +
      'list at most 15 claims, place each as we do this, we do the opposite on purpose, a gap, or a clash with a philosophy, citing ' +
      'the record id, and end with one experiment at most and how it would be measured.',
    input: {
      material: z
        .string()
        .optional()
        .describe('The link or a short label for the material under review; it is not fetched, only kept if the steps are missing.'),
    },
    run: async (db, { material }) => {
      const rows = await k.packRows(db)
      if (!rows.steps) {
        if (material) await db.query('select knowledge.log_unanswered($1, null, $2)', [`review a method: ${material}`, 'practice'])
        return { text: `The review-a-method steps (${REVIEW_METHOD_ID}) are not in the store yet, or this key cannot read them.`, isError: true }
      }
      const pack = renderPack(rows.practices, rows.philosophies, new Date().toISOString().slice(0, 10))
      return { text: `${rows.steps.trim()}\n\n---\n\n${pack.text}` }
    },
  }),

  define({
    name: 'upkeep',
    description:
      'For the monthly upkeep: live practices not confirmed in 90 days, and running experiments past their verdict date, one line each.',
    input: { today: date.optional() },
    run: async (db, { today }) => {
      const rows = await k.upkeep(db, today)
      if (rows.length === 0) return { text: 'Nothing due: every practice confirmed in the last 90 days, no experiment past its verdict date.' }
      return { text: rows.map((r) => `- ${r.id} (${r.kind}): ${r.problem}. ${r.answer}`).join('\n') }
    },
  }),

  define({
    name: 'propose',
    description:
      'Internal. Record a new decision, pattern, philosophy or correction, or propose a change to an existing record, with a reason. ' +
      'A philosophy, pattern, decision or correction needs a why. A well-worn decision may go live at once; a new-territory one, a ' +
      'philosophy or a pattern stays proposed until the PM decides. Name the principles it applies, or depart from one with a reason. ' +
      'A settled record cannot be changed; the attempt is refused and kept.',
    input: {
      record: z
        .record(z.unknown())
        .optional()
        .describe(
          'A new record: kind, concern, answer, why, path (well-worn or new territory), strength, holds, until, audience, departments, source, tags.',
        ),
      id: z.string().optional().describe('An existing record to change.'),
      changes: z.record(z.unknown()).optional().describe('The fields to change on that record.'),
      reason: z.string().min(1),
      evidence: z.record(z.unknown()).optional().describe('What prompted it: decisions, exceptions or signals.'),
      applies: z.array(z.string()).optional().describe('Philosophy or pattern ids it follows; empty for none.'),
      departs_from: z.array(z.object({ id: z.string(), reason: z.string().min(1) })).optional(),
    },
    run: async (db, args) => {
      const out = await k.propose(db, args)
      if (out.refused) return { text: `Refused: ${out.refused} (kept in the refusals log).`, isError: true }
      return { text: `${out.id} is ${out.status}, version ${out.version}${out.links ? `, ${out.links} link(s) recorded` : ''}.` }
    },
  }),

  define({
    name: 'decide',
    description: "Internal, the PM's key only. Make a proposed record live, with a reason.",
    input: { id: z.string(), reason: z.string().min(1) },
    run: async (db, { id, reason }) => {
      const out = await k.decide(db, id, reason)
      if (out.refused) return { text: `Refused: ${out.refused}`, isError: true }
      return { text: `${id} is live, version ${out.version}.` }
    },
  }),
]

/**
 * Run one verb on a connection holding the caller's key. Inside a savepoint,
 * so a refusal from the store becomes an answer in words and the caller's
 * transaction carries on (the unanswered log and refusals log are kept).
 */
export async function runTool(db: ClientBase, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const tool = TOOLS.find((t) => t.name === name)
  if (!tool) return { text: `No verb ${name}.`, isError: true }
  const parsed = z.object(tool.input).safeParse(args)
  if (!parsed.success) return { text: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'), isError: true }
  await db.query('savepoint knowledge_tool')
  try {
    const out = await tool.run(db, parsed.data)
    await db.query('release savepoint knowledge_tool')
    return out
  } catch (e) {
    await db.query('rollback to savepoint knowledge_tool')
    const message = e instanceof Error ? e.message : String(e)
    return { text: message, isError: true }
  }
}
