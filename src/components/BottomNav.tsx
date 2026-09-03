'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Home, Search, User } from 'lucide-react'
import { AuthCtaButtons } from './AuthCtaButtons'

const TABS = [
  { href: '/', label: 'Home', icon: Home, match: (p: string) => p === '/' },
  { href: '/explore', label: 'Explore', icon: Search, match: (p: string) => p.startsWith('/explore') || p === '/map' },
  { href: '/you', label: 'You', icon: User, match: (p: string) => p.startsWith('/you') || p.startsWith('/following') },
]

export function BottomNav() {
  const pathname = usePathname()
  const router = useRouter()

  const handleClick = (href: string, isActive: boolean) => (e: React.MouseEvent) => {
    if (isActive) {
      e.preventDefault()
      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      router.push(href)
      e.preventDefault()
    }
  }

  return (
    <nav
      data-testid="bottom-nav"
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-[var(--color-nav-border)] bg-white md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <ul className="mx-auto flex h-11 w-full max-w-[420px] items-stretch justify-around">
        {TABS.map((t) => {
          const active = t.match(pathname ?? '/')
          const Icon = t.icon
          return (
            <li key={t.href} className="flex flex-1 items-stretch">
              <Link
                href={t.href}
                onClick={handleClick(t.href, active)}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
                className={`flex h-full w-full flex-col items-center justify-center gap-[3px] px-3 text-[9px] font-medium ${
                  active ? 'text-[var(--color-charcoal)]' : 'text-[var(--color-nav-inactive)]'
                }`}
              >
                <Icon size={20} strokeWidth={1.5} fill={active ? 'currentColor' : 'none'} />
                <span>{t.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function TopNavDesktop() {
  const pathname = usePathname()
  return (
    <nav
      data-testid="top-nav-desktop"
      aria-label="Primary"
      className="hidden md:flex sticky top-0 z-40 w-full items-center gap-6 border-b border-neutral-200 bg-white px-6 h-14"
    >
      <Link href="/" className="font-semibold text-[var(--color-accent)]">
        SocialUs
      </Link>
      <div className="flex items-center gap-4 text-sm">
        {TABS.map((t) => {
          const active = t.match(pathname ?? '/')
          const Icon = t.icon
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex items-center gap-1.5 ${active ? 'text-[var(--color-accent)] font-medium' : 'text-neutral-600 hover:text-neutral-900'}`}
            >
              <Icon size={16} strokeWidth={active ? 2.25 : 1.75} />
              {t.label}
            </Link>
          )
        })}
      </div>
      <div className="ml-auto">
        <AuthCtaButtons />
      </div>
    </nav>
  )
}
