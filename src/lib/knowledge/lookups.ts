// F125 / T1018 (#1219) — the lookups behind the tool, one function per verb.
//
// Each runs on a connection that is already the store's own login holding
// one agent's key (src/actions/_lib/knowledge-db.ts), so row-level security decides what comes
// back: a record a key may not read is simply not there. Reads use the store's
// own functions where it has one (history_of, as_of, record_as_of,
// precedents_of); writes go only through its write functions (record, revise,
// link, decide, log_unanswered), which write the history rows and refuse what
// the store refuses. Nothing here runs a model: words in, rows out.
//
// Record text is data. A record's words are returned to the caller as words;
// nothing here acts on what they say.

import type { ClientBase } from 'pg'

export interface RecordRow {
  id: string
  kind: string
  concern: string | null
  answer: string
  why: string | null
  status: string
  strength: string
  holds: string | null
  until: string | null
  settled: boolean
  audience: string
  departments: string[]
  decided_on: string | null
  enforced_by: string | null
}

const SUMMARY_COLUMNS = `r.id, r.kind, r.concern, r.answer, r.why, r.status, r.strength, r.holds, r.until, r.settled,
  r.audience, r.departments, to_char(r.decided_on, 'YYYY-MM-DD') as decided_on, r.enforced_by`

/** Strictest first, then the widest kinds, then newest. */
const BUILDER_ORDER = `
  array_position(array['absolute','rule','guideline'], r.strength),
  array_position(array['philosophy','pattern','correction','decision'], r.kind) nulls last,
  r.decided_on desc nulls last, r.id`

// ---------------------------------------------------------------------------
// search

export interface SearchHit extends RecordRow {
  rank: number
  links: { type: string; to: string; basis: string }[]
}

export interface SearchArgs {
  question: string
  concern?: string
  kind?: string
  status?: string
  limit?: number
}

/**
 * Exact words and ids, ranked, live before anything else; each hit carries the
 * links it makes, so a caller can follow them without a second call. A record
 * need not hold every word of the question (a question rarely repeats a
 * record's wording), but it must hold at least half of them; more words and a
 * closer match rank higher. A search that finds nothing is logged as
 * unanswered, with the agent and person who asked.
 */
export async function search(db: ClientBase, a: SearchArgs): Promise<SearchHit[]> {
  const limit = Math.min(Math.max(a.limit ?? 10, 1), 25)
  const { rows } = await db.query<SearchHit>(
    `with q as (
       select nullif(replace(plainto_tsquery('english', $1)::text, '&', '|'), '')::tsquery as tsq,
              (select array_agg(distinct t.lexeme) from unnest(to_tsvector('english', $1)) t) as terms
     ), docs as (
       select r.*,
              setweight(to_tsvector('english', r.answer), 'A') ||
              setweight(to_tsvector('english', coalesce(r.why, '')), 'B') ||
              setweight(to_tsvector('english', replace(r.id || ' ' || array_to_string(r.tags, ' '), '-', ' ')), 'C') as vec
         from knowledge.records r
        where ($2::text is null or r.concern = $2)
          and ($3::text is null or r.kind = $3)
          and ($4::text is null or r.status = $4)
     ), scored as (
       select ${SUMMARY_COLUMNS},
              lower(r.id) = lower(btrim($1)) as exact,
              coalesce(ts_rank_cd(r.vec, q.tsq), 0) as rank,
              (select count(*) from unnest(q.terms) t where r.vec @@ to_tsquery('simple', quote_literal(t))) as matched,
              coalesce(cardinality(q.terms), 0) as total
         from docs r, q
     )
     select s.id, s.kind, s.concern, s.answer, s.why, s.status, s.strength, s.holds, s.until, s.settled, s.audience,
            s.departments, s.decided_on, s.enforced_by, case when s.exact then 100 else s.rank end as rank,
            coalesce((
              select jsonb_agg(jsonb_build_object('type', l.type, 'to', l.to_id, 'basis', l.basis) order by l.type, l.to_id)
                from knowledge.links l where l.from_id = s.id), '[]'::jsonb) as links
       from scored s
      -- A hit names the record, or shares at least half the question's words:
      -- one common word in a long question is not an answer, and the question
      -- is then kept as unanswered.
      where s.exact or (s.rank > 0 and s.matched * 2 >= s.total)
      order by s.exact desc, (s.status = 'live') desc, s.matched desc, s.rank desc, s.id
      limit $5`,
    [a.question, a.concern ?? null, a.kind ?? null, a.status ?? null, limit],
  )
  if (rows.length === 0) {
    await db.query('select knowledge.log_unanswered($1, $2, $3)', [a.question, a.concern ?? null, a.kind ?? null])
  }
  return rows
}

