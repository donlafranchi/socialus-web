'use client'

// #892 — the member's interests on You. Each tap saves as it goes; a failed save puts the choice back.
// Only they see these (owner-only RLS); Explore's "My interests" filter reads them.

import { useState } from 'react'
import { InterestChoices } from './InterestChoices'

type Result = { ok: true } | { ok: false; message: string }

export function YouInterests({ chosen, onSet }: { chosen: string[]; onSet: (tag: string, on: boolean) => Promise<Result> }) {
  const [selected, setSelected] = useState(chosen)
  const [error, setError] = useState<string | null>(null)

  const toggle = async (tag: string) => {
    const on = !selected.includes(tag)
    const flip = (want: boolean) => setSelected((s) => (want ? [...s.filter((t) => t !== tag), tag] : s.filter((t) => t !== tag)))
    flip(on)
    setError(null)
    let r: Result
    try {
      r = await onSet(tag, on)
    } catch {
      r = { ok: false, message: 'That didn’t save. Try again.' }
    }
    if (!r.ok) {
      flip(!on)
      setError(r.message)
    }
  }

  return (
    <div data-testid="you-interests">
      <InterestChoices selected={selected} onToggle={toggle} label="Your interests" />
      {error && (
        <p role="alert" className="mt-2 text-body-sm text-[var(--color-danger,#b00)]">
          {error}
        </p>
      )}
    </div>
  )
}
