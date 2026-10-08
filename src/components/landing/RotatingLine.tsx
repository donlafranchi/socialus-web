'use client'

import { useEffect, useState } from 'react'

// One blank, filled in turn. aria-live is off on purpose: a screen reader
// hears the first item and is not interrupted every few seconds.
export function RotatingLine({ prefix, items, intervalMs = 2600 }: { prefix: string; items: readonly string[]; intervalMs?: number }) {
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(true)

  useEffect(() => {
    if (items.length < 2) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => {
      setShown(false)
      setTimeout(() => {
        setI((n) => (n + 1) % items.length)
        setShown(true)
      }, 220)
    }, intervalMs)
    return () => clearInterval(t)
  }, [items.length, intervalMs])

  return (
    <p className="text-title-2 md:text-display text-[var(--color-on-frame)]">
      {prefix}{' '}
      <span
        data-testid="rotating-item"
        className={`inline-block text-[var(--color-highlight-soft)] transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
      >
        {items[i]}.
      </span>
    </p>
  )
}
