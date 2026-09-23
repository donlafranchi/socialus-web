'use client'

// T163 (#77) — the popup. A count and a message.
//
// "Keep it simple: a popup with a count and a message. Not a page, not a tab,
// not a new surface." That constraint is the shape of the ticket, not a detail
// of it, so this component is deliberately almost nothing: one number, one
// sentence, one button.
//
// NO PROGRESS BAR. It is named in the scenario's "Not this" alongside a
// leaderboard and a referral mechanic, and a bar is a promise about a journey
// — it implies a destination and a rate of travel, which is the same thing
// criterion 9 forbids the words from doing.
//
// The number is the combined one and the split never reaches this component:
// it is not passed in, so it cannot be rendered by accident.
//
// T168 (#194) — THE NUMBER IS NOW OPTIONAL, and omitted is a real case rather
// than a fallback. Ruled 2026-09-22 (#196): someone who left an email address
// without an account is shown no count at all, because any truthful live count
// makes "is this address already waiting?" answerable by differencing. A
// signed-in member still sees it — they are entitled to see themselves
// counted. Passing neither renders no number at all, not a zero and not a
// placeholder.

import { useEffect, useId, useRef } from 'react'

interface Props {
  metroName: string
  /** Omitted for an anonymous submitter — see the note above. */
  combined?: number
  target?: number
  message: string
  onClose: () => void
}

export function MetroStandingDialog({ metroName, combined, target, message, onClose }: Props) {
  // Both or neither. A half-supplied pair could only render something
  // misleading, and silently dropping one is how a count comes back by
  // accident.
  const showCount = typeof combined === 'number' && typeof target === 'number'
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [])

  return (
    <>
      <div aria-hidden="true" onClick={onClose} className="fixed inset-0 z-40 bg-black/30" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid="metro-standing-dialog"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onClose()
        }}
        className="fixed inset-x-4 top-1/2 z-50 -translate-y-1/2 rounded-2xl border border-[var(--color-charcoal-100)] bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.16)] md:left-1/2 md:right-auto md:w-96 md:-translate-x-1/2"
      >
        <h2 id={titleId} className="text-base font-semibold text-[var(--color-charcoal-900)]">
          {metroName}
        </h2>

        {showCount ? (
          <p
            data-testid="metro-standing-count"
            className="mt-4 text-3xl font-semibold text-[var(--color-charcoal-900)]"
          >
            {combined} <span className="text-base font-normal text-neutral-600">of {target}</span>
          </p>
        ) : null}

        <p className={`${showCount ? 'mt-3' : 'mt-4'} text-sm text-neutral-600`}>{message}</p>

        <button
          ref={closeRef}
          type="button"
          data-testid="metro-standing-close"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-[var(--color-charcoal-700)] py-3 text-sm font-semibold text-white"
        >
          Got it
        </button>
      </div>
    </>
  )
}
