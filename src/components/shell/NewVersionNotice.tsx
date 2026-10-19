'use client'

// #958 — a tab opened before a deploy calls server actions the new deploy no longer has (no skew protection on
// Hobby). When the tab comes back, compare the build it loaded with the live one and offer a reload, as Gmail,
// Slack and X do. A quiet line, never a chip.

import { useEffect, useRef, useState } from 'react'

const MIN_GAP_MS = 60_000

export function NewVersionNotice({ buildId }: { buildId: string }) {
  const [behind, setBehind] = useState(false)
  const lastAsked = useRef(0)

  useEffect(() => {
    if (!buildId || behind) return
    const check = async () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (lastAsked.current && now - lastAsked.current < MIN_GAP_MS) return
      lastAsked.current = now
      try {
        const res = await fetch('/api/version', { cache: 'no-store' })
        if (!res.ok) return
        const { id } = (await res.json()) as { id?: string }
        if (id && id !== buildId) setBehind(true)
      } catch {
        // Offline or mid-deploy: ask again next time the tab comes back.
      }
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('focus', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('focus', check)
    }
  }, [buildId, behind])

  if (!behind) return null
  return (
    <p
      role="status"
      className="fixed inset-x-0 top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-4 pb-1 pt-[max(0.25rem,env(safe-area-inset-top))] text-center text-body-sm text-[var(--color-fg)]"
    >
      A new version is ready ·{' '}
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex min-h-tap items-center font-semibold text-[var(--color-accent)] underline"
      >
        Refresh
      </button>
    </p>
  )
}
