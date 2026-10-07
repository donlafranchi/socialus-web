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
  /** F099 — which image, or the post body, it is. */
  subjectKind: QueuedReport['subjectKind']
  /** The key: the Page's id for its photo, the post's id for a post body, `kind:id` for any other image. */
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
  /** What was reported, for the excerpt. */
  contentText: string | null
  hiddenAt: Date | null
  status: 'hidden' | 'restored' | 'removed'
}

export const isOpen = (r: QueuedReport) => r.history.length === 0

export function groupBySubject(queue: QueuedReport[]): ReviewSubject[] {
  const by = new Map<string, ReviewSubject>()
  for (const r of [...queue].sort((a, b) => a.reportedAt.getTime() - b.reportedAt.getTime())) {
    // The Page's photo is keyed by its Page and a post body by its post id; any
    // other image by its own kind and id, so one Page's photo, picture and
    // posts never merge.
    const key =
      r.subjectKind === 'group'
        ? r.groupId
        : r.subjectKind === 'post'
          ? (r.postId ?? r.subjectId)
          : `${r.subjectKind}:${r.subjectId}`
    const s = by.get(key) ?? {
      subjectKind: r.subjectKind,
      subjectId: key,
      contentText: r.contentText ?? null,
      reasons: [],
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
  for (const s of by.values()) {
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
