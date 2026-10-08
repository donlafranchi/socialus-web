'use client'

// #443 — one box, one button. All copy is a placeholder ([public-is-draft]).

import { useState } from 'react'
import type { ReportProblemResult } from './actions'

export function ReportProblemForm({
  route,
  onSubmit,
}: {
  route: string
  onSubmit: (input: { description: string; route: string; website: string }) => Promise<ReportProblemResult>
}) {
  const [text, setText] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (sent) {
    return (
      <p data-testid="report-thanks" role="status" className="text-body text-[var(--color-fg)]">
        Thanks. We got your report.
      </p>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    const description = text.trim()
    if (!description) {
      setError('Tell us what went wrong.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      const res = await onSubmit({ description, route, website })
      if (res.ok) setSent(true)
      else setError(res.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form data-testid="report-form" onSubmit={submit} noValidate className="space-y-3">
      <label htmlFor="report-text" className="block text-body-sm text-[var(--color-fg)]">
        What went wrong?
      </label>
      <textarea
        id="report-text"
        className="input min-h-32 w-full"
        maxLength={2000}
        value={text}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          setText(e.target.value)
          setError(null)
        }}
      />
      {/* A field only a bot fills in. */}
      <input
        aria-hidden="true"
        tabIndex={-1}
        autoComplete="off"
        name="website"
        value={website}
        onChange={(e) => setWebsite(e.target.value)}
        className="sr-only"
      />
      {error && (
        <p role="alert" className="text-body-sm text-[var(--color-danger,#b00)]">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary min-h-11 w-full disabled:opacity-75">
        Send
      </button>
    </form>
  )
}
