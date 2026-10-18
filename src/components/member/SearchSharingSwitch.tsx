'use client'

// #909 — You → Settings → Searches. On by default (F113 option C); off and this member's Explore searches are
// never counted. Saves on the tap; a failed save puts the switch back.

import { useState } from 'react'

/** Member-facing copy. Draft, pending the PM's tone look ([public-is-draft]). */
export const SEARCH_SHARING_COPY = {
  label: 'Count my searches',
  line: 'Count what I search, without my name, so local businesses see what people look for.',
  failed: "That didn't go through. Mind trying again?",
}

export function SearchSharingSwitch({ on: initial, change }: { on: boolean; change: (on: boolean) => Promise<{ ok: boolean }> }) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const flip = async (next: boolean) => {
    if (busy) return
    setBusy(true)
    setError(false)
    setOn(next)
    try {
      const r = await change(next)
      if (!r.ok) throw new Error('not saved')
    } catch {
      setOn(!next)
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="flex min-w-0 flex-1 flex-col py-1">
      <label className="flex min-h-tap cursor-pointer items-center justify-between gap-3">
        <span className="min-w-0 text-body-sm text-[var(--color-fg)]">{SEARCH_SHARING_COPY.line}</span>
        <input
          type="checkbox"
          role="switch"
          aria-label={SEARCH_SHARING_COPY.label}
          data-testid="search-sharing-switch"
          className="h-5 w-5 shrink-0"
          checked={on}
          disabled={busy}
          onChange={(e) => void flip(e.target.checked)}
        />
      </label>
      {error && (
        <span role="alert" className="text-caption text-[var(--color-fg)]">
          {SEARCH_SHARING_COPY.failed}
        </span>
      )}
    </span>
  )
}
