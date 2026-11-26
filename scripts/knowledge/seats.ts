// #1435 — every live practice names the seat a person takes later (RACI, CODEOWNERS, GitLab's DRI). Agents run
// them all today; the seat says whose job a practice becomes once there is a team. seats.json is the source;
// the import writes each seat to the practice's `owner` through knowledge.revise, and fails when a live
// practice has no seat, so a new practice cannot arrive without one.

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ClientBase } from 'pg'

export const SEATS = ['product manager', 'tech lead', 'engineer', 'reviewer', 'on-call', 'release owner', 'support'] as const
export type Seat = (typeof SEATS)[number]
export const SEATS_PATH = join(__dirname, 'seats.json')

export function readSeats(path: string = SEATS_PATH): Record<string, string> {
  if (!existsSync(path)) return {}
  return (JSON.parse(readFileSync(path, 'utf8')) as { seats: Record<string, string> }).seats ?? {}
}

/** What stops the import: a live practice with no seat, or a seat that is not one of the seven. */
export function seatProblems(livePractices: string[], seats: Record<string, string>): string[] {
  const out: string[] = []
  for (const id of livePractices) {
    const s = seats[id]
    if (!s) out.push(`${id} has no seat in scripts/knowledge/seats.json`)
    else if (!(SEATS as readonly string[]).includes(s)) out.push(`${id} names "${s}", not a seat`)
  }
  return out
}

export interface SeatSummary {
  set: number
  unchanged: number
  problems: string[]
}

/** Inside the import's transaction, as the store's login: write each live practice's seat to its owner. */
export async function loadSeats(db: ClientBase, seats: Record<string, string>): Promise<SeatSummary> {
  const { rows } = await db.query<{ id: string; owner: string | null }>(
    `select id, owner from knowledge.records where kind = 'practice' and status = 'live' order by id`,
  )
  const sum: SeatSummary = { set: 0, unchanged: 0, problems: seatProblems(rows.map((r) => r.id), seats) }
  if (sum.problems.length) return sum
  for (const r of rows) {
    if (r.owner === seats[r.id]) { sum.unchanged++; continue }
    const { rows: res } = await db.query<{ r: { refused?: string } }>('select knowledge.revise($1, $2::jsonb, $3, $4::jsonb) as r', [
      r.id,
      JSON.stringify({ owner: seats[r.id] }),
      'Re-imported: owner (the seat a person takes later, #1435) changed in scripts/knowledge/seats.json.',
      JSON.stringify({ seed: { owner: seats[r.id] }, file: 'scripts/knowledge/seats.json' }),
    ])
    if (res[0].r.refused) sum.problems.push(`${r.id}: ${res[0].r.refused}`)
    else sum.set++
  }
  return sum
}

export function seatReport(s: SeatSummary): string[] {
  return ['', '### Seats (#1435)', '', `- Seats set: ${s.set}`, `- Unchanged: ${s.unchanged}`, ...s.problems.map((p) => `- ${p}`)]
}
