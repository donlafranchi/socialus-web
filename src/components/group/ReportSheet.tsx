'use client'

// T160 (Issue #62) — the report sheet.
//
// The container is the one Sheet (#297): modal, Escape and the backdrop close
// it, Tab stays in, focus goes back to what opened it. Only what is inside is
// this file's.
//
// The copy is the ticket's, verbatim: "This goes to a person, not a queue."
// That sentence is the whole promise of F058 — the operator is a person on
// their phone, not a ticketing system — and it is why the sheet says it above
// the box rather than in a tooltip.

import { useEffect, useId, useState } from 'react'
import { Sheet } from '@/components/ui/Sheet'
import { Button } from '@/components/ui/Button'
import { COPY } from '@/lib/copy'
import { REPORT_CATEGORIES, type ReportCategory } from '@/lib/reports/categories'

/** Matches the schema CHECK and report.create's own bound. */
const BODY_MAX_LENGTH = 2000

interface Props {
  open: boolean
  subjectLabel: string
  onClose: () => void
  onSend: (category: ReportCategory, body: string) => Promise<void>
  /** Where focus goes when the sheet closes. Defaults to whatever was focused
   *  when it opened — which is wrong when the sheet is opened from a menu item
   *  that unmounts with its menu, so callers in that shape pass the control. */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}

export function ReportSheet({ open, subjectLabel, onClose, onSend, returnFocusTo }: Props) {
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const submit = async () => {
    const trimmed = body.trim()
    // An empty report tells the operator nothing. Refused here as well as in
    // the handler, so the member is told before the round trip.
    if (trimmed.length === 0 || !category || sending) return
    setSending(true)
    setError(null)
    try {
      await onSend(category, trimmed)
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
    <Sheet
      open={open}
      title={`Report ${subjectLabel}`}
      onClose={onClose}
      testId="report-sheet"
      description="This goes to a person, not a queue."
      returnFocusTo={returnFocusTo}
      footer={
        <Button onClick={submit} disabled={sending || body.trim().length === 0 || !category} className="w-full">
          {sending ? 'Sending…' : 'Send'}
        </Button>
      }
    >
      {/* F078 criterion 9 — no report without a reason the reporter chose. */}
      <fieldset>
        <legend className="text-sm font-medium text-[var(--color-charcoal-900)]">Why are you reporting this?</legend>
        <div className="mt-2 space-y-1">
          {REPORT_CATEGORIES.map((c) => (
            <label key={c.value} className="flex min-h-11 items-center gap-3 text-sm text-[var(--color-charcoal-900)]">
              <input
                type="radio"
                name={`${fieldId}-category`}
                value={c.value}
                checked={category === c.value}
                onChange={() => setCategory(c.value)}
                className="h-4 w-4 shrink-0 accent-[var(--color-charcoal-700)]"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>
      {category === 'threat_of_harm' && (
        <p data-testid="report-911" role="note" className="mt-3 rounded-md bg-[var(--color-surface)] p-3 text-sm text-[var(--color-fg)]">
          {COPY.report911}
        </p>
      )}
      <label htmlFor={fieldId} className="mt-4 block text-sm font-medium text-[var(--color-charcoal-900)]">
        What&rsquo;s wrong?
      </label>
      <textarea
        id={fieldId}
        data-autofocus
        value={body}
        maxLength={BODY_MAX_LENGTH}
        rows={5}
        onChange={(e) => setBody(e.target.value)}
        placeholder="In your own words."
        className="mt-2 w-full rounded-md border border-[var(--color-control-border)] p-3 text-sm text-[var(--color-charcoal-900)]"
      />
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </Sheet>
  )
}
