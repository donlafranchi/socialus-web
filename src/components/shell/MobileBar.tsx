'use client'

// #1141 — the phone's bottom bar, copied from iOS Safari: Back and Forward on the left, the
// search field in the middle with an Area button on its left and Filters on its right, and
// the ⋯ menu on the far right. Search is the most-used thing, so it is the biggest thing.
// An exploration, not a ruling (the PM, 2026-11-01): Create and the List/Map switch live in ⋯.
// Phones only; from 744px up the header and the search row carry all of it.

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Ellipsis, MapPin, Search, SlidersHorizontal } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Sheet } from '@/components/ui/Sheet'
import { CreateSheet } from '@/components/create/CreateSheet'
import type { ExploreView } from '@/components/explore/ListMapToggle'
import { emptyTrail, moved, popped, tapBack, tapForward, type Trail } from './history-trail'
import { useKeyboardInset } from './useKeyboardInset'

const ICON = 'press inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100 disabled:text-neutral-300 disabled:hover:bg-transparent'
const ROW = 'press flex min-h-14 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-body font-medium text-[var(--color-fg)] hover:bg-neutral-100'

export interface MobileBarProps {
  query: string
  onQueryChange: (q: string) => void
  /** Enter in the field. Off Explore this sends the words to Explore. */
  onSubmit?: (q: string) => void
  /** Bump to focus the field. */
  focusRequest?: number
  /** Explore only: the Area and Filters buttons inside the field. */
  areaLabel?: string
  onOpenScope?: () => void
  filtersActive?: boolean
  onOpenFilters?: () => void
  /** Explore only: the List/Map switch, in ⋯. */
  view?: ExploreView
  onViewChange?: (v: ExploreView) => void
}

export function MobileBar(p: MobileBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { user } = useAuth()
  const inset = useKeyboardInset()
  const input = useRef<HTMLInputElement>(null)
  const more = useRef<HTMLButtonElement>(null)
  const [trail, setTrail] = useState<Trail>(emptyTrail)
  const [menu, setMenu] = useState(false)
  const [create, setCreate] = useState(false)

  const historyMove = useRef(false)
  useEffect(() => {
    const onPop = () => {
      historyMove.current = true
      setTrail((t) => popped(t))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  const lastPath = useRef(pathname)
  useEffect(() => {
    if (lastPath.current !== pathname) setTrail((t) => moved(t, historyMove.current))
    lastPath.current = pathname
    historyMove.current = false
  }, [pathname])

  useEffect(() => {
    if (p.focusRequest) input.current?.focus()
  }, [p.focusRequest])

  const back = () => {
    setTrail(tapBack)
    if (window.history.length > 1) router.back()
    else router.push('/explore')
  }
  const forward = () => {
    setTrail(tapForward)
    window.history.forward()
  }

  return (
    <>
      <nav
        data-testid="mobile-bar"
        aria-label="Search and navigation"
        style={{ bottom: inset, paddingBottom: inset ? 0 : 'env(safe-area-inset-bottom)' }}
        className="fixed inset-x-0 z-40 flex items-center gap-0.5 border-t border-[var(--color-nav-border)] bg-white px-2 pt-1.5 pb-1.5 md:hidden"
      >
        <button type="button" aria-label="Back" data-testid="bar-back" onClick={back} className={ICON}>
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Forward" data-testid="bar-forward" onClick={forward} disabled={trail.forward === 0} className={ICON}>
          <ChevronRight size={22} aria-hidden="true" />
        </button>

        <form
          role="search"
          className="mx-1 flex min-w-0 flex-1 items-center rounded-full border border-neutral-300 bg-neutral-50 focus-within:ring-2 focus-within:ring-[var(--color-accent)]"
          onSubmit={(e) => {
            e.preventDefault()
            p.onSubmit?.(p.query)
            input.current?.blur()
          }}
        >
          {p.onOpenScope ? (
            <button type="button" aria-label={p.areaLabel ? `Area: ${p.areaLabel} — change it` : 'Choose your area'} data-testid="bar-area" onClick={p.onOpenScope} className="press inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-accent)]">
              <MapPin size={16} aria-hidden="true" />
            </button>
          ) : (
            <Search size={16} aria-hidden="true" className="ml-3 shrink-0 text-neutral-400" />
          )}
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            aria-label="Search Browse"
            placeholder="Search"
            value={p.query}
            onChange={(e) => p.onQueryChange(e.target.value)}
            data-testid="bar-search-input"
            className="h-10 min-w-0 flex-1 bg-transparent px-1 text-base focus:outline-none"
          />
          {p.onOpenFilters && (
            <button
              type="button"
              onClick={p.onOpenFilters}
              aria-label={p.filtersActive ? 'Open filters — filters applied' : 'Open filters'}
              aria-haspopup="dialog"
              data-testid="bar-filter"
              className="press relative inline-flex size-10 shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-900)]"
            >
              <SlidersHorizontal size={16} aria-hidden="true" />
              {p.filtersActive && <span data-testid="bar-filter-dot" aria-hidden="true" className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[var(--color-accent)] ring-2 ring-white" />}
            </button>
          )}
        </form>

        <button ref={more} type="button" aria-label="More" aria-haspopup="dialog" aria-expanded={menu} data-testid="bar-more" onClick={() => setMenu(true)} className={ICON}>
          <Ellipsis size={22} aria-hidden="true" />
        </button>
      </nav>

      <Sheet open={menu} onClose={() => setMenu(false)} title="More" testId="bar-menu" returnFocusTo={more}>
        <ul className="flex flex-col gap-1 pb-[env(safe-area-inset-bottom)]">
          {user && (
            <li>
              <button type="button" data-testid="bar-menu-create" onClick={() => { setMenu(false); setCreate(true) }} className={ROW}>
                <span>Create<span className="block text-caption font-normal text-[var(--color-fg-muted)]">Post, event or a new Page</span></span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
              </button>
            </li>
          )}
          {p.view && p.onViewChange && (
            <li>
              <button type="button" data-testid="bar-menu-view" onClick={() => { setMenu(false); p.onViewChange!(p.view === 'list' ? 'map' : 'list') }} className={ROW}>
                <span>{p.view === 'list' ? 'Show the map' : 'Show the list'}</span>
                <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
              </button>
            </li>
          )}
          <li>
            <Link href={user ? '/you' : '/auth/login'} onClick={() => setMenu(false)} data-testid="bar-menu-you" className={ROW}>
              <span>{user ? 'You' : 'Sign in'}</span>
              <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-[var(--color-fg-muted)]" />
            </Link>
          </li>
        </ul>
      </Sheet>
      <CreateSheet open={create} onClose={() => setCreate(false)} returnFocusTo={more} />
    </>
  )
}
