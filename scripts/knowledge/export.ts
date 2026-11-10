// F125 / T1017 (#1218) — constraints/<tier>.md, read back out of the store.
//
// Reads as the store's own login, holding a key, through row-level security,
// like any other reader. The rows it needs: every live decision and
// philosophy that came from a dated ruling line (its source is `file:line`),
// with the tiers and surfaces its binds tag named. The anchored principles
// (soul, defaults, pitch) are in the store as philosophies but carry the tag
// `unlisted`, because markers.py's DECISION pattern does not read a line that
// opens with an anchor, and the hand-built file therefore leaves them out.
// [open-question owner=cowork raised=2026-11-10] markers.py leaves the 10 anchored PRINCIPLES.md lines out of constraints/code.md although each binds the code tier: intended, or should they be listed? The export follows the file either way.
//
// The nightly export (#1220) writes this file to socialus-plan by PR; this
// module is what it calls.

import type { ClientBase } from 'pg'
import { renderConstraints, type ConstraintRow } from './render'

const PLAN_SOURCE = /^([^:#]+\.md):(\d+)$/

export async function constraintRows(db: ClientBase): Promise<ConstraintRow[]> {
  const { rows } = await db.query<{
    decided_on: string
    holds: 'always' | 'for now' | null
    tags: string[]
    answer: string
    source: string
  }>(
    `select to_char(decided_on, 'YYYY-MM-DD') as decided_on, holds, tags, answer, source
       from knowledge.records
      where kind in ('decision', 'philosophy') and status = 'live'
        and not ('unlisted' = any (tags))`,
  )
  return rows
    .filter((r) => PLAN_SOURCE.test(r.source ?? ''))
    .map((r) => {
      const [, file, line] = PLAN_SOURCE.exec(r.source)!
      const tierTags = r.tags.filter((t) => t.startsWith('tier:')).map((t) => t.slice(5))
      return {
        date: r.decided_on,
        holds: r.holds,
        tiers: tierTags.length ? tierTags.filter((t) => t !== 'none') : null,
        surfaces: r.tags.filter((t) => !t.includes(':') && t !== 'unlisted'),
        words: r.answer,
        file,
        line: Number(line),
      }
    })
}

export async function exportConstraints(db: ClientBase, tier: string): Promise<string> {
  return renderConstraints(tier, await constraintRows(db))
}
