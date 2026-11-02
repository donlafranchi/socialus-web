'use client'

// Don, 2026-11-01 — the one ➕, every width, signed in only. A small menu: Start a Page and Propose
// something, then on Explore the List/Map switch the ⋯ used to hold. A Page's own posts start from its
// owner bar (Announce). Precedents: Apple HIG pull-down menus, Material's speed dial, Google Maps' ➕.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase'
import { getOwnPages } from '@/lib/member/own-pages'
import { Sheet } from '@/components/ui/Sheet'
import { useExploreSearch } from '@/components/shell/explore-search'
import { composerHref, createChoices, type CreatePage } from '@/lib/create/create-targets'

const ITEM = 'press flex min-h-11 w-full items-center rounded-md px-3 text-left text-body-sm font-medium text-[var(--color-fg)] hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none'
const ROW = 'press flex min-h-14 w-full items-center rounded-md px-3 py-2 text-body font-medium text-[var(--color-fg)] hover:bg-neutral-100'

export function CreateMenu() {
  const { user } = useAuth()
  const router = useRouter()
  const explore = useExploreSearch()
  const [open, setOpen] = useState(false)
  const [which, setWhich] = useState<CreatePage[] | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const pages = useRef<Promise<CreatePage[]> | null>(null)

  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const outside = (e: PointerEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])

  if (!user) return null

  const loadPages = () =>
    (pages.current ??= getOwnPages(createClient(), user.id).then(
      (own) => own.filter((p) => p.lifecycleState === 'active' && p.href).map((p) => ({ name: p.name, href: p.href! })),
      (e) => {
        // A failed read is not remembered: the next tap asks again.
        pages.current = null
        throw e
      },
    ))
  const prefetch = () => void loadPages().catch(() => {})
  const close = () => {
    setOpen(false)
    button.current?.focus()
  }
  const propose = async () => {
    setOpen(false)
    const own = await loadPages().catch(() => loadPages().catch(() => null))
    if (!own) return
    const choice = createChoices({ signedIn: true, pages: own }).find((c) => c.id === 'wonder')!
    if (choice.href) router.push(choice.href)
    else setWhich(own)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'Tab') {
      setOpen(false)
      return
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label="Create"
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="create-menu"
        onPointerEnter={prefetch}
        onClick={() => {
          prefetch()
          setOpen((o) => !o)
        }}
        className="press inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white hover:opacity-90"
      >
        <Plus size={22} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menu}
          role="menu"
          aria-label="Create"
          data-testid="create-menu-list"
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-[var(--z-panel)] mt-2 flex w-56 flex-col gap-0.5 rounded-xl border border-neutral-200 bg-white p-1.5 shadow-lift"
        >
          <Link role="menuitem" href="/create" onClick={() => setOpen(false)} data-testid="create-page" className={ITEM}>
            Start a Page
          </Link>
          <button role="menuitem" type="button" onClick={propose} data-testid="create-wonder" className={ITEM}>
            Propose something
          </button>
          {explore?.view && explore.onViewChange && (
            <>
              <div role="separator" className="my-1 border-t border-neutral-200" />
              <button
                role="menuitem"
                type="button"
                data-testid="create-menu-view"
                {...(explore.view === 'list' ? { 'data-map-tap': 'show_on_map' } : {})}
                onClick={() => {
                  close()
                  explore.onViewChange!(explore.view === 'list' ? 'map' : 'list')
                }}
                className={ITEM}
              >
                {explore.view === 'list' ? 'Show the map' : 'Show the list'}
              </button>
            </>
          )}
        </div>
      )}

      <Sheet open={which !== null} onClose={() => setWhich(null)} title="Which Page?" testId="create-which-page" returnFocusTo={button}>
        <ul className="flex flex-col gap-1 pb-[env(safe-area-inset-bottom)]">
          {which?.map((p) => (
            <li key={p.href}>
              <Link href={composerHref(p, 'wonder')} onClick={() => setWhich(null)} className={ROW}>
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  )
}
