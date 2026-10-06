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
  const fieldId = useId()

  useEffect(() => {
    if (open) setError(null)
  }, [open])

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
    <Sheet
      open={open}
      title={`Report ${subjectLabel}`}
      onClose={onClose}
      testId="report-sheet"
      description="This goes to a person, not a queue."
      returnFocusTo={returnFocusTo}
      footer={
        <Button onClick={submit} disabled={sending || body.trim().length === 0} className="w-full">
          {sending ? 'Sending…' : 'Send'}
        </Button>
      }
    >
      <label htmlFor={fieldId} className="block text-sm font-medium text-[var(--color-charcoal-900)]">
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
