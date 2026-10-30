'use client'

// #1094 — the one header, every width. Left: the way back (anywhere but Explore) and the name.
// Right: You. There is no bottom bar; the ➕ is CreateDock.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { navHidden } from './nav-hidden'
import { YouAvatar } from './YouAvatar'

const isHome = (p: string) => p === '/' || p.startsWith('/explore')

export function AppHeader() {
  const pathname = usePathname() ?? '/'
  const router = useRouter()
  if (navHidden(pathname)) return null
  return (
    <header
      data-testid="app-header"
      className="sticky top-0 z-40 flex h-nav-top w-full items-center gap-2 border-b border-[var(--color-nav-border)] bg-white gutter"
    >
      {!isHome(pathname) && (
        <button
          type="button"
          aria-label="Back"
          data-testid="header-back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push('/explore'))}
          className="-ml-2 inline-flex size-tap items-center justify-center rounded-full text-[var(--color-charcoal-900)] hover:bg-neutral-100"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </button>
      )}
      <Link href="/explore" className="font-semibold text-[var(--color-accent)]">
        SocialUs
      </Link>
      <div className="ml-auto -mr-2">
        <YouAvatar />
      </div>
    </header>
  )
}
