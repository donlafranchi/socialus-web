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

import { Sheet } from '@/components/ui/Sheet'

interface Props {
  metroName: string
  /** Omitted for an anonymous submitter — see the note above. */
  combined?: number
  target?: number
  message: string
  onClose: () => void
}

// #299 — L05, on the shared sheet.
export function MetroStandingDialog({ metroName, combined, target, message, onClose }: Props) {
  const showCount = typeof combined === 'number' && typeof target === 'number'

  return (
    <Sheet
      open
      title={metroName}
      onClose={onClose}
      testId="metro-standing-dialog"
      footer={
        <button
          type="button"
          data-testid="metro-standing-close"
          data-autofocus
          onClick={onClose}
          className="w-full rounded-full bg-[var(--color-charcoal-700)] py-3 text-body-sm font-semibold text-white"
        >
          Got it
        </button>
      }
    >
      {showCount ? (
        <p data-testid="metro-standing-count" className="text-display text-[var(--color-charcoal-900)]">
          {combined} <span className="text-body font-normal text-neutral-600">of {target}</span>
        </p>
      ) : null}
      <p className={`${showCount ? 'mt-3' : ''} text-body-sm text-neutral-600`}>{message}</p>
    </Sheet>
  )
}
