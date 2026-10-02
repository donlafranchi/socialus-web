'use client'

// T160 (Issue #62) — the report sheet.
//
// Reuses the T115 bottom-sheet recipe unmodified: half-height, rounded top,
// backdrop, `aria-modal`, body scroll locked, Escape closes, Tab trapped,
// focus returned to whatever opened it. Nothing about the container is new
// here; only what is inside it.
//
// The copy is the ticket's, verbatim: "This goes to a person, not a queue."
// That sentence is the whole promise of F058 — the operator is a person on
// their phone, not a ticketing system — and it is why the sheet says it above
// the box rather than in a tooltip.

import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'

/** Matches the schema CHECK and report.create's own bound. */
const BODY_MAX_LENGTH = 2000

interface Props {
  open: boolean
  subjectLabel: string
  onClose: () => void
  onSend: (body: string) => Promise<void>
  /** Where focus goes when the sheet closes. Defaults to whatever was focused
   *  when it opened — which is wrong when the sheet is opened from a menu item
   *  that unmounts with its menu, so callers in that shape pass the control. */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}

export function ReportSheet({ open, subjectLabel, onClose, onSend, returnFocusTo }: Props) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const titleId = useId()
  const hintId = useId()

  useEffect(() => {
    if (!open) return
    setError(null)
    returnFocusRef.current =
      returnFocusTo?.current ?? (document.activeElement as HTMLElement | null)
    sheetRef.current?.querySelector<HTMLElement>('textarea')?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      returnFocusRef.current?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = Array.from(sheetRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (nodes.length === 0) return
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !sheetRef.current?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const submit = async () => {
    const trimmed = body.trim()
    // An empty report tells the operator nothing. Refused here as well as in
    // the handler, so the member is told before the round trip.
    if (trimmed.length === 0 || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(trimmed)
      setBody('')
    } catch (err) {
      // The words stay in the box. Being asked to retype a report of something
      // upsetting is its own small harm.
      setError(err instanceof Error ? err.message : 'That did not send. Try again?')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div
        data-testid="report-sheet-backdrop"
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/30"
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        data-testid="report-sheet"
        className="fixed inset-x-0 bottom-0 z-50 flex max-h-[70vh] flex-col rounded-t-lg border-t border-[var(--color-charcoal-100)] bg-white shadow-bar md:inset-x-auto md:left-1/2 md:top-24 md:bottom-auto md:w-[28rem] md:-translate-x-1/2 md:rounded-lg md:border"
      >
        <header className="flex items-center gap-2 border-b border-[var(--color-charcoal-100)] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-ml-2 inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
          >
            <X size={18} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="text-base font-semibold text-[var(--color-charcoal-900)]">
            Report {subjectLabel}
          </h2>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p id={hintId} className="text-sm text-[var(--color-charcoal-900)]">
            This goes to a person, not a queue.
          </p>

          <label htmlFor={`${titleId}-body`} className="mt-4 block text-sm font-medium text-[var(--color-charcoal-900)]">
            What&rsquo;s wrong?
          </label>
          <textarea
            id={`${titleId}-body`}
            value={body}
            maxLength={BODY_MAX_LENGTH}
            rows={5}
            onChange={(e) => setBody(e.target.value)}
            placeholder="In your own words."
            className="mt-2 w-full rounded-md border border-[var(--color-control-border)] p-3 text-sm text-[var(--color-charcoal-900)]"
          />

          {error && (
            <p role="alert" className="mt-2 text-sm text-[var(--color-charcoal-900)]">
              {error}
            </p>
          )}
        </div>

        <footer
          className="border-t border-[var(--color-charcoal-100)] px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={submit}
            disabled={sending || body.trim().length === 0}
            className="w-full rounded-full bg-[var(--color-charcoal-700)] py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </footer>
      </div>
    </>
  )
}
