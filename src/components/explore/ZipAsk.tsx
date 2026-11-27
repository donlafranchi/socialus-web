'use client'

// F081 (the PM, 2026-11-25) — a visitor names their area by zip. One field, one button; a refusal is said in
// place. Draft copy (human-review). Precedents: Zillow, Home Depot and Eventbrite ask a zip to set "your area".

import { useId, useState } from 'react'

export function ZipAsk({
  label,
  onSubmit,
}: {
  /** What the field asks, in a sentence. */
  label: string
  /** Resolves to an error line, or null when the zip was taken. */
  onSubmit: (zip: string) => Promise<string | null>
}) {
  const id = useId()
  const [zip, setZip] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <form
      data-testid="zip-ask"
      className="flex flex-wrap items-center gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        setError(await onSubmit(zip.trim()))
        setBusy(false)
      }}
    >
      <label htmlFor={id} className="text-neutral-600">
        {label}
      </label>
      <input
        id={id}
        name="zip"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        pattern="[0-9]{5}"
        value={zip}
        onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
        className="min-h-11 w-24 rounded-md border border-neutral-300 px-2"
      />
      <button
        type="submit"
        disabled={busy}
        className="press inline-flex min-h-11 min-w-tap items-center justify-center px-2 font-medium text-[var(--color-charcoal-900)] underline underline-offset-4"
      >
        Go
      </button>
      {error && (
        <p role="alert" className="w-full text-[var(--color-fg)]">
          {error}
        </p>
      )}
    </form>
  )
}
