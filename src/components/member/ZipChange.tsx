'use client'

// #568 (F081.4) — the member's own zip on /you, and a way to change it: their area follows. Only they see it.

import { useState } from 'react'

type Result = { ok: true; marketName: string; open: boolean } | { ok: false; message: string }

export function ZipChange({ zip: initial, area, change }: { zip: string | null; area: string | null; change: (zip: string) => Promise<Result> }) {
  const [zip, setZip] = useState(initial ?? '')
  const [shownArea, setShownArea] = useState(area)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  const save = async () => {
    if (!/^\d{5}$/.test(draft) || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await change(draft)
      if (!r.ok) {
        setError(r.message)
        return
      }
      setZip(draft)
      setShownArea(r.marketName)
      setResult(r.open ? `You’re in ${r.marketName}.` : `SocialUs isn’t in ${r.marketName} yet. We’ll tell you when it opens.`)
      setEditing(false)
    } catch {
      setError("That didn't go through. Mind trying again?")
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3">
        <span data-testid="zip-current" className="min-w-0 flex-1 truncate text-body-sm text-[var(--color-fg)]">
          {zip || 'Not set'}
          {shownArea ? ` · ${shownArea}` : ''}
        </span>
        <button
          type="button"
          className="press inline-flex min-h-tap items-center text-body-sm font-medium text-[var(--color-accent)]"
          onClick={() => {
            setDraft(zip)
            setEditing(true)
            setResult(null)
          }}
        >
          Change zip
        </button>
        {result && (
          <span role="status" data-testid="zip-result" className="basis-full pb-1 text-caption text-[var(--color-fg-muted)]">
            {result}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 py-1">
      <label className="sr-only" htmlFor="zip-input">
        Zip
      </label>
      <input
        id="zip-input"
        className="input w-28 text-body-sm"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={5}
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      />
      <button type="button" className="btn-primary min-h-tap" disabled={!/^\d{5}$/.test(draft) || busy} onClick={save}>
        {busy ? 'Saving…' : 'Save'}
      </button>
      <button type="button" className="btn-secondary min-h-tap" onClick={() => { setEditing(false); setError(null) }}>
        Cancel
      </button>
      {error && (
        <span role="alert" className="basis-full text-caption text-[var(--color-danger)]">
          {error}
        </span>
      )}
    </span>
  )
}
