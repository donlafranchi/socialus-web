// D-0282 (the PM, 2026-11-26) — a ruling that moved out of socialus-plan but stays live. moves.json names its new
// home; the import, as the store's login, revises the record's source there before it looks for rulings gone from
// the plan, which only judges records sourced from the plan. Like a redirect map: one line per move, with its why.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ClientBase } from 'pg'

export interface Move { id: string; source: string; why: string }
export const MOVES_PATH = join(__dirname, 'moves.json')

export function readMoves(path: string = MOVES_PATH): Move[] {
  if (!existsSync(path)) return []
  return (JSON.parse(readFileSync(path, 'utf8')) as { moves: Move[] }).moves ?? []
}

type Row = { id: string; source: string | null; status: string }

/** stillInPlan: the record is a ruling socialus-plan still holds (ids are per store, so another store's D-0282 may be one). */
export function movesToApply(rows: Row[], moves: Move[], stillInPlan: (r: Row) => boolean = () => false) {
  return moves.flatMap((m) => {
    const r = rows.find((x) => x.id === m.id)
    if (!r || stillInPlan(r)) return [] // not this store's moved ruling; loadMoves says so
    if (r.status !== 'live') throw new Error(`moves.json names ${m.id}, which is ${r.status}: a move keeps a live ruling live, it never revives one.`)
    return r.source === m.source ? [] : [{ id: m.id, changes: { source: m.source }, why: m.why }]
  })
}

/** Inside the import's transaction. Returns report lines, naming each moved record's audience and departments. */
export async function loadMoves(
  db: ClientBase,
  inPlan: (r: { source: string | null; decided_on: string | null; answer: string }) => boolean,
  moves: Move[] = readMoves(),
): Promise<string[]> {
  if (!moves.length) return []
  const { rows } = await db.query<{ id: string; source: string | null; status: string; audience: string; departments: string[]; decided_on: string | null; answer: string }>(
    `select id, source, status, audience, departments, to_char(decided_on, 'YYYY-MM-DD') as decided_on, answer
       from knowledge.records where id = any($1)`,
    [moves.map((m) => m.id)],
  )
  const out = ['', '### Moved out of socialus-plan, kept live (moves.json)', '']
  const todo = movesToApply(rows, moves, (r) => inPlan(rows.find((x) => x.id === r.id)!))
  for (const m of moves) if (!rows.some((r) => r.id === m.id)) out.push(`- ${m.id}: not in this store`)
  for (const r of rows) {
    const t = todo.find((x) => x.id === r.id)
    if (t) {
      const { rows: res } = await db.query<{ r: { refused?: string } }>('select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r', [
        r.id, JSON.stringify(t.changes), t.why, JSON.stringify({ file: 'scripts/knowledge/moves.json', seed: t.changes }),
      ])
      if (res[0].r.refused) throw new Error(`${r.id}: ${res[0].r.refused}`)
    }
    const kept = !t && inPlan(r) ? 'still a ruling in socialus-plan, not moved' : t ? 'source moved' : 'unchanged'
    out.push(`- ${r.id}: ${kept}; audience ${r.audience}, departments ${r.departments.join(', ') || 'none'}`)
  }
  return out
}
