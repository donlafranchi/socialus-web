'use client'

// T160 (Issue #62) — the ⋯ overflow menu.
//
// A new pattern in this codebase, and one that will spread: every surface that
// grows a second-order action ends up wanting one. So it is a container that
// takes its items, not a Report button wearing a menu costume.
//
// NOTE, raised on #62: the ticket says this "gets named with the picker recipe
// in design-language.md rather than invented here" — but design-language.md
// carries no picker recipe, and it lives in `ops-pattern`, which this repo
// must not commit to. Built to the house patterns instead (the T115 sheet's
// focus discipline, native semantics, charcoal tokens) and flagged for naming
// upstream.
//
// `role="menu"` with `role="menuitem"` children, because that is what a
// screen reader needs to announce "menu, 1 item" rather than "group of links".
// An item may be a button (signed in) or a link to sign-in (signed out) — the
// signed-out member must not hit a dead end or a disabled control.
//
// Focus rings are deliberately NOT declared here. globals.css sets a global
// `:focus-visible` outline in `--color-fg` (near-black); an accent-coloured
// override would be 2.9:1 on white, which T115 already flagged as too weak.
// Inheriting the global is both less code and the stronger indicator.
//
// KNOWN LIMIT, recorded for the next surface that adds a second item: there is
// no arrow-key roving tabindex between items. ARIA's menu pattern expects one,
// and Tab alone is what works today. With exactly one item that is invisible;
// with two it is a real gap, and this is the comment that should stop it from
// shipping unnoticed.

import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export interface OverflowItem {
  label: string
  /** A link item — rendered as an anchor. Mutually exclusive with onSelect. */
  href?: string
  onSelect?: () => void
}

interface Props {
  items: OverflowItem[]
  /** Overridable so a surface with two menus can distinguish them in tests. */
  testId?: string
  /** Lets an owner return focus here — a sheet opened from an item cannot,
   *  because the item is unmounted with the menu before the sheet mounts. */
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

export function PageOverflowMenu({ items, testId = 'page-overflow-menu', triggerRef: externalRef }: Props) {
  const [open, setOpen] = useState(false)
  const localRef = useRef<HTMLButtonElement>(null)
  const triggerRef = externalRef ?? localRef
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Dismiss on an outside click, the way every menu on the web does.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (menuRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // triggerRef is a ref container, stable for the life of the component —
    // listing it would re-run the listener wiring on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  return (
    <div className="relative" data-testid={testId}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-11 w-11 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="More options"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              close()
            }
          }}
          className="absolute right-0 z-40 mt-1 min-w-56 overflow-hidden rounded-md border border-[var(--color-charcoal-100)] bg-white py-1 shadow-overlay"
        >
          {items.map((item) =>
            item.href ? (
              <a
                key={item.label}
                role="menuitem"
                href={item.href}
                className="flex min-h-11 items-center px-4 text-sm text-[var(--color-charcoal-900)] hover:bg-neutral-100"
              >
                {item.label}
              </a>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  // Close without refocusing the ⋯: the item is about to open
                  // a sheet that takes focus itself, and returning focus here
                  // first would make it flicker back through the trigger.
                  close(false)
                  item.onSelect?.()
                }}
                className="flex min-h-11 w-full items-center px-4 text-left text-sm text-[var(--color-charcoal-900)] hover:bg-neutral-100"
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}
