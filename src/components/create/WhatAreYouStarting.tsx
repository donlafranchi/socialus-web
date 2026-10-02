'use client'

// #301 — L10. Create asks one thing, the kind, then makes the draft and lands
// on it; everything else is added on the draft Page. Copy is the design's
// placeholder ([public-is-draft]).

import { useState } from 'react'
import { Button } from '@/components/ui/Button'

export type StartKind = 'business' | 'practice' | 'interest'

const OPTIONS: { kind: StartKind; title: string; body: string }[] = [
  {
    kind: 'business',
    title: 'Opening a shop',
    body: 'For selling things you make, grow or carry. Comes with Following and Announcements.',
  },
  {
    kind: 'practice',
    title: 'Offering a service',
    body: 'For work you do for people, paid or free. Comes with Following and Announcements.',
  },
  {
    kind: 'interest',
    title: 'Creating a group for meetups',
    body: 'For people who get together, once or often. Comes with Joining, Events and Announcements.',
  },
]

export function WhatAreYouStarting({ onStart }: { onStart: (kind: StartKind) => Promise<void> }) {
  const [kind, setKind] = useState<StartKind | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const start = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!kind || busy) return
    setBusy(true)
    setError(null)
    try {
      await onStart(kind)
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again?")
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto w-full max-w-form gutter py-8 pb-nav">
      <form onSubmit={start} className="flex flex-col gap-4">
        <h1 className="text-title-1 text-[var(--color-fg)]">What are you starting?</h1>
        <p className="text-body-sm text-[var(--color-fg-muted)]">
          This just gets things started. Next you&rsquo;ll add a name, where it is and anything else people should
          know. Nothing is public until you publish.
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">What are you starting?</legend>
          {OPTIONS.map((o) => (
            <label
              key={o.kind}
              className={`flex cursor-pointer gap-3 rounded-md border p-4 ${
                kind === o.kind ? 'border-[var(--color-charcoal-700)]' : 'border-[var(--color-border)]'
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={o.kind}
                checked={kind === o.kind}
                onChange={() => setKind(o.kind)}
                aria-describedby={`start-${o.kind}`}
                className="mt-1 h-4 w-4"
              />
              <span>
                <span className="block text-body-sm font-semibold text-[var(--color-fg)]">{o.title}</span>
                <span id={`start-${o.kind}`} className="block text-caption text-[var(--color-fg-muted)]">
                  {o.body}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <p className="text-caption text-[var(--color-fg-muted)]">You can add or turn off any of these later.</p>
        {error && (
          <p role="alert" className="text-body-sm text-[var(--color-fg)]">
            {error}
          </p>
        )}
        <Button type="submit" disabled={!kind || busy}>
          Start
        </Button>
      </form>
    </main>
  )
}
