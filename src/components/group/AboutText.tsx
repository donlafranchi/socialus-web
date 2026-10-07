'use client'

// #458 — a long About is collapsed, with More to open it.

import { useState } from 'react'

const LONG = 280

export function AboutText({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  const long = text.length > LONG
  return (
    <div className="flex flex-col items-start gap-1">
      <p data-testid="page-about-text" className={`whitespace-pre-line text-body-sm text-[var(--color-fg)]${long && !open ? ' line-clamp-5' : ''}`}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="press inline-flex min-h-tap items-center text-body-sm font-semibold text-[var(--color-accent)] underline"
        >
          {open ? 'Less' : 'More'}
        </button>
      )}
    </div>
  )
}
