'use client'

// F101 / #304 — one scannable page of reported subjects, cleared in one tap or
// one swipe each (L22, T4 Manage). Precedent: Reddit's mod queue (Approve /
// Remove), Gmail's swipe actions and five-second Undo, Meta's severity-ordered
// review and blur-until-chosen images.
//
// UNDO WRITES NOTHING (criterion 8). A decision waits five seconds in this
// component before it reaches the server, so an undone one never becomes a
// decision row and the member is told nothing. A second decision inside the
// window sends the first at once, as Gmail does. Reversal later is unchanged:
// the row's detail carries each report's history and its Undo.

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronDown, X } from 'lucide-react'
import { Toast } from '@/components/Toast'
import { buttonClass } from '@/components/ui/Button'
import { hiddenFor } from '@/lib/admin/reports-queue'
import { DEFAULT_REASON, blurred, orderSubjects, type ReviewSubject, type SortKey } from '@/lib/admin/review-subjects'
import type { Outcome, ReasonCode } from '@/lib/admin/reason-codes'
import { ReportEntry } from './ReportEntry'

type Decide = (input: { reportId: string; outcome: Outcome; reasonCode: ReasonCode; reasonNote?: string }) => Promise<void>
type Reverse = (input: { decisionId: string; reasonCode: ReasonCode; reasonNote?: string }) => Promise<void>

const UNDO_MS = 5000
const SWIPE_PX = 96
const WORD: Record<Outcome, string> = { restored: 'Approve', removed: 'Remove' }

interface Pending {
  subject: ReviewSubject
  outcome: Outcome
}

