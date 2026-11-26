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

export function movesToApply(rows: { id: string; source: string | null; status: string }[], moves: Move[]) {
  return moves.flatMap((m) => {
    const r = rows.find((x) => x.id === m.id)
    if (!r) return [] // not in this store (a test database); loadMoves says so
    if (r.status !== 'live') throw new Error(`moves.json names ${m.id}, which is ${r.status}: a move keeps a live ruling live, it never revives one.`)
    return r.source === m.source ? [] : [{ id: m.id, changes: { source: m.source }, why: m.why }]
  })
}

/** Inside the import's transaction. Returns report lines, naming each moved record's audience and departments. */
export async function loadMoves(db: ClientBase, moves: Move[] = readMoves()): Promise<string[]> {
  if (!moves.length) return []
  const { rows } = await db.query<{ id: string; source: string | null; status: string; audience: string; departments: string[] }>(
    `select id, source, status, audience, departments from knowledge.records where id = any($1)`,
    [moves.map((m) => m.id)],
  )
  const out = ['', '### Moved out of socialus-plan, kept live (moves.json)', '']
  const todo = movesToApply(rows, moves)
  for (const m of moves) if (!rows.some((r) => r.id === m.id)) out.push(`- ${m.id}: not in this store`)
  for (const r of rows) {
    const t = todo.find((x) => x.id === r.id)
    if (t) {
      const { rows: res } = await db.query<{ r: { refused?: string } }>('select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r', [
        r.id, JSON.stringify(t.changes), t.why, JSON.stringify({ file: 'scripts/knowledge/moves.json', seed: t.changes }),
      ])
      if (res[0].r.refused) throw new Error(`${r.id}: ${res[0].r.refused}`)
    }
    out.push(`- ${r.id}: ${t ? 'source moved' : 'unchanged'}; audience ${r.audience}, departments ${r.departments.join(', ') || 'none'}`)
  }
  return out
}
