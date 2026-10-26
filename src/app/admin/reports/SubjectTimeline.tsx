// F101.12 (#634) — a subject's whole history in one list, newest first: every report, every AI read (not only the
// latest), the poster's answer and every decision. Reading only; Undo lives on each report below, as before.

import { subjectTimeline, type ReviewSubject } from '@/lib/admin/review-subjects'
import { categoryLabel } from '@/lib/reports/categories'
import { reasonLabel, type ReasonCode } from '@/lib/admin/reason-codes'

const day = (d: Date) => d.toISOString().slice(0, 10)
const REASON_WORD = { mistaken: 'Mistaken', malicious: 'Malicious', misusing_reports: 'Misusing reports' } as const

export function SubjectTimeline({ subject }: { subject: ReviewSubject }) {
  const items = subjectTimeline(subject)
  return (
    <li className="list-none" data-testid="subject-timeline-item">
      <p className="mb-1 text-caption font-medium text-[var(--color-fg-muted)]">Everything that has happened, newest first</p>
      <ol data-testid="subject-timeline" className="m-0 flex list-none flex-col gap-1 p-0 text-caption text-[var(--color-fg)]">
        {items.map((i, n) => (
          <li key={n} data-testid="timeline-item" data-kind={i.kind} className="break-words">
            <span className="text-[var(--color-fg-muted)]">{day(i.at)} · </span>
            {i.kind === 'report' && (
              <>
                Reported{i.report.category ? ` as ${categoryLabel(i.report.category).split(' — ')[0]}` : ''}: “{i.report.body}”
              </>
            )}
            {i.kind === 'assessment' &&
              (i.skipped ? (
                <>AI did not read it: {i.skipped}</>
              ) : (
                <>
                  AI read: {i.outcome} · {i.confidence?.toFixed(2)} · severity {i.severity} · {i.model} — {i.reason}
                </>
              ))}
            {i.kind === 'rebuttal' &&
              (i.answer.kind === 'fix_and_repost' ? (
                <>Poster fixed it and reposted.</>
              ) : i.answer.kind === 'mistake' ? (
                <>Owner says this is a mistake.</>
              ) : (
                <>
                  Poster answered: {REASON_WORD[i.answer.reason ?? 'mistaken']}
                  {i.answer.note ? ` — ${i.answer.note}` : ''}
                </>
              ))}
            {i.kind === 'decision' && (
              <>
                {i.decision.outcome === 'removed' ? 'Removed' : 'Restored'} · {reasonLabel(i.decision.reasonCode as ReasonCode)}
                {i.decision.reasonNote ? ` — “${i.decision.reasonNote}”` : ''} · {i.decision.decidedByAi ? 'AI' : (i.decision.decidedByName ?? 'unknown')}
                {i.decision.reversesDecisionId ? ' · reversal' : ''}
              </>
            )}
          </li>
        ))}
      </ol>
    </li>
  )
}
