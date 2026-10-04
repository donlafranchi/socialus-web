'use client'

// #297 — the one sheet. A bottom sheet on phone; a centred dialog from 744
// (md). Modal: focus moves in, Tab stays in, Escape and the backdrop close
// it, and focus goes back to what opened it. `aria-modal` also pauses the
// bottom nav (useOverlayOpen).

import { useEffect, useId, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE =
  'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'

export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
  description,
  testId,
  backdropTestId,
  headerAction,
  closeLabel = 'Close',
  returnFocusTo,
}: {
  open: boolean
  title: ReactNode
  onClose: () => void
  children: ReactNode
  /** Pinned under the content: the sheet's one primary action. */
  footer?: ReactNode
  description?: ReactNode
  testId?: string
  /** Defaults to `${testId}-backdrop`. */
  backdropTestId?: string
  /** One secondary control at the header's end, e.g. "Clear all". */
  headerAction?: ReactNode
  closeLabel?: string
  /** When the opener unmounts with the sheet (a menu item), pass the control. */
  returnFocusTo?: React.RefObject<HTMLElement | null>
}) {
  const panel = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    if (!open) return
    const opener = returnFocusTo?.current ?? (document.activeElement as HTMLElement | null)
    const first = panel.current?.querySelector<HTMLElement>(
      '[data-autofocus], input:not([disabled]), textarea, select',
    )
    ;(first ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
      opener?.focus?.()
    }
  }, [open, returnFocusTo])

  if (!open) return null

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
    if (nodes.length === 0) return
    const first = nodes[0]!
    const last = nodes[nodes.length - 1]!
    const active = document.activeElement
    if (e.shiftKey && (active === first || !panel.current?.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && active === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="fixed inset-0 z-[var(--z-sheet)]">
      <div
        data-testid={backdropTestId ?? (testId ? `${testId}-backdrop` : undefined)}
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-black/30"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        data-testid={testId}
        onKeyDown={onKeyDown}
        className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-lg bg-white shadow-bar md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-form md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:shadow-overlay"
      >
        <header className="flex items-center gap-2 border-b border-[var(--color-charcoal-100)] px-4 py-2">
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="-ml-2 inline-flex size-tap items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
          >
            <X size={18} aria-hidden="true" />
          </button>
          <h2 id={titleId} className="text-title-3 text-[var(--color-charcoal-900)]">
            {title}
          </h2>
          {headerAction && <div className="-mr-2 ml-auto">{headerAction}</div>}
        </header>
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {description && (
            <p id={descId} className="mb-3 text-body-sm text-[var(--color-charcoal-900)]">
              {description}
            </p>
          )}
          {children}
        </div>
        {footer && (
          <footer className="border-t border-[var(--color-charcoal-100)] px-4 py-3 pb-[calc(--spacing(3)+env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}
