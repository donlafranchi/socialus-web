'use client'

// #1094 — the one header, every width. Don, 2026-11-01 — one row: the way back (anywhere but Explore),
// the mark, the search pill, the ➕ (signed in) and You. On a phone it slides away scrolling down and
// comes back scrolling up, as Safari's and Airbnb's do; from 744px it stays.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { useScrollDirection } from '@/hooks/useScrollDirection'
import { useOverlayOpen } from '@/hooks/useOverlayOpen'
import { navHidden } from './nav-hidden'
import { YouAvatar } from './YouAvatar'
import { HeaderSearch } from './HeaderSearch'
import { CreateMenu } from '@/components/create/CreateMenu'

const isHome = (p: string) => p === '/' || p.startsWith('/explore')

export function AppHeader() {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  const overlayOpen = useOverlayOpen()
  const shown = useScrollDirection({ paused: overlayOpen, resetKey: pathname })
  if (navHidden(pathname)) return null
  return (
    <header
      data-testid="app-header"
      // No transform while shown: the search panel is fixed inside, and a transform would trap it.
      className={`sticky top-0 z-40 flex h-nav-top w-full items-center gap-2 border-b border-[var(--color-nav-border)] bg-white gutter transition-transform duration-200 ${shown ? '' : 'max-md:-translate-y-full'}`}
    >
      {!isHome(pathname) && (
        <button
          type="button"
          aria-label="Back"
          data-testid="header-back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/explore'))}
          className="-ml-2 inline-flex size-tap shrink-0 items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
      )}
      <Link href="/explore" aria-label="SocialUs" className="inline-flex min-h-11 shrink-0 items-center font-semibold text-[var(--color-accent)]">
        {/* The app icon's S (#921) on a phone; the name from 744px. */}
        <span aria-hidden="true" className="inline-flex size-8 items-center justify-center rounded-md bg-[var(--color-blue-900)] text-lg font-bold text-[var(--color-gold-300)] md:hidden">
          S
        </span>
        <span aria-hidden="true" className="hidden md:inline">SocialUs</span>
      </Link>
      <HeaderSearch />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <CreateMenu />
        <div className="-mr-2">
          <YouAvatar />
        </div>
      </div>
    </header>
  )
}
