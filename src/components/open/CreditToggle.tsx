'use client'

// F118 criterion 2 — your first name shows among the people opening your town; one tap hides it.

import { useState } from 'react'
import { setCreditHiddenAction } from '@/app/_actions/open-actions'

export function CreditToggle({ townSlug, hidden: initial }: { townSlug: string; hidden: boolean }) {
  const [hidden, setHidden] = useState(initial)
  const [busy, setBusy] = useState(false)
  async function flip() {
    setBusy(true)
    const r = await setCreditHiddenAction(townSlug, !hidden)
    setBusy(false)
    if (r.ok) setHidden(!hidden)
  }
  return (
    <label className="mt-3 flex items-center gap-2 text-body-sm text-[var(--color-fg-muted)]">
      <input type="checkbox" checked={!hidden} disabled={busy} onChange={flip} className="h-4 w-4" />
      Show my first name here
    </label>
  )
}
