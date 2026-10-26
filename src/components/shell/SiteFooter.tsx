'use client'

// #296 — from 744 up: © SocialUs, About, Terms, Privacy. Not on the screens
// that hide the nav: sign-in, onboarding and admin.
// #443 — on a phone only Report a problem shows, at the end of the screen and clear of the
// bottom nav, so it is reachable from every screen at every width.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navHidden } from '@/components/BottomNav'
import { COPY } from '@/lib/copy'

const LINKS = [
  { href: '/about', label: 'About' },
  { href: '/rules', label: 'Rules' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/report', label: 'Report a problem with the app' },
]

// #978 — footer links are rarely tapped and sit on every page; prefetching them queued five fetches
// ahead of the card a person actually tapped on a slow phone.
export function SiteFooter() {
  const pathname = usePathname()
  if (navHidden(pathname)) return null
  return (
    <footer className="border-t border-[var(--color-border)] pb-[calc(var(--nav-height)+env(safe-area-inset-bottom))] md:pb-0">
      <div data-testid="site-footer-phone" className="flex flex-col items-center py-2 md:hidden">
        <p data-testid="footer-decency" className="pt-2 text-caption text-[var(--color-fg-muted)]">{COPY.decencyThanks}</p>
        <Link href="/report" prefetch={false} className="inline-flex min-h-11 items-center px-3 text-caption text-[var(--color-fg-muted)] underline">
          Report a problem with the app
        </Link>
      </div>
      <div data-testid="site-footer-full" className="mx-auto hidden w-full max-w-shell items-center gap-6 gutter py-6 text-caption text-[var(--color-fg-muted)] md:flex">
        <span>© SocialUs</span>
        <span data-testid="footer-decency-full">{COPY.decencyThanks}</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} prefetch={false} className="hover:text-[var(--color-fg)]">
            {l.label}
          </Link>
        ))}
      </div>
    </footer>
  )
}