// ---------------------------------------------------------------------------
// get

export interface LinkView {
  direction: 'out' | 'in'
  type: string
  id: string
  basis: string
  reason: string | null
  answer: string
  status: string
}

export interface VersionView {
  version: number
  valid_from: string
  valid_to: string | null
  person: string
  agent: string
  reason: string
}

export interface FullRecord {
  record: Record<string, unknown>
  links: LinkView[]
  refs: { kind: string; url: string; label: string | null }[]
  versions: VersionView[]
}

export async function get(db: ClientBase, id: string): Promise<FullRecord | null> {
  const rec = await db.query<{ r: Record<string, unknown> }>(
    `select to_jsonb(r) - 'embedding' as r from knowledge.records r where r.id = $1`,
    [id],
  )
  if (rec.rows.length === 0) return null
  const links = await db.query<LinkView>(
    `select 'out' as direction, l.type, l.to_id as id, l.basis, l.reason, r.answer, r.status
       from knowledge.links l join knowledge.records r on r.id = l.to_id where l.from_id = $1
     union all
     select 'in', l.type, l.from_id, l.basis, l.reason, r.answer, r.status
       from knowledge.links l join knowledge.records r on r.id = l.from_id where l.to_id = $1
     order by 1 desc, 2, 3`,
    [id],
  )
  const refs = await db.query<{ kind: string; url: string; label: string | null }>(
    `select kind, url, label from knowledge.refs where record_id = $1 order by id`,
    [id],
  )
  const versions = await db.query<VersionView>(
    `select version, valid_from, valid_to, person, agent, reason
       from knowledge.history where record_id = $1 order by version`,
    [id],
  )
  return { record: rec.rows[0].r, links: links.rows, refs: refs.rows, versions: versions.rows }
}

// ---------------------------------------------------------------------------
// related

export interface Edge {
  from: string
  type: string
  to: string
  basis: string
  depth: number
}

/** Every link within `hops` of a record, either way, as edges; plus a line for each record reached. */
export async function related(
  db: ClientBase,
  id: string,
  hops = 1,
  types?: string[],
): Promise<{ edges: Edge[]; records: Pick<RecordRow, 'id' | 'kind' | 'status' | 'answer'>[] } | null> {
  const exists = await db.query('select 1 from knowledge.records where id = $1', [id])
  if (exists.rowCount === 0) return null
  const { rows: edges } = await db.query<Edge>(
    `with recursive walk (node, depth, seen) as (
       select $1::text, 0, array[$1::text]
       union all
       select case when l.from_id = w.node then l.to_id else l.from_id end, w.depth + 1,
              w.seen || case when l.from_id = w.node then l.to_id else l.from_id end
         from walk w
         join knowledge.links l on (l.from_id = w.node or l.to_id = w.node)
        where w.depth < $2
          and ($3::text[] is null or l.type = any ($3))
          and not (case when l.from_id = w.node then l.to_id else l.from_id end) = any (w.seen)
     )
     select distinct on (l.id) l.from_id as from, l.type, l.to_id as to, l.basis, w.depth + 1 as depth
       from walk w
       join knowledge.links l on (l.from_id = w.node or l.to_id = w.node)
      where w.depth < $2 and ($3::text[] is null or l.type = any ($3))
      order by l.id, w.depth`,
    [id, Math.min(Math.max(hops, 1), 5), types && types.length ? types : null],
  )
  const ids = [...new Set(edges.flatMap((e) => [e.from, e.to]))].filter((x) => x !== id)
  const { rows: records } = await db.query<Pick<RecordRow, 'id' | 'kind' | 'status' | 'answer'>>(
    `select id, kind, status, answer from knowledge.records where id = any ($1) order by id`,
    [ids],
  )
  edges.sort((a, b) => a.depth - b.depth || a.type.localeCompare(b.type) || a.from.localeCompare(b.from))
  return { edges, records }
}

// ---------------------------------------------------------------------------
// history and as_of

