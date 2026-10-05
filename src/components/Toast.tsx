'use client'

// #297 — the one toast (L25): bottom-centre, above the bottom nav and the
// safe area, with an optional single action such as Undo.

import { useEffect } from 'react'

interface ToastProps {
  message: string
  visible: boolean
  onHide: () => void
  duration?: number
  action?: { label: string; onClick: () => void }
}

export function Toast({ message, visible, onHide, duration = 3000, action }: ToastProps) {
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(onHide, duration)
    return () => clearTimeout(timer)
  }, [visible, onHide, duration])

  if (!visible) return null

  return (
    <div
      role="status"
      data-testid="toast"
      className="fixed bottom-[var(--float-offset)] left-1/2 z-[var(--z-toast)] flex -translate-x-1/2 items-center gap-3 rounded-xl bg-zinc-800 px-4 py-2 text-body-sm text-white shadow-overlay md:bottom-6"
    >
      <span>{message}</span>
      {action && (
        <button
          type="button"
          onClick={() => {
            action.onClick()
            onHide()
          }}
          className="min-h-tap font-semibold underline"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
