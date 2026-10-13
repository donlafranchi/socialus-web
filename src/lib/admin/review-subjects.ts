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
import { removeReasonFor } from './reason-codes'
import { ANSWER_WINDOW_MS } from '@/lib/reports/answer-window'

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
  /** F102 criterion 12 — reports whose latest decision is the AI's restore, awaiting a person's confirm or undo. */
  aiRestored: { reportId: string; decisionId: string }[]
  severity: Severity | null
  /** The reasons the reporters chose, most reported first. */
  reasons: { category: ReportCategory; count: number }[]
  /** F100 — the AI's read, from the latest report that has one. */
  ai: QueuedReport['ai']
  /** F101 criterion 10 — the reason a one-tap Remove records. */
  removeReason: ReasonCode
  /** F102 — what the poster said, from whichever report carries it. */
  answer: QueuedReport['answer']
  /** F102 criterion 8 — a flag for the operator, never acted on automatically. */
  coordinated: boolean
  /** What was reported, for the excerpt. */
  contentText: string | null
  hiddenAt: Date | null
  status: 'hidden' | 'restored' | 'removed'
}

export const isOpen = (r: QueuedReport) => r.history.length === 0

export function groupBySubject(queue: QueuedReport[], { live = false }: { live?: boolean } = {}): ReviewSubject[] {
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
      coordinated: false,
      answer: null,
      ai: null,
      removeReason: 'not_suitable' as ReasonCode,
      name: r.groupName,
      slug: r.groupSlug,
      photoUrl: r.photoUrl,
      reports: [],
      openReportIds: [],
      aiRestored: [],
      severity: null,
      hiddenAt: r.hiddenAt,
      status: r.removedAt ? 'removed' : r.hiddenAt ? 'hidden' : 'restored',
    }
    s.reports.push(r)
    if (isOpen(r)) s.openReportIds.push(r.reportId)
    // history is newest first: a person's confirm or undo is a later row and clears this.
    const last = r.history[0]
    if (last?.decidedByAi && last.outcome === 'restored' && !last.alreadyReversed) s.aiRestored.push({ reportId: r.reportId, decisionId: last.decisionId })
    by.set(key, s)
  }
  const flagged = coordinatedPosters(queue)
  for (const s of by.values()) {
    s.answer = s.reports.find((r) => r.answer)?.answer ?? null
    s.coordinated = s.reports.some((r) => r.posterId && flagged.has(r.posterId))
    s.ai = [...s.reports].reverse().find((r) => r.ai)?.ai ?? null
    s.severity = severityOf(s, live)
    s.reasons = tally(s)
    s.removeReason = removeReasonFor(topCategory(s))
  }
  return [...by.values()]
}

const tiers = (s: ReviewSubject) =>
  s.reports.filter(isOpen).flatMap((r) => (r.category ? [SEVERITY_OF_REPORT_CATEGORY[r.category]] : []))

/** F101 criterion 3 (shadow): the most serious tier among the open reports' reasons. */
const severityOf = (s: ReviewSubject, live: boolean): Severity | null => {
  const t = tiers(s)
  // F101 criterion 3: shadow, the reporter's reason sets it; live, the higher of the two.
  if (live && s.ai && 'severity' in s.ai) t.push(s.ai.severity as 1 | 2 | 3 | 4)
  return t.length ? (Math.min(...t) as Severity) : null
}

/** The most reported category on the open reports; a tie goes to the more serious. */
function topCategory(s: ReviewSubject): ReportCategory | null {
  const counts = new Map<ReportCategory, number>()
  const pool = s.openReportIds.length || s.aiRestored.length === 0 ? s.reports.filter(isOpen) : s.reports
  for (const r of pool) if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || SEVERITY_OF_REPORT_CATEGORY[a[0]] - SEVERITY_OF_REPORT_CATEGORY[b[0]])
  return ranked[0]?.[0] ?? null
}

const tally = (s: ReviewSubject) => {
  const counts = new Map<ReportCategory, number>()
  for (const r of s.reports) if (r.category) counts.set(r.category, (counts.get(r.category) ?? 0) + 1)
  return [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count)
}

const DAY = 86_400_000

/** F102 criterion 8: three or more reports on one poster's content within 24 hours, at least two from accounts under 7 days old. */
export function coordinatedPosters(queue: QueuedReport[]): Set<string> {
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
    // #626: the owner said it is a mistake; those wait at the top, whatever the sort.
    const claim = Number(b.answer?.kind === 'mistake') - Number(a.answer?.kind === 'mistake')
    if (claim) return claim
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

/** F101 criterion 10's one-tap reasons. Remove uses the row's own `removeReason`; this is the Approve default. */
export const DEFAULT_REASON: Record<'restored' | 'removed', ReasonCode> = {
  restored: 'nothing_wrong',
  removed: 'not_suitable',
}

/** F101 criterion 13: blur unless the row is known to be spam-tier. */
export const blurred = (s: ReviewSubject) => s.severity !== 4

/** One line of a subject's history (F101.12). */
export type TimelineItem =
  | { kind: 'report'; at: Date; report: QueuedReport }
  | { kind: 'assessment'; at: Date; reportId: string; model: string | null; outcome: 'approve' | 'remove' | null; severity: number | null; confidence: number | null; reason: string | null; skipped: string | null }
  | { kind: 'rebuttal'; at: Date; answer: NonNullable<QueuedReport['answer']> }
  | { kind: 'decision'; at: Date; reportId: string; decision: QueuedReport['history'][number] }

// Newest first; at the same instant the later thing in the story comes first.
const KIND_RANK = { decision: 0, rebuttal: 1, assessment: 2, report: 3 } as const

/** F101.12: every report, AI read, rebuttal and decision on a subject, newest first. */
export function subjectTimeline(s: ReviewSubject): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const r of s.reports) {
    items.push({ kind: 'report', at: r.reportedAt, report: r })
    for (const a of r.assessments ?? []) items.push({ kind: 'assessment', at: a.at, reportId: r.reportId, model: a.model, outcome: a.outcome, severity: a.severity, confidence: a.confidence, reason: a.reason, skipped: a.skipped })
    for (const d of r.history) items.push({ kind: 'decision', at: d.decidedAt, reportId: r.reportId, decision: d })
    // The poster's answer belongs to the subject, so every report row carries the same one: it is one line.
    if (r.answer?.at && !items.some((i) => i.kind === 'rebuttal')) items.push({ kind: 'rebuttal', at: r.answer.at, answer: r.answer })
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime() || KIND_RANK[a.kind] - KIND_RANK[b.kind])
}

/**
 * F102 criterion 4: no answer is no work. A hide the poster has not answered in 14 days closes itself: it stays
 * hidden and leaves the batch, unless it is severity 1 (the PM always sees that).
 */
export function lapsed(s: ReviewSubject, now: Date): boolean {
  return s.status === 'hidden' && s.hiddenAt !== null && s.answer === null && s.severity !== 1 && now.getTime() - s.hiddenAt.getTime() >= ANSWER_WINDOW_MS
}