export async function history(db: ClientBase, id: string): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<{ h: Record<string, unknown> }>('select knowledge.history_of($1) as h', [id])
  const h = rows[0]?.h
  return h && h.record ? h : null
}

export interface AsOfRow {
  id: string
  version: number
  kind: string
  status: string
  strength: string
  answer: string
  why: string | null
}

/** What was live for a concern at the end of a given day, each record as it read then. */
export async function asOfConcern(db: ClientBase, concern: string, at: string): Promise<AsOfRow[]> {
  const { rows } = await db.query<AsOfRow>(
    `select a.id, a.version, a.snapshot->>'kind' as kind, a.snapshot->>'status' as status,
            a.snapshot->>'strength' as strength, a.snapshot->>'answer' as answer, a.snapshot->>'why' as why
       from knowledge.as_of($1, $2::timestamptz) a
      order by array_position(array['absolute','rule','guideline'], a.snapshot->>'strength'), a.id`,
    [concern, endOfDay(at)],
  )
  return rows
}

/** One record as it read at the end of a given day, such as the platform's why. */
export async function asOfRecord(db: ClientBase, id: string, at: string): Promise<Record<string, unknown> | null> {
  const { rows } = await db.query<{ r: Record<string, unknown> | null }>(
    'select knowledge.record_as_of($1, $2::timestamptz) as r',
    [id, endOfDay(at)],
  )
  return rows[0]?.r ?? null
}

