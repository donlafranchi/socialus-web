'use client'

// One report, decided on a phone.
//
// TWO BUTTONS, BOTH PRESENT (Don, 2026-09-17). Not one button with a mode, not
// a menu. The fast path is choosing between two visible options, each opening
// its own short list of preset reasons — one tap to pick the outcome, one to
// pick the reason. Free text exists for the case that does not fit and is the
// exception, not the path.
//
// NO CONFIRM DIALOG AND NO UNDO WINDOW, deliberately. Removal preserves the URL
// and the bytes, so any decision can be undone from this same card at any time,
// including days later. A confirm that fires on every removal is one people
// learn to dismiss without reading; a timed window adds a clock and is strictly
// weaker than permanent reversibility. The protection is that reversal is
// always here and the history is visible — so nobody reverses blind.
//
// THE IMAGE STILL DOES NOT RENDER ON LOAD. It sits behind a deliberate tap,
// blurred until then. The operator is a person who will do this many times, and
// the worst thing in the queue should not be the first thing their eye meets.

import { categoryLabel } from '@/lib/reports/categories'
import { useState, useTransition } from 'react'
import type { QueuedReport, PastDecision } from '@/lib/admin/reports-queue'
import { reasonsFor, reasonLabel, reasonNeedsNote, type ReasonCode, type Outcome } from '@/lib/admin/reason-codes'

interface Props {
  report: QueuedReport
  hiddenFor: string | null
  onDecide: (input: {
    reportId: string
    outcome: Outcome
    reasonCode: ReasonCode
    reasonNote?: string
  }) => Promise<void>
  onReverse: (input: {
    decisionId: string
    reasonCode: ReasonCode
    reasonNote?: string
  }) => Promise<void>
}

