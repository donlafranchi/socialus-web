'use client'

// #296 — from 744 up: © SocialUs, About, Terms, Privacy. Not on the screens
// that hide the nav: sign-in, onboarding and admin.
// #443 — on a phone only Report a problem shows, at the end of the screen and clear of the
// bottom nav, so it is reachable from every screen at every width.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { navHidden } from '@/components/shell/nav-hidden'
import { STATUS_PAGE_URL } from '@/lib/status-page'

const LINKS = [
  { href: '/about', label: 'About' },
  { href: '/terms', label: 'Terms' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/report', label: 'Report a problem with the app' },
]

// The status page is outside the app, so it opens in a new tab and answers when the app can't.
// Placeholder words for the copywriter ([public-is-draft]).
function StatusLink({ className }: { className: string }) {
  return (
    <a href={STATUS_PAGE_URL} target="_blank" rel="noopener noreferrer" className={className}>
      Status
    </a>
  )
}

// #978 — footer links are rarely tapped and sit on every page; prefetching them queued five fetches
// ahead of the card a person actually tapped on a slow phone.
export function SiteFooter() {
  const pathname = usePathname()
  if (navHidden(pathname)) return null
  return (
    <footer className="border-t border-[var(--color-border)] pb-[var(--dock-clearance)]">
      <div data-testid="site-footer-phone" className="flex justify-center py-2 md:hidden">
        <Link href="/report" prefetch={false} className="inline-flex min-h-11 items-center px-3 text-caption text-[var(--color-fg-muted)] underline">
          Report a problem with the app
        </Link>
        <StatusLink className="inline-flex min-h-11 items-center px-3 text-caption text-[var(--color-fg-muted)] underline" />
      </div>
      <div data-testid="site-footer-full" className="mx-auto hidden w-full max-w-shell items-center gap-6 gutter py-6 text-caption text-[var(--color-fg-muted)] md:flex">
        <span>© SocialUs</span>
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} prefetch={false} className="hover:text-[var(--color-fg)]">
            {l.label}
          </Link>
        ))}
        <StatusLink className="hover:text-[var(--color-fg)]" />
      </div>
    </footer>
  )
}