export function ReviewQueue({ subjects, onDecide, onReverse }: { subjects: ReviewSubject[]; onDecide: Decide; onReverse: Reverse }) {
  const router = useRouter()
  const [sort, setSort] = useState<SortKey>('severity')
  const [showAll, setShowAll] = useState(false)
  const [done, setDone] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<Pending | null>(null)
  const pendingRef = useRef<Pending | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [focus, setFocus] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  const waiting = (s: ReviewSubject) => s.openReportIds.length > 0 && !done.has(s.subjectId)
  const rows = orderSubjects(subjects, sort).filter((s) => showAll || waiting(s))
  const waitingCount = subjects.filter(waiting).length

  const send = useCallback(
    async (p: Pending) => {
      try {
        for (const reportId of p.subject.openReportIds) {
          await onDecide({ reportId, outcome: p.outcome, reasonCode: DEFAULT_REASON[p.outcome] })
        }
        router.refresh()
      } catch (err) {
        setDone((d) => {
          const n = new Set(d)
          n.delete(p.subject.subjectId)
          return n
        })
        setError(err instanceof Error ? err.message : "That didn't go through. Try again?")
      }
    },
    [onDecide, router],
  )

  const commit = useCallback(() => {
    const p = pendingRef.current
    pendingRef.current = null
    setPending(null)
    if (p) void send(p)
  }, [send])

  const decide = (s: ReviewSubject, outcome: Outcome) => {
    if (!waiting(s)) return
    if (outcome === 'restored' && s.severity === 1 && confirming !== s.subjectId) return setConfirming(s.subjectId)
    setConfirming(null)
    setError(null)
    if (pendingRef.current) commit()
    const p = { subject: s, outcome }
    pendingRef.current = p
    setPending(p)
    setDone((d) => new Set(d).add(s.subjectId))
  }

  const undo = useCallback(() => {
    const p = pendingRef.current
    if (!p) return
    pendingRef.current = null
    setPending(null)
    setDone((d) => {
      const n = new Set(d)
      n.delete(p.subject.subjectId)
      return n
    })
  }, [])

  // Criterion 14: A approves, R removes, J/K move, U undoes.
  const current = rows[Math.min(focus, rows.length - 1)]
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target
      if (e.metaKey || e.ctrlKey || e.altKey || (el instanceof Element && el.closest('input, textarea, select, [contenteditable]'))) return
      const k = e.key.toLowerCase()
      if (k === 'j') setFocus((f) => Math.min(f + 1, rows.length - 1))
      else if (k === 'k') setFocus((f) => Math.max(f - 1, 0))
      else if (k === 'u') undo()
      else if ((k === 'a' || k === 'r') && current) decide(current, k === 'a' ? 'restored' : 'removed')
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const bySeverity = [1, 2, 3, 4].map((n) => subjects.filter((s) => waiting(s) && s.severity === n).length)

  return (
    <div>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title-1 text-[var(--color-fg)]">Posts</h1>
          <p className="mt-1 text-body-sm text-[var(--color-fg-muted)]" data-testid="review-waiting">
            {waitingCount === 0 ? 'Nothing waiting.' : `${waitingCount} waiting`}
            {bySeverity.some(Boolean) && ` · ${bySeverity.map((n, i) => (n ? `${n} severity ${i + 1}` : '')).filter(Boolean).join(', ')}`}
          </p>
        </div>
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="review-sort">Sort</label>
          <select id="review-sort" data-testid="review-sort" className="input w-auto py-1.5" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="severity">Most serious</option>
            <option value="age">Oldest</option>
            <option value="count">Most reports</option>
          </select>
          <label className="sr-only" htmlFor="review-filter">Show</label>
          <select
            id="review-filter"
            data-testid="review-filter"
            className="input w-auto py-1.5"
            value={showAll ? 'all' : 'waiting'}
            onChange={(e) => setShowAll(e.target.value === 'all')}
          >
            <option value="waiting">Waiting</option>
            <option value="all">All</option>
          </select>
        </div>
      </header>

      {error && (
        <p role="alert" className="mt-3 text-body-sm text-[var(--color-danger,#b00)]">
          {error}
        </p>
      )}

      <ul className="mt-4 flex list-none flex-col gap-3 p-0" data-testid="review-rows">
        {rows.map((s, i) => (
          <Row
            key={s.subjectId}
            subject={s}
            now={now}
            focused={i === Math.min(focus, rows.length - 1)}
            isWaiting={waiting(s)}
            confirming={confirming === s.subjectId}
            expanded={open === s.subjectId}
            onToggle={() => setOpen(open === s.subjectId ? null : s.subjectId)}
            onDecide={(o) => decide(s, o)}
            onCancelConfirm={() => setConfirming(null)}
            detail={s.reports.map((r) => (
              <ReportEntry key={r.reportId} report={r} hiddenFor={hiddenFor(r.hiddenAt, now)} onDecide={onDecide} onReverse={onReverse} />
            ))}
          />
        ))}
      </ul>

      <Toast
        key={pending?.subject.subjectId ?? 'none'}
        visible={pending !== null}
        duration={UNDO_MS}
        message={pending ? `${pending.outcome === 'restored' ? 'Approved' : 'Removed'} · ${pending.subject.name}` : ''}
        onHide={commit}
        action={{ label: 'Undo', onClick: undo }}
      />
    </div>
  )
}