export function ReportEntry({ report, hiddenFor, onDecide, onReverse }: Props) {
  const [shown, setShown] = useState(false)
  const [picking, setPicking] = useState<Outcome | null>(null)
  const [reversing, setReversing] = useState<PastDecision | null>(null)
  const [note, setNote] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const latest = report.history[0] ?? null
  const decided = latest !== null

  const run = (fn: () => Promise<void>) => {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        setPicking(null)
        setReversing(null)
        setNote('')
      } catch (e) {
        setError(e instanceof Error ? e.message : 'That did not go through.')
      }
    })
  }

  const pick = (outcome: Outcome, code: ReasonCode) => {
    if (reasonNeedsNote(code) && note.trim() === '') return
    run(() =>
      onDecide({
        reportId: report.reportId,
        outcome,
        reasonCode: code,
        reasonNote: note.trim() || undefined,
      }),
    )
  }

  return (
    <li
      data-testid="report-entry"
      data-report-id={report.reportId}
      data-decided={decided ? 'true' : 'false'}
      className="card p-4 flex flex-col gap-3"
    >
      <div>
        <p className="text-sm font-semibold text-[var(--color-fg)]">{report.groupName}</p>
        {/* Who posted it. Don's ruling of 2026-09-17: content posted to the
            platform is subject to review by the platform. Display name and
            handle — there is no legal_name column. */}
        <p className="text-xs text-[var(--color-fg-muted)]">
          {report.ownerDisplayName ?? 'Unknown member'}
          {report.ownerHandle ? ` · @${report.ownerHandle}` : ''}
        </p>
      </div>

      {report.category && (
        <p data-testid="report-category" className="text-sm font-medium text-[var(--color-fg)]">
          {categoryLabel(report.category)}
        </p>
      )}
      {report.reporter && (
        <p data-testid="reporter-record" className="text-xs text-[var(--color-fg-muted)]">
          {report.reporter.filed} filed · {report.reporter.upheld} upheld · {report.reporter.dismissed} dismissed · {report.reporter.open} open
        </p>
      )}
      <blockquote className="border-l-2 border-[var(--color-border)] pl-3 text-sm text-[var(--color-fg)]">
        {report.body}
      </blockquote>

      <p className="text-xs text-[var(--color-fg-muted)]">
        {report.removedAt
          ? report.subjectKind === 'post' ? 'Removed' : 'Photo removed'
          : hiddenFor
            ? `Hidden ${hiddenFor}`
            : 'Not hidden'}{' '}
        · reported {report.reportedAt.toISOString().slice(0, 10)}
      </p>

      {report.subjectKind === 'post' ? (
        <p data-testid="reported-post" className="whitespace-pre-wrap rounded-md bg-[var(--color-surface)] p-3 text-sm text-[var(--color-fg)]">
          {report.contentText}
        </p>
      ) : report.photoUrl ? (
        <div className="relative overflow-hidden rounded-md bg-[var(--color-surface)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={report.photoUrl}
            alt={shown ? 'The reported photo' : ''}
            data-testid="reported-photo"
            data-shown={shown ? 'true' : 'false'}
            className="w-full object-cover transition-[filter] duration-200"
            style={{ filter: shown ? 'none' : 'blur(24px)', maxHeight: '18rem' }}
          />
          {!shown ? (
            <button
              type="button"
              onClick={() => setShown(true)}
              data-testid="show-photo"
              className="press absolute inset-0 m-auto h-11 w-36 rounded-full bg-[var(--color-fg)]/85 text-sm font-medium text-white"
            >
              Show photo
            </button>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-[var(--color-fg-muted)]">This Page has no photo.</p>
      )}

      {/* What happened to this before, on the item. A reversal made blind is
          how two reviewers ping-pong. */}
      {report.history.length > 0 ? (
        <ol data-testid="decision-history" className="flex flex-col gap-1 list-none p-0 text-xs">
          {report.history.map((d) => (
            <li
              key={d.decisionId}
              data-testid="decision-row"
              data-outcome={d.outcome}
              className="flex flex-wrap items-center gap-x-2 text-[var(--color-fg-muted)]"
            >
              <span className="font-medium text-[var(--color-fg)]">
                {d.outcome === 'removed' ? 'Removed' : 'Restored'}
              </span>
              <span>{reasonLabel(d.reasonCode as ReasonCode)}</span>
              {d.reasonNote ? <span>· “{d.reasonNote}”</span> : null}
              <span>· {d.decidedByName ?? 'unknown'}</span>
              <span>· {d.decidedAt.toISOString().slice(0, 10)}</span>
              {d.reversesDecisionId ? <span>· reversal</span> : null}
              {/* Reversing is as easy as deciding — one tap, from here. */}
              {!d.alreadyReversed ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setReversing(d)}
                  data-testid={`reverse-${d.decisionId}`}
                  className="press underline text-[var(--color-fg)] disabled:opacity-50"
                >
                  Undo this
                </button>
              ) : (
                <span data-testid="already-reversed">· undone</span>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {reversing ? (
        <ReasonPicker
          testId="reverse-reasons"
          title={`Undo the ${reversing.outcome === 'removed' ? 'removal' : 'restore'} — why?`}
          outcome={reversing.outcome === 'removed' ? 'restored' : 'removed'}
          note={note}
          onNote={setNote}
          pending={pending}
          onCancel={() => {
            setReversing(null)
            setNote('')
          }}
          onPick={(code) => {
            if (reasonNeedsNote(code) && note.trim() === '') return
            run(() =>
              onReverse({
                decisionId: reversing.decisionId,
                reasonCode: code,
                reasonNote: note.trim() || undefined,
              }),
            )
          }}
        />
      ) : picking ? (
        <ReasonPicker
          testId={`reasons-${picking}`}
          title={picking === 'restored' ? 'Approve — why?' : 'Reject — why?'}
          outcome={picking}
          note={note}
          onNote={setNote}
          pending={pending}
          onCancel={() => {
            setPicking(null)
            setNote('')
          }}
          onPick={(code) => pick(picking, code)}
        />
      ) : (
        // Both buttons, side by side, equal weight. Neither is a confirm.
        <div className="flex gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => setPicking('restored')}
            data-testid="approve"
            className="btn-secondary w-full disabled:opacity-50"
          >
            {decided && latest?.outcome === 'restored' ? 'Approve again' : 'Approve'}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setPicking('removed')}
            data-testid="reject"
            className="press w-full rounded-md border border-[var(--color-border)] py-3 text-sm font-medium text-[var(--color-fg)] disabled:opacity-50"
          >
            {decided && latest?.outcome === 'removed' ? 'Reject again' : 'Reject'}
          </button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-sm text-[var(--color-fg)]">
          {error}
        </p>
      ) : null}
    </li>
  )
}

/** The preset list. One tap for the common case; free text for the rest. */
function ReasonPicker({
  testId,
  title,
  outcome,
  note,
  onNote,
  pending,
  onPick,
  onCancel,
}: {
  testId: string
  title: string
  outcome: Outcome
  note: string
  onNote: (v: string) => void
  pending: boolean
  onPick: (code: ReasonCode) => void
  onCancel: () => void
}) {
  const [needsNote, setNeedsNote] = useState<ReasonCode | null>(null)

  return (
    <div data-testid={testId} className="rounded-md bg-[var(--color-surface)] p-3 flex flex-col gap-2">
      <p className="text-xs font-semibold text-[var(--color-fg)]">{title}</p>
      {reasonsFor(outcome).map((r) => (
        <button
          key={r.code}
          type="button"
          disabled={pending}
          data-testid={`reason-${r.code}`}
          onClick={() => (reasonNeedsNote(r.code) ? setNeedsNote(r.code) : onPick(r.code))}
          className="press w-full rounded-lg bg-white py-2.5 text-left text-sm px-3 disabled:opacity-50"
        >
          {r.label}
        </button>
      ))}

      {needsNote ? (
        <>
          <textarea
            value={note}
            onChange={(e) => onNote(e.target.value)}
            data-testid="reason-note"
            aria-label="What happened?"
            placeholder="What happened? The member can be told this."
            className="input w-full text-sm"
            rows={3}
          />
          <button
            type="button"
            disabled={pending || note.trim() === ''}
            onClick={() => onPick(needsNote)}
            data-testid="reason-note-submit"
            className="btn-primary w-full disabled:opacity-50"
          >
            Use this reason
          </button>
        </>
      ) : null}

      <button type="button" onClick={onCancel} className="press text-xs underline self-start">
        Cancel
      </button>
    </div>
  )
}
