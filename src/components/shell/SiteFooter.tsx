'use client'

// #296 — from 744 up: © SocialUs, About, Terms, Privacy. Not on the screens
// that hide the nav: sign-in, onboarding and admin.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navHidden } from '@/components/BottomNav'

const LINKS = [
  { href: '/about', label: 'About' },
  { href: '/rules', label: 'Rules' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/report', label: 'Report a problem' },
]

export function SiteFooter() {
  const pathname = usePathname()
  if (navHidden(pathname)) return null
  return (
    <footer className="hidden md:block border-t border-[var(--color-border)]">
      <div className="mx-auto flex w-full max-w-shell items-center gap-6 gutter py-6 text-caption text-[var(--color-fg-muted)]">
        <span>© SocialUs</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-[var(--color-fg)]">
            {l.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