function endOfDay(date: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59.999Z` : date
}

// ---------------------------------------------------------------------------
// live

export interface LiveAnswer {
  concern: { slug: string; department: string }
  records: (RecordRow & { applies: { id: string; basis: string }[] })[]
  follows: { id: string; kind: string; answer: string; here: number }[]
}

export async function concerns(db: ClientBase): Promise<{ slug: string; department: string }[]> {
  const { rows } = await db.query<{ slug: string; department: string }>(
    'select slug, department from knowledge.concerns order by department, slug',
  )
  return rows
}

/** Every live record for one concern, strictest first, with the principles they apply. */
export async function live(db: ClientBase, concern: string): Promise<LiveAnswer | null> {
  const c = await db.query<{ slug: string; department: string }>(
    'select slug, department from knowledge.concerns where slug = $1',
    [concern],
  )
  if (c.rows.length === 0) return null
  const { rows } = await db.query<LiveAnswer['records'][number]>(
    `select ${SUMMARY_COLUMNS},
            coalesce((select jsonb_agg(jsonb_build_object('id', l.to_id, 'basis', l.basis) order by l.to_id)
                        from knowledge.links l where l.from_id = r.id and l.type = 'applies'), '[]'::jsonb) as applies
       from knowledge.records r
      where r.concern = $1 and r.status = 'live'
      order by ${BUILDER_ORDER}`,
    [concern],
  )
  const counts = new Map<string, number>()
  for (const r of rows) for (const a of r.applies) counts.set(a.id, (counts.get(a.id) ?? 0) + 1)
  const { rows: follows } = await db.query<{ id: string; kind: string; answer: string }>(
    `select id, kind, answer from knowledge.records where id = any ($1) order by id`,
    [[...counts.keys()]],
  )
  return {
    concern: c.rows[0],
    records: rows,
    follows: follows.map((f) => ({ ...f, here: counts.get(f.id) ?? 0 })),
  }
}

// ---------------------------------------------------------------------------
// precedents

export interface PatternPrecedents {
  pattern: Pick<RecordRow, 'id' | 'kind' | 'answer' | 'status'>
  applies: { id: string; basis: string; answer: string }[]
  departs: { id: string; basis: string; reason: string | null; answer: string }[]
}

/** Every live record that applies a philosophy or pattern, and those that depart from it. */
export async function precedentsOf(db: ClientBase, id: string): Promise<PatternPrecedents | null> {
  const p = await db.query<PatternPrecedents['pattern']>(
    'select id, kind, answer, status from knowledge.records where id = $1',
    [id],
  )
  if (p.rows.length === 0) return null
  const { rows } = await db.query<{ id: string; link_type: string; basis: string; reason: string | null; answer: string }>(
    'select id, link_type, basis, reason, answer from knowledge.precedents_of($1)',
    [id],
  )
  return {
    pattern: p.rows[0],
    applies: rows.filter((r) => r.link_type === 'applies').map(({ id, basis, answer }) => ({ id, basis, answer })),
    departs: rows
      .filter((r) => r.link_type === 'departs_from')
      .map(({ id, basis, reason, answer }) => ({ id, basis, reason, answer })),
  }
}

export interface QuestionPrecedents {
  groups: {
    principle: Pick<RecordRow, 'id' | 'kind' | 'answer'>
    applying: number
    departing: number
    near: { id: string; answer: string; link: string }[]
  }[]
  unprincipled: { id: string; answer: string }[]
}

/**
 * The closest live decisions to a question, grouped by the philosophies and
 * patterns they apply or depart from, with how many live decisions apply each
 * and how many depart. A question nothing answers is logged, as search does.
 */
export async function precedentsFor(db: ClientBase, question: string, concern?: string): Promise<QuestionPrecedents> {
  const hits = await search(db, { question, concern, kind: 'decision', status: 'live', limit: 15 })
  const ids = hits.map((h) => h.id)
  const { rows: links } = await db.query<{ from_id: string; to_id: string; type: string }>(
    `select l.from_id, l.to_id, l.type from knowledge.links l
       join knowledge.records p on p.id = l.to_id and p.kind in ('philosophy', 'pattern')
      where l.from_id = any ($1) and l.type in ('applies', 'departs_from')`,
    [ids],
  )
  const principleIds = [...new Set(links.map((l) => l.to_id))]
  const { rows: principles } = await db.query<{ id: string; kind: string; answer: string; applying: number; departing: number }>(
    `select p.id, p.kind, p.answer,
            (select count(*)::int from knowledge.precedents_of(p.id) x where x.link_type = 'applies') as applying,
            (select count(*)::int from knowledge.precedents_of(p.id) x where x.link_type = 'departs_from') as departing
       from knowledge.records p where p.id = any ($1)`,
    [principleIds],
  )
  const answerOf = new Map(hits.map((h) => [h.id, h.answer]))
  const groups = principles
    .map((p) => ({
      principle: { id: p.id, kind: p.kind, answer: p.answer },
      applying: p.applying,
      departing: p.departing,
      near: links
        .filter((l) => l.to_id === p.id)
        .map((l) => ({ id: l.from_id, answer: answerOf.get(l.from_id) ?? '', link: l.type })),
    }))
    .sort((a, b) => b.near.length - a.near.length || b.applying - a.applying)
  const linked = new Set(links.map((l) => l.from_id))
  return { groups, unprincipled: hits.filter((h) => !linked.has(h.id)).map((h) => ({ id: h.id, answer: h.answer })) }
}

// ---------------------------------------------------------------------------
// why

export const PLATFORM_WHY = 'platform-why'

export interface WhyAnswer {
  record: Pick<RecordRow, 'id' | 'kind' | 'answer' | 'why' | 'status'>
  chain: { id: string; kind: string; answer: string; why: string | null; depth: number }[]
  platform: { answer: string; why: string | null } | null
  /** The version that brought in the current wording, with its evidence. */
  current: WhyVersion | null
  earlier: WhyVersion[]
}

export interface WhyVersion {
  version: number
  why: string | null
  valid_from: string
  person: string
  agent: string
  reason: string
  evidence: unknown
}

/** The current why, the principles it rests on up to the platform's why, and every earlier wording with its evidence. */
export async function why(db: ClientBase, id: string): Promise<WhyAnswer | null> {
  const r = await db.query<WhyAnswer['record']>(
    'select id, kind, answer, why, status from knowledge.records where id = $1',
    [id],
  )
  if (r.rows.length === 0) return null
  const { rows: chain } = await db.query<WhyAnswer['chain'][number]>(
    `with recursive up (node, depth, seen) as (
       select $1::text, 0, array[$1::text]
       union all
       select l.to_id, u.depth + 1, u.seen || l.to_id
         from up u join knowledge.links l on l.from_id = u.node and l.type = 'applies'
        where u.depth < 5 and not l.to_id = any (u.seen)
     )
     select distinct on (p.id) p.id, p.kind, p.answer, p.why, u.depth
       from up u join knowledge.records p on p.id = u.node
      where u.depth > 0 and p.id <> $2
      order by p.id, u.depth`,
    [id, PLATFORM_WHY],
  )
  chain.sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
  const platform = await db.query<{ answer: string; why: string | null }>(
    'select answer, why from knowledge.records where id = $1 and id <> $2',
    [PLATFORM_WHY, id],
  )
  const { rows: versions } = await db.query<WhyVersion>(
    `select version, snapshot->>'why' as why, valid_from, person, agent, reason, evidence
       from knowledge.history where record_id = $1 order by version`,
    [id],
  )
  // Only the versions where the why itself changed, oldest first; the last is the current wording.
  const wordings: WhyVersion[] = []
  let last: string | null | undefined
  for (const v of versions) {
    if (v.why !== last) wordings.push(v)
    last = v.why
  }
  const current = wordings.length && wordings[wordings.length - 1].why === r.rows[0].why ? wordings.pop()! : null
  return { record: r.rows[0], chain, platform: platform.rows[0] ?? null, current, earlier: wordings }
}

// ---------------------------------------------------------------------------
// propose and decide: internal, through the store's write functions only

export interface ProposeArgs {
  record?: Record<string, unknown>
  id?: string
  changes?: Record<string, unknown>
  reason: string
  evidence?: Record<string, unknown>
  applies?: string[]
  departs_from?: { id: string; reason: string }[]
}

export async function propose(
  db: ClientBase,
  a: ProposeArgs,
): Promise<{ id: string; status: string; version: number; refused?: string; links: number }> {
  let id: string
  let refused: string | undefined
  if (a.record) {
    const { rows } = await db.query<{ id: string }>('select knowledge.record($1::jsonb, $2, $3::jsonb) as id', [
      JSON.stringify(a.record),
      a.reason,
      a.evidence ? JSON.stringify(a.evidence) : null,
    ])
    id = rows[0].id
  } else if (a.id && a.changes) {
    const { rows } = await db.query<{ out: { refused?: string } | null }>(
      'select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as out',
      [a.id, JSON.stringify(a.changes), a.reason, a.evidence ? JSON.stringify(a.evidence) : null],
    )
    id = a.id
    refused = rows[0]?.out?.refused
  } else {
    throw new Error('Give either a new record, or an id with the changes to it.')
  }
  let links = 0
  if (!refused) {
    for (const to of a.applies ?? []) {
      await db.query(`select knowledge.link($1, $2, 'applies', 'stated', $3)`, [id, to, a.reason])
      links++
    }
    for (const d of a.departs_from ?? []) {
      await db.query(`select knowledge.link($1, $2, 'departs_from', 'stated', $3)`, [id, d.id, d.reason])
      links++
    }
  }
  const { rows } = await db.query<{ status: string; version: number }>(
    'select status, version from knowledge.records where id = $1',
    [id],
  )
  return { id, status: rows[0]?.status ?? 'unknown', version: rows[0]?.version ?? 0, refused, links }
}

export async function decide(db: ClientBase, id: string, reason: string): Promise<{ id: string; version?: number; refused?: string }> {
  const { rows } = await db.query<{ out: { id: string; version?: number; refused?: string } }>(
    'select knowledge.decide($1, $2) as out',
    [id, reason],
  )
  return rows[0].out
}

// ---------------------------------------------------------------------------
// F130 (#1232): a concept's timeline, by its id or any name it ever had.

export interface ConceptTimeline {
  concept: { id: string; name: string; status: string; why: string | null; concern: string | null; source: string | null }
  names: { name: string; on: string; state: 'used' | 'refused'; ruling: string | null; evidence: { kind: string; ref: string }[]; note: string | null }[]
  events: { on: string; type: string; what: string; evidence: { kind: string; ref: string; note?: string }[]; pm_words: string | null; ruling: string | null }[]
  lineage: { from: string; type: string; to: string; other: string; other_kind: string; other_status: string; reason: string | null }[]
}

/** The concepts an id or a name points at: one, several (a name two concepts shared), or none. */
export async function findConcept(db: ClientBase, idOrName: string): Promise<{ id: string; matched: string; state: string }[]> {
  const { rows } = await db.query<{ id: string; matched: string; state: string }>(
    'select id, matched, state from knowledge.find_concept($1) order by id',
    [idOrName],
  )
  return rows
}

export async function conceptTimeline(db: ClientBase, id: string): Promise<ConceptTimeline | null> {
  const { rows } = await db.query<{ t: ConceptTimeline | null }>('select knowledge.concept_timeline($1) as t', [id])
  return rows[0]?.t ?? null
}
