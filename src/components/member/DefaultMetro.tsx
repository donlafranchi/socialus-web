'use client'

// #330 — the You page's "default metro". The Explore pill opens on it.

import { useState, useTransition } from 'react'

export interface MetroOption {
  id: string
  slug: string
  name: string
}

export function DefaultMetro({
  metros,
  currentId,
  onSave,
}: {
  metros: readonly MetroOption[]
  currentId: string | null
  onSave: (slug: string) => Promise<{ ok: boolean }>
}) {
  const initial = metros.find((m) => m.id === currentId) ?? metros[0]
  const [slug, setSlug] = useState(initial?.slug ?? '')
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed'>('idle')
  const [, start] = useTransition()

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <select
        aria-label="Default metro"
        data-testid="default-metro"
        value={slug}
        onChange={(e) => {
          const next = e.target.value
          setSlug(next)
          setStatus('idle')
          start(async () => setStatus((await onSave(next)).ok ? 'saved' : 'failed'))
        }}
        className="input min-w-0 flex-1 truncate text-body-sm"
      >
        {metros.map((m) => (
          <option key={m.id} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
      <span role="status" className="shrink-0 text-caption text-[var(--color-fg-muted)]">
        {status === 'saved' ? 'Saved' : status === 'failed' ? 'Couldn’t save. Try again.' : ''}
      </span>
    </span>
  )
}
