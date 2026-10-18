// #904 — the review loop's numbers: per kind per week, counts only. One implementation of "red", read by the
// dashboard (latest.json on the notify-history branch) and the monthly review.

import type { NotifyKind } from './rules'

export interface WeekRow {
  week: string
  kind: NotifyKind
  sends: number
  opens: number
  opt_ins: number
  unsubscribes: number
  mutes: number
  opted_in_members: number | null
  members: number | null
}

export interface KindSummary {
  kind: NotifyKind
  state: 'green' | 'red' | 'quiet'
  why: string | null
  optInRate: number | null
  openRate: number | null
  weeks: WeekRow[]
}

/** Red when this week's unsubscribes plus mutes are at least 3 and either twice the trailing 4-week average or
 *  over 10% of the members opted in. Quiet when nothing went out and nobody opted in. */
export function summarize(rows: readonly WeekRow[], kind: NotifyKind): KindSummary {
  const weeks = rows.filter((r) => r.kind === kind).sort((a, b) => a.week.localeCompare(b.week))
  const last = weeks.at(-1)
  if (!last || (last.sends === 0 && last.opt_ins === 0 && !last.opted_in_members)) {
    return { kind, state: 'quiet', why: null, optInRate: rate(last?.opted_in_members, last?.members), openRate: null, weeks }
  }
  const leaving = last.unsubscribes + last.mutes
  const prior = weeks.slice(-5, -1)
  const avg = prior.length ? prior.reduce((s, w) => s + w.unsubscribes + w.mutes, 0) / prior.length : 0
  const share = last.opted_in_members ? leaving / last.opted_in_members : 0
  const spike = leaving >= 3 && (leaving >= 2 * Math.max(avg, 1) || share > 0.1)
  return {
    kind,
    state: spike ? 'red' : 'green',
    why: spike ? `${leaving} turned off or paused this week (usual ${avg.toFixed(1)})` : null,
    optInRate: rate(last.opted_in_members, last.members),
    openRate: rate(last.opens, last.sends),
    weeks,
  }
}

const rate = (n: number | null | undefined, d: number | null | undefined) => (n != null && d ? n / d : null)