function Row({
  subject: s,
  now,
  focused,
  isWaiting,
  confirming,
  expanded,
  onToggle,
  onDecide,
  onCancelConfirm,
  detail,
}: {
  subject: ReviewSubject
  now: Date
  focused: boolean
  isWaiting: boolean
  confirming: boolean
  expanded: boolean
  onToggle: () => void
  onDecide: (o: Outcome) => void
  onCancelConfirm: () => void
  detail: React.ReactNode
}) {
  const [dx, setDx] = useState(0)
  const start = useRef<number | null>(null)
  const [peek, setPeek] = useState(false)
  const first = s.reports[0]
  const excerpt = first ? (first.body.length > 120 ? `${first.body.slice(0, 119)}…` : first.body) : ''
  const age = hiddenFor(s.hiddenAt, now)

  const down = (e: ReactPointerEvent) => {
    if (!isWaiting || (e.target as HTMLElement).closest('button, a, select')) return
    start.current = e.clientX
  }
  const move = (e: ReactPointerEvent) => {
    if (start.current !== null) setDx(e.clientX - start.current)
  }
  const up = () => {
    if (start.current === null) return
    start.current = null
    if (dx > SWIPE_PX) onDecide('restored')
    else if (dx < -SWIPE_PX) onDecide('removed')
    setDx(0)
  }

  return (
    <li
      data-testid="review-row"
      data-subject={s.subjectId}
      data-focused={focused ? 'true' : undefined}
      className={`relative overflow-hidden rounded-lg border ${focused ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]'}`}
    >
      {/* What the swipe will do, revealed under the row as it moves (criterion 6). */}
      {dx !== 0 && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center px-4 text-body-sm font-semibold text-white ${
            dx > 0 ? 'justify-start bg-[var(--color-success,#1e7a46)]' : 'justify-end bg-[var(--color-danger,#b42318)]'
          }`}
        >
          {dx > 0 ? WORD.restored : WORD.removed}
        </div>
      )}
      <div
        className="relative touch-pan-y bg-[var(--color-bg)] p-3"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
      >
        <div className="flex gap-3">
          {s.photoUrl ? (
            <button
              type="button"
              aria-label={blurred(s) ? 'Press and hold to see the photo' : 'Photo'}
              data-testid="review-thumb"
              data-blurred={blurred(s) && !peek ? 'true' : 'false'}
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              className="size-16 shrink-0 overflow-hidden rounded-md bg-[var(--color-surface)]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.photoUrl} alt="" className={`size-full object-cover ${blurred(s) && !peek ? 'blur-lg' : ''}`} />
            </button>
          ) : (
            <div className="size-16 shrink-0 rounded-md bg-[var(--color-surface)]" />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-body-sm font-semibold text-[var(--color-fg)]">{s.name}</p>
              {s.severity && (
                <span data-testid="review-severity" className="shrink-0 rounded-sm border border-[var(--color-border)] px-1.5 text-caption text-[var(--color-fg)]">
                  Severity {s.severity}
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-2 text-body-sm text-[var(--color-fg)]">{excerpt}</p>
            <p className="mt-1 text-caption text-[var(--color-fg-muted)]">
              {s.reports.length} report{s.reports.length === 1 ? '' : 's'} · Page photo · {isWaiting ? (s.status === 'removed' ? 'Removed' : 'Hidden') : 'Decided'}
              {age ? ` · hidden ${age}` : ''}
            </p>
          </div>
        </div>

        {isWaiting &&
          (confirming ? (
            <div className="mt-3 flex flex-col gap-2" data-testid="review-confirm">
              <p className="text-body-sm text-[var(--color-fg)]">Approve something reported as the most serious kind?</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className={`${buttonClass('secondary')} min-h-12`} onClick={onCancelConfirm}>
                  Not yet
                </button>
                <button type="button" className={`${buttonClass('secondary')} min-h-12`} onClick={() => onDecide('restored')}>
                  Approve
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" data-testid="review-approve" className={`${buttonClass('secondary')} min-h-12`} onClick={() => onDecide('restored')}>
                <Check size={16} aria-hidden="true" />
                Approve
              </button>
              <button type="button" data-testid="review-remove" className={`${buttonClass('secondary')} min-h-12`} onClick={() => onDecide('removed')}>
                <X size={16} aria-hidden="true" />
                Remove
              </button>
            </div>
          ))}

        <button
          type="button"
          data-testid="review-details"
          aria-expanded={expanded}
          onClick={onToggle}
          className="press mt-2 inline-flex min-h-tap items-center gap-1 text-caption font-medium text-[var(--color-fg-muted)]"
        >
          History and reasons
          <ChevronDown size={14} aria-hidden="true" className={expanded ? 'rotate-180' : ''} />
        </button>
      </div>
      {expanded && (
        <ul className="flex list-none flex-col gap-3 border-t border-[var(--color-border)] p-3" data-testid="review-detail">
          {detail}
        </ul>
      )}
    </li>
  )
}
