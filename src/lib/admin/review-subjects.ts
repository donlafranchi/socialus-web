// F101 — one row per reported subject, ordered for a batch to be cleared.
//
// Today a subject is a Page's photo (reports.subject_kind = 'group') and a
// report is free text, so there is no category to give a severity tier: every
// row's severity is null and the order falls through to oldest hidden first
// (F101 criterion 4's second key). F078's categories fill `severity`; nothing
// here changes shape when they do.

import type { QueuedReport } from './reports-queue'
import type { ReasonCode } from './reason-codes'
import { SEVERITY_OF_REPORT_CATEGORY, type ReportCategory } from '@/lib/reports/categories'

export type Severity = 1 | 2 | 3 | 4

export interface ReviewSubject {
  subjectKind: 'group' | 'post'
  subjectId: string
  name: string
  slug: string | null
  photoUrl: string | null
  /** Every report on the subject, oldest first. */
  reports: QueuedReport[]
  /** Reports with no decision yet. A reversal is itself a decision (the opposite outcome). */
  openReportIds: string[]
  severity: Severity | null
  /** The reasons the reporters chose, most reported first. */
  reasons: { category: ReportCategory; count: number }[]
  /** F102 criterion 8 — a flag for the operator, never acted on automatically. */
  coordinated: boolean
  /** What was reported, for the excerpt. */
  contentText: string | null
  hiddenAt: Date | null
  status: 'hidden' | 'restored' | 'removed'
}

export const isOpen = (r: QueuedReport) => r.history.length === 0

export function groupBySubject(queue: QueuedReport[]): ReviewSubject[] {
  const by = new Map<string, ReviewSubject>()
  for (const r of [...queue].sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime())) {
    const isPost = r.subjectKind === 'post' && !!r.postId
    const key = isPost ? `post:${r.postId}` : `group:${r.groupId}`
    const s = by.get(key) ?? {
      subjectKind: isPost ? ('post' as const) : ('group' as const),
      subjectId: isPost ? r.postId! : r.groupId,
      contentText: r.contentText ?? null,
      reasons: [],
      coordinated: false,
      name: r.groupName,
      slug: r.groupSlug,
      photoUrl: r.photoUrl,
      reports: [],
      openReportIds: [],
      severity: null,
      hiddenAt: r.hiddenAt,
      status: r.removedAt ? 'removed' : r.hiddenAt ? 'hidden' : 'restored',
    }
    s.reports.push(r)
    if (isOpen(r)) s.openReportIds.push(r.reportId)
    by.set(key, s)
  }
  const flagged = coordinatedPosters(queue)
  for (const s of by.values()) {
    s.coordinated = s.reports.some((r) => r.posterId && flagged.has(r.posterId))
    s.severity = severityOf(s)
    s.reasons = tally(s)
  }
  return [...by.values()]
}

const tiers = (s: ReviewSubject) =>
  s.reports.filter(isOpen).flatMap((r) => (r.category ? [SEVERITY_OF_REPORT_CATEGORY[r.category]] : []))

/** F101 criterion 3 (shadow): the most serious tier among the open reports' reasons. */
const severityOf = (s: ReviewSubject): Severity | null => {
  const t = tiers(s)
  return t.length ? (Math.min(...t) as Severity) : null
}

const tally = (s: ReviewSubject) => {
  const counts = new Map<ReportCategory, number>()
  for (const r of s.reports) if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  return [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
}

const DAY = 86_400_000

/** F102 criterion 8: three or more reports on one poster's content within 24 hours, at least two from accounts under 7 days old. */
function coordinatedPosters(queue: QueuedReport[]): Set<string> {
  const byPoster = new Map<string, QueuedReport[]>()
  for (const r of queue) if (r.posterId) byPoster.set(r.posterId, [...(byPoster.get(r.posterId) ?? []), r])
  const out = new Set<string>()
  for (const [poster, rs] of byPoster) {
    const sorted = [...rs].sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime())
    for (let i = 0; i < sorted.length; i++) {
      const window = sorted.filter((r) => r.reportedAt.getTime() >= sorted[i]!.reportedAt.getTime() && r.reportedAt.getTime() - sorted[i]!.reportedAt.getTime() <= DAY)
      if (window.length >= 3 && window.filter((r) => (r.reporterAgeDays ?? Infinity) < 7).length >= 2) out.add(poster)
    }
  }
  return out
}

export type SortKey = 'severity' | 'age' | 'count'

const t = (d: Date | null) => (d ? d.getTime() : Number.POSITIVE_INFINITY)

/** F101 criterion 4: severity, then oldest hidden first; waiting rows before decided ones. */
export function orderSubjects(subjects: ReviewSubject[], key: SortKey = 'severity'): ReviewSubject[] {
  return [...subjects].sort((a, b) => {
    const wait = Number(b.openReportIds.length > 0) - Number(a.openReportIds.length > 0)
    if (wait) return wait
    if (key === 'count' && b.reports.length !== a.reports.length) return b.reports.length - a.reports.length
    if (key === 'severity') {
      const sev = (a.severity ?? 5) - (b.severity ?? 5)
      if (sev) return sev
      // One tier of priority within a severity (F102 criterion 8).
      const flag = Number(b.coordinated) - Number(a.coordinated)
      if (flag) return flag
    }
    return t(a.hiddenAt) - t(b.hiddenAt)
  })
}

/** F101 criterion 10's one-tap reasons. Remove matches the top category once F078 gives one. */
export const DEFAULT_REASON: Record<'restored' | 'removed', ReasonCode> = {
  restored: 'nothing_wrong',
  removed: 'not_suitable',
}

/** F101 criterion 13: blur unless the row is known to be spam-tier. */
export const blurred = (s: ReviewSubject) => s.severity !== 4
